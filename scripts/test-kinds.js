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
    throw new Error(`Missing env var ${name}. Example: ${name}=nsec1... node scripts/test-kinds.js`);
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

async function queryWithPFilter(relay, kind, pk, label) {
  const events = await new Promise((resolve) => {
    const evts = [];
    const sub = relay.subscribe([{ kinds: [kind], '#p': [pk], limit: 10 }], {
      onevent: (e) => evts.push(e),
      oneose: () => {
        sub.close();
        resolve(evts);
      },
      onclose: () => {
        resolve(evts);
      }
    });
    setTimeout(() => {
      sub.close();
      resolve(evts);
    }, 5000);
  });
  console.log(`[${label}] kind ${kind} with #p: ${events.length} events`);
  return events.length;
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
        content: `test kinds ${Date.now()}`
      },
      sk
    );
    await relay.publish(testEvent);
  } catch (e) {
  }

  await sleep(2000);

  const results = [];

  console.log('\n[Testing #p filter for different kinds]');

  const kindsToTest = [1, 3, 4, 5, 6, 7, 9735, 1059];

  for (const kind of kindsToTest) {
    await sleep(1000);
    const count = await queryWithPFilter(relay, kind, pk, `Test kind ${kind}`);
    results.push({ kind, count });
  }

  console.log('\n[Results]');
  console.table(results);

  const hasAnyResults = results.some(r => r.count > 0);
  console.log(`\nConclusion: ${hasAnyResults ? '#p filter works for some kinds' : '#p filter DOES NOT WORK for any tested kind'}`);

  relay.close();
}

main().catch((e) => {
  console.error('[Fatal]', e);
  process.exit(1);
});
