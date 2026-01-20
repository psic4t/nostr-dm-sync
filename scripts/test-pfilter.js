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
    throw new Error(`Missing env var ${name}. Example: ${name}=nsec1... node scripts/test-pfilter.js`);
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
  }

  relay.onauth = async (evt) => {
    console.log(`[AUTH] challenge received`);
    return finalizeEvent(evt, sk);
  };

  const oldAuth = relayAny.auth?.bind(relayAny);
  if (oldAuth) {
    relayAny.auth = async (...args) => {
      console.log('[AUTH] relay.auth() called');
      const res = await oldAuth(...args);
      relayAny.challenge = undefined;
      console.log('[AUTH] relay.auth() resolved');
      return res;
    };
  }

  await sleep(500);

  console.log('\n[Step 1] Force AUTH');
  try {
    const testEvent = finalizeEvent(
      {
        kind: 1,
        created_at: nowSec(),
        tags: [['p', pk]],
        content: `pfilter test ${Date.now()}`
      },
      sk
    );
    await relay.publish(testEvent);
    console.log('[Step 1] AUTH established via publish');
  } catch (e) {
    console.log('[Step 1] publish triggered AUTH:', e instanceof Error ? e.message : String(e));
  }

  await sleep(2000);

  console.log('\n[Step 2] Query kind 1 by #p (expected: 0 events)');
  const result1 = await new Promise((resolve) => {
    const events = [];
    const sub = relay.subscribe([{ kinds: [1], '#p': [pk], limit: 10 }], {
      onevent: (e) => events.push(e),
      oneose: () => {
        console.log(`[Step 2] EOSE: ${events.length} events`);
        sub.close();
        resolve(events.length);
      },
      onclose: (r) => {
        console.log(`[Step 2] CLOSED: ${r}`);
        resolve(events.length);
      }
    });
    setTimeout(() => {
      sub.close();
      resolve(events.length);
    }, 5000);
  });

  await sleep(1000);

  console.log('\n[Step 3] Query kind 1 without #p filter (baseline)');
  const result2 = await new Promise((resolve) => {
    const events = [];
    const sub = relay.subscribe([{ kinds: [1], authors: [pk], limit: 10 }], {
      onevent: (e) => events.push(e),
      oneose: () => {
        console.log(`[Step 3] EOSE: ${events.length} events`);
        const pTags = events.flatMap(e => (e.tags || []).filter(t => t[0] === 'p').map(t => t[1]));
        console.log(`[Step 3] Found #p tags: ${JSON.stringify(pTags.map(short))}`);
        sub.close();
        resolve(events.length);
      },
      onclose: (r) => {
        console.log(`[Step 3] CLOSED: ${r}`);
        resolve(events.length);
      }
    });
    setTimeout(() => {
      sub.close();
      resolve(events.length);
    }, 5000);
  });

  await sleep(1000);

  console.log('\n[Step 4] Test if relay returns ALL kind 1 events when #p filter is present');
  const result3 = await new Promise((resolve) => {
    const events = [];
    const sub = relay.subscribe([{ kinds: [1], '#p': [pk], limit: 10 }], {
      onevent: (e) => {
        events.push(e);
        console.log(`[Step 4] EVENT kind=${e.kind} tags=${JSON.stringify((e.tags || []).filter(t => t[0] === 'p'))}`);
      },
      oneose: () => {
        console.log(`[Step 4] EOSE: ${events.length} events`);
        sub.close();
        resolve(events.length);
      },
      onclose: (r) => {
        console.log(`[Step 4] CLOSED: ${r}`);
        resolve(events.length);
      }
    });
    setTimeout(() => {
      sub.close();
      resolve(events.length);
    }, 5000);
  });

  console.log('\n[Summary]');
  console.log(`Query by #p: ${result1} events`);
  console.log(`Query by authors (baseline): ${result2} events`);
  console.log(`Query by #p (step 4): ${result3} events`);
  console.log(`\nConclusion: ${result1 === 0 && result2 > 0 ? 'RELAY DOES NOT SUPPORT #P FILTERING' : 'RELAY SUPPORTS #P FILTERING'}`);

  relay.close();
}

main().catch((e) => {
  console.error('[Fatal]', e);
  process.exit(1);
});
