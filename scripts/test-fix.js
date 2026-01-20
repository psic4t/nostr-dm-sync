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
    throw new Error(`Missing env var ${name}. Example: ${name}=nsec1... node scripts/test-fix.js`);
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

  try {
    const testEvent = finalizeEvent(
      {
        kind: 1,
        created_at: nowSec(),
        tags: [['p', pk]],
        content: `fix test ${Date.now()}`
      },
      sk
    );
    await relay.publish(testEvent);
  } catch (e) {
  }

  await sleep(2000);

  console.log('\n[Fix Test] Query giftwraps WITHOUT #p filter and filter client-side');
  const result = await new Promise((resolve) => {
    const events = [];
    const sub = relay.subscribe([{ kinds: [1059], limit: 50 }], {
      onevent: (e) => {
        events.push(e);
        const pTags = (e.tags || []).filter(t => t[0] === 'p' && typeof t[1] === 'string');
        if (pTags.some(ptag => ptag[1] === pk)) {
          console.log(`[Fix Test] Found matching giftwrap: ${short(e.id)}`);
        }
      },
      oneose: () => {
        const matched = events.filter(e => {
          const pTags = (e.tags || []).filter(t => t[0] === 'p' && typeof t[1] === 'string');
          return pTags.some(ptag => ptag[1] === pk);
        });
        console.log(`[Fix Test] EOSE: ${events.length} total, ${matched.length} for user`);
        sub.close();
        resolve({ total: events.length, matched: matched.length });
      },
      onclose: (r) => {
        console.log(`[Fix Test] CLOSED: ${r}`);
        sub.close();
        resolve({ total: events.length, matched: 0 });
      }
    });
    setTimeout(() => {
      sub.close();
      resolve({ total: events.length, matched: 0 });
    }, 10000);
  });

  console.log('\n[Result]');
  console.log(`Total kind 1059 events: ${result.total}`);
  console.log(`Events for user: ${result.matched}`);
  console.log(`\nConclusion: ${result.matched > 0 ? 'FIX WORKS - can fetch user events without #p filter' : 'FIX FAILED - still cannot fetch user events'}`);

  relay.close();
}

main().catch((e) => {
  console.error('[Fatal]', e);
  process.exit(1);
});
