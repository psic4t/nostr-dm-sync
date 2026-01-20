#!/usr/bin/env node

import { Relay, finalizeEvent, getPublicKey, nip19 } from 'nostr-tools';

const RELAY_URL = 'wss://relay.nosflare.com';

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function short(s) {
  if (!s) return String(s);
  return s.length > 16 ? `${s.slice(0, 8)}...${s.slice(-4)}` : s;
}

function mustGetEnv(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing env var ${name}. Example: ${name}=nsec1... node scripts/test-nosflare-auth.js`);
  }
  return v;
}

function decodeNsecToSecretKeyBytes(nsec) {
  const dec = nip19.decode(nsec);
  if (dec.type !== 'nsec') {
    throw new Error(`Expected nsec, got ${dec.type}`);
  }
  return dec.data;
}

async function subscribeOnce(relay, filters, { label, timeoutMs = 6000 } = {}) {
  const id = `${label || 'sub'}:${Math.random().toString(16).slice(2)}`;
  const events = [];

  return await new Promise((resolve) => {
    let done = false;
    let eoseAt = null;

    const finish = (reason) => {
      if (done) return;
      done = true;
      resolve({ id, events, eoseAt, reason });
    };

    const sub = relay.subscribe(filters, {
      id,
      onevent(evt) {
        events.push(evt);
        console.log(`[${label}] EVENT kind=${evt.kind} id=${short(evt.id)} created_at=${evt.created_at}`);
      },
      oneose() {
        eoseAt = Date.now();
        console.log(`[${label}] EOSE events=${events.length}`);
      },
      onclose(reason) {
        console.log(`[${label}] CLOSED reason=${JSON.stringify(reason)}`);
        finish(reason);
      }
    });

    setTimeout(() => {
      try {
        sub.close('timeout');
      } catch {
      }
      finish('timeout');
    }, timeoutMs);
  });
}

async function main() {
  const nsec = mustGetEnv('NOSFLARE_NSEC');
  const sk = decodeNsecToSecretKeyBytes(nsec);
  const pk = getPublicKey(sk);

  console.log(`[Init] relay=${RELAY_URL}`);
  console.log(`[Init] pubkey=${pk}`);

  const relay = await Relay.connect(RELAY_URL);
  console.log('[Relay] connected');

  const relayAny = relay;
  const ws = relayAny.ws;
  if (ws && typeof ws.addEventListener === 'function') {
    ws.addEventListener('message', (ev) => {
      const data = typeof ev.data === 'string' ? ev.data : '[non-string]';
      if (typeof data === 'string' && data.startsWith('["EVENT"')) return;
      console.log(`[WS<-] ${data}`);
    });
  } else {
    console.log('[WS] Could not attach message listener');
  }

  const origSend = ws?.send?.bind(ws);
  if (origSend) {
    ws.send = (data) => {
      const s = typeof data === 'string' ? data : '[non-string]';
      if (typeof s === 'string' && s.startsWith('["EVENT"')) {
        console.log(`[WS->] ["EVENT", ...]`);
      } else {
        console.log(`[WS->] ${s}`);
      }
      return origSend(data);
    };
  }

  let authAccepted = false;
  relay.onauth = async (evt) => {
    console.log(`[AUTH] challenge received, signing kind=${evt.kind} tags=${JSON.stringify(evt.tags)}`);
    return finalizeEvent(evt, sk);
  };

  const oldAuth = relayAny.auth?.bind(relayAny);
  if (oldAuth) {
    relayAny.auth = async (...args) => {
      console.log('[AUTH] relay.auth() called');
      const res = await oldAuth(...args);
      authAccepted = true;
      relayAny.challenge = undefined;
      console.log('[AUTH] relay.auth() resolved');
      return res;
    };
  }

  console.log('\n[Test A] Query giftwraps by #p tag BEFORE AUTH');
  const a = await subscribeOnce(
    relay,
    [
      {
        kinds: [1059],
        '#p': [pk],
        limit: 20
      }
    ],
    { label: 'A', timeoutMs: 7000 }
  );

  console.log('[Test A] waiting 1500ms for late AUTH/NOTICE...');
  await sleep(1500);

  console.log('\n[Test B] Force AUTH via publish attempt');
  const forceEvt = finalizeEvent(
    {
      kind: 1,
      created_at: nowSec(),
      tags: [['p', pk]],
      content: `nosflare auth probe ${Date.now()}`
    },
    sk
  );

  let forcePublished = false;
  try {
    await relay.publish(forceEvt);
    forcePublished = true;
    console.log('[Test B] publish(kind=1) OK');
  } catch (e) {
    console.log(`[Test B] publish(kind=1) failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  console.log('[Test B] waiting 2000ms for auth handshake...');
  await sleep(2000);

  if (!authAccepted && relayAny.challenge && relayAny.auth && relay.onauth) {
    try {
      console.log('[Test B] attempting explicit relay.auth(onauth)...');
      await relayAny.auth(relay.onauth);
    } catch (e) {
      console.log(`[Test B] explicit relay.auth failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`[Test B] authAccepted=${authAccepted} hasChallenge=${Boolean(relayAny.challenge)} forcePublished=${forcePublished}`);

  console.log('\n[Test C1] Fetch by id (baseline test)');
  const c1 = await subscribeOnce(relay, [{ ids: [forceEvt.id], limit: 1 }], { label: 'C1', timeoutMs: 7000 });

  console.log('\n[Test C2] Fetch kind 1 by #p tag AFTER AUTH');
  const c2 = await subscribeOnce(
    relay,
    [
      {
        kinds: [1],
        '#p': [pk],
        limit: 10
      }
    ],
    { label: 'C2', timeoutMs: 7000 }
  );

  console.log('\n[Test C3] Fetch kind 1 by id+kinds+#p tag AFTER AUTH');
  const c3 = await subscribeOnce(
    relay,
    [
      {
        kinds: [1],
        ids: [forceEvt.id],
        '#p': [pk],
        limit: 1
      }
    ],
    { label: 'C3', timeoutMs: 7000 }
  );

  console.log('\n[Test D1] Publish a fake giftwrap');
  const fakeGiftwrap = finalizeEvent(
    {
      kind: 1059,
      created_at: nowSec(),
      tags: [['p', pk]],
      content: `fake giftwrap probe ${Date.now()}`
    },
    sk
  );

  console.log(`[Test D1] fake id=${fakeGiftwrap.id} pubkey=${short(fakeGiftwrap.pubkey)}`);

  let fakePublished = false;
  try {
    await relay.publish(fakeGiftwrap);
    fakePublished = true;
    console.log('[Test D1] publish(fake kind=1059) OK');
  } catch (e) {
    console.log(`[Test D1] publish(fake kind=1059) failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!fakePublished) {
    console.log('[Test D1] waiting 1500ms then retry...');
    await sleep(1500);
    try {
      await relay.publish(fakeGiftwrap);
      fakePublished = true;
      console.log('[Test D1] publish(fake kind=1059) OK on retry');
    } catch (e) {
      console.log(`[Test D1] publish(fake kind=1059) retry failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log('\n[Test D2] Fetch giftwrap by id AFTER AUTH');
  const d2 = await subscribeOnce(relay, [{ ids: [fakeGiftwrap.id], limit: 1 }], { label: 'D2', timeoutMs: 7000 });

  console.log('\n[Test D3] Fetch giftwraps by #p tag AFTER AUTH');
  const d3 = await subscribeOnce(
    relay,
    [
      {
        kinds: [1059],
        '#p': [pk],
        limit: 20
      }
    ],
    { label: 'D3', timeoutMs: 7000 }
  );

  console.log('\n[Test D4] Fetch giftwrap by id+kinds+#p tag AFTER AUTH');
  const d4 = await subscribeOnce(
    relay,
    [
      {
        kinds: [1059],
        ids: [fakeGiftwrap.id],
        '#p': [pk],
        limit: 1
      }
    ],
    { label: 'D4', timeoutMs: 7000 }
  );

  console.log('\n[Result]');
  console.log(
    JSON.stringify(
      {
        relay: RELAY_URL,
        pubkey: pk,
        A: { events: a.events.length, reason: a.reason },
        B: { authAccepted, hasChallenge: Boolean(relayAny.challenge), forcePublished },
        C1: { events: c1.events.length, reason: c1.reason },
        C2: { events: c2.events.length, reason: c2.reason },
        C3: { events: c3.events.length, reason: c3.reason },
        D1: { fakePublished, fakeGiftwrapId: fakeGiftwrap.id },
        D2: { events: d2.events.length, reason: d2.reason },
        D3: { events: d3.events.length, reason: d3.reason },
        D4: { events: d4.events.length, reason: d4.reason }
      },
      null,
      2
    )
  );

  try {
    relay.close();
  } catch {
  }
}

main().catch((e) => {
  console.error('[Fatal]', e);
  process.exit(1);
});
