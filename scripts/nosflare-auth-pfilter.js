#!/usr/bin/env node

import { Relay, finalizeEvent, getPublicKey, nip19 } from 'nostr-tools';
import { nip59 } from 'nostr-tools';

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
    throw new Error(`Missing env var ${name}. Example: ${name}=nsec1... node scripts/nosflare-auth-pfilter.js`);
  }
  return v;
}

function decodeNsecToSecretKeyBytes(nsec) {
  const dec = nip19.decode(nsec);
  if (dec.type !== 'nsec') {
    throw new Error(`Expected nsec, got ${dec.type}`);
  }
  // dec.data is Uint8Array
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
        // do not auto-close; let timeout decide so we can observe late AUTH/NOTICE/CLOSED
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
        // ignore
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

  // Try to hook raw ws frames (nostr-tools Relay keeps ws on the instance)
  const relayAny = relay;
  const ws = relayAny.ws;
  if (ws && typeof ws.addEventListener === 'function') {
    ws.addEventListener('message', (ev) => {
      const data = typeof ev.data === 'string' ? ev.data : '[non-string]';
      if (typeof data === 'string' && data.startsWith('["EVENT"')) return;
      console.log(`[WS<-] ${data}`);
    });
  } else {
    console.log('[WS] Could not attach message listener (ws not accessible)');
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
    // nostr-tools expects a VerifiedEvent returned by finalizeEvent
    return finalizeEvent(evt, sk);
  };

  // Observe auth result by temporarily wrapping relay.auth() behavior
  const oldAuth = relayAny.auth?.bind(relayAny);
  if (oldAuth) {
    relayAny.auth = async (...args) => {
      console.log('[AUTH] relay.auth() called');
      const res = await oldAuth(...args);
      authAccepted = true;
      // Clear the stored challenge so nostr-tools will accept new challenges.
      // Some relays send a fresh challenge per operation.
      relayAny.challenge = undefined;
      console.log('[AUTH] relay.auth() resolved');
      return res;
    };
  }

  console.log('\n[Test A] REQ giftwraps BEFORE forcing AUTH');
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

  // Allow some extra time for a late AUTH message after EOSE
  console.log('[Test A] waiting 1500ms for late AUTH/NOTICE...');
  await sleep(1500);

  console.log('\n[Test B] Force AUTH challenge via publish attempt');
  // Use a kind 1 event because it is easy to fetch back by id and by #p.
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

  // Wait for auth flow to complete, if any
  console.log('[Test B] waiting 2000ms for auth handshake...');
  await sleep(2000);

  // Try an explicit auth if we have a challenge but haven't completed auth yet.
  if (!authAccepted && relayAny.challenge && relayAny.auth && relay.onauth) {
    try {
      console.log('[Test B] attempting explicit relay.auth(onauth)...');
      await relayAny.auth(relay.onauth);
    } catch (e) {
      console.log(`[Test B] explicit relay.auth failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`[Test B] authAccepted=${authAccepted} hasChallenge=${Boolean(relayAny.challenge)} forcePublished=${forcePublished}`);

  console.log('\n[Test B2] Fetch kind 1 by ids + #p after auth');
  const b2_id = await subscribeOnce(relay, [{ ids: [forceEvt.id], limit: 1 }], { label: 'B2_id', timeoutMs: 7000 });
  const b2_p = await subscribeOnce(
    relay,
    [
      {
        kinds: [1],
        '#p': [pk],
        limit: 10
      }
    ],
    { label: 'B2_p', timeoutMs: 7000 }
  );

  console.log('\n[Test C1] Publish a fake giftwrap (kind 1059) signed by our key');
  const fakeGiftwrap = finalizeEvent(
    {
      kind: 1059,
      created_at: nowSec(),
      tags: [['p', pk]],
      content: `fake giftwrap probe ${Date.now()}`
    },
    sk
  );

  console.log(`[Test C1] fake id=${fakeGiftwrap.id} pubkey=${short(fakeGiftwrap.pubkey)} tags=${JSON.stringify(fakeGiftwrap.tags)}`);

  let fakePublished = false;
  try {
    await relay.publish(fakeGiftwrap);
    fakePublished = true;
    console.log('[Test C1] publish(fake kind=1059) OK');
  } catch (e) {
    console.log(`[Test C1] publish(fake kind=1059) failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!fakePublished) {
    console.log('[Test C1] waiting 1500ms then retry publish(fake kind=1059)...');
    await sleep(1500);
    try {
      await relay.publish(fakeGiftwrap);
      fakePublished = true;
      console.log('[Test C1] publish(fake kind=1059) OK on retry');
    } catch (e) {
      console.log(`[Test C1] publish(fake kind=1059) retry failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log('\n[Test C2] Publish a real NIP-59 giftwrap-to-self (kind 1059, random pubkey)');
  const realGiftwrap = nip59.wrapEvent(
    {
      kind: 14,
      // nip59 randomizes created_at itself; keep it minimal here.
      tags: [['p', pk]],
      content: `dm self test ${Date.now()}`
    },
    sk,
    pk
  );

  console.log(`[Test C2] real id=${realGiftwrap.id} pubkey=${short(realGiftwrap.pubkey)} tags=${JSON.stringify(realGiftwrap.tags)}`);

  let realPublished = false;
  try {
    await relay.publish(realGiftwrap);
    realPublished = true;
    console.log('[Test C2] publish(real giftwrap) OK');
  } catch (e) {
    console.log(`[Test C2] publish(real giftwrap) failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!realPublished) {
    console.log('[Test C2] waiting 1500ms then retry publish(real giftwrap)...');
    await sleep(1500);
    try {
      await relay.publish(realGiftwrap);
      realPublished = true;
      console.log('[Test C2] publish(real giftwrap) OK on retry');
    } catch (e) {
      console.log(`[Test C2] publish(real giftwrap) retry failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log('\n[Test D1] Fetch by ids:[fakeGiftwrap.id]');
  const d1 = await subscribeOnce(relay, [{ ids: [fakeGiftwrap.id], limit: 1 }], { label: 'D1', timeoutMs: 7000 });

  console.log('\n[Test D2] Fetch by ids:[realGiftwrap.id]');
  const d2 = await subscribeOnce(relay, [{ ids: [realGiftwrap.id], limit: 1 }], { label: 'D2', timeoutMs: 7000 });

  console.log('\n[Test D3] Fetch by kinds:[1059] + #p:[pk]');
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

  // Report
  console.log('\n[Result]');
  console.log(
    JSON.stringify(
      {
        relay: RELAY_URL,
        pubkey: pk,
        A: { events: a.events.length, reason: a.reason },
        B: { authAccepted, hasChallenge: Boolean(relayAny.challenge), forcePublished },
        B2_id: { events: b2_id.events.length, reason: b2_id.reason },
        B2_p: { events: b2_p.events.length, reason: b2_p.reason },
        C1: { fakePublished, fakeGiftwrapId: fakeGiftwrap.id },
        C2: { realPublished, realGiftwrapId: realGiftwrap.id },
        D1: { events: d1.events.length, reason: d1.reason },
        D2: { events: d2.events.length, reason: d2.reason },
        D3: { events: d3.events.length, reason: d3.reason }
      },
      null,
      2
    )
  );

  try {
    relay.close();
  } catch {
    // ignore
  }
}

main().catch((e) => {
  console.error('[Fatal]', e);
  process.exit(1);
});
