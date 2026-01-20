# Design: NIP-17 DM Sync Application

## Context

Nostr's NIP-17 defines private direct messages using gift wrapping (NIP-59). Users specify their preferred messaging relays in a kind 10050 event. Different relays may have different subsets of a user's messages, creating fragmentation. This application helps users identify and sync those fragmented messages.

**Constraints:**
- Must work without access to user's private key (use external signers)
- Gift wraps are encrypted; we cannot and should not decrypt them
- Relays may require NIP-42 AUTH to serve kind 1059 events
- Mobile support requires NIP-55 (Amber) integration via URL callbacks

## Goals / Non-Goals

**Goals:**
- Provide simple login via NIP-07 (browser) and NIP-55 (mobile)
- Discover user's messaging relays from kind 10050
- Query gift-wrapped messages (kind 1059) from each relay
- Display per-relay statistics showing total and unique message counts
- Allow syncing unique messages from one relay to all others
- Show real-time sync progress

**Non-Goals:**
- Decrypting or displaying message content
- Composing or sending new messages
- Managing relay lists (modifying kind 10050)
- Key generation or storage
- Full messaging client functionality

## Decisions

### 1. Framework: SvelteKit + Svelte 5

**Decision:** Use SvelteKit with Svelte 5 runes for reactivity.

**Rationale:**
- Svelte 5 runes (`$state`, `$derived`) provide cleaner reactive patterns
- SvelteKit offers file-based routing and SSR capabilities
- Small bundle size important for web app performance
- TypeScript support for type safety

**Alternatives considered:**
- React/Next.js: Larger bundle, more boilerplate
- Plain Svelte: Would need manual routing setup

### 2. Nostr Library: nostr-tools

**Decision:** Use `nostr-tools` for all Nostr protocol operations.

**Rationale:**
- Official library maintained by nostr-protocol
- Includes NIP-44 encryption, NIP-59 gift wrap utilities
- Well-tested WebSocket relay handling
- Active community support

**Alternatives considered:**
- Custom implementation: More control but significant effort and risk
- Other libraries (nostr-js): Less mature, fewer NIP implementations

### 3. Signer Abstraction

**Decision:** Create a unified signer interface supporting NIP-07 and NIP-55.

```typescript
interface Signer {
  getPublicKey(): Promise<string>;
  signEvent(event: UnsignedEvent): Promise<Event>;
}
```

**Rationale:**
- Decouples app logic from signer implementation
- Allows seamless switching between browser extensions and mobile signers
- Future-proof for additional signer types (NIP-46 bunker, etc.)

### 4. NIP-55 via Callback URL

**Decision:** Implement NIP-55 using callback URLs rather than clipboard.

**Rationale:**
- Better UX - automatic return to app after signing
- More reliable than expecting user to paste from clipboard
- Standard pattern for mobile OAuth-style flows

**Implementation:**
- `/callback` route receives pubkey from Amber
- Store pubkey in sessionStorage/localStorage
- Redirect back to main app

### 5. No Message Decryption

**Decision:** Never decrypt gift wrap contents; treat them as opaque blobs.

**Rationale:**
- Decryption requires either private key or signer cooperation
- We only need event IDs to track uniqueness
- Simpler implementation with no crypto complexity
- Better privacy - app never sees message content

### 6. Relay Connection Strategy

**Decision:** Connect to all relays simultaneously with individual status tracking.

**Rationale:**
- Parallel connections minimize total wait time
- Per-relay status helps users understand issues
- Failed connections don't block other relays

**AUTH handling:**
- Store challenge when relay sends AUTH message
- Sign kind 22242 auth event when needed
- Retry subscription after successful AUTH

### 7. Unique Message Calculation

**Decision:** Calculate unique messages client-side by comparing event ID sets.

```typescript
// For each relay
uniqueToRelay[relay] = relayMessages[relay].filter(
  id => !otherRelays.some(r => relayMessages[r].has(id))
);
```

**Rationale:**
- Simple set operations, no complex algorithms
- Event IDs are guaranteed unique per event
- Comparison happens after all relays queried

### 8. Sync Strategy

**Decision:** Publish each unique message to all other messaging relays.

**Rationale:**
- Gift wraps are self-contained; no modifications needed
- Relays will deduplicate if they already have the event
- Publishing to all ensures maximum availability

**Error handling:**
- Track success/failure per relay per message
- Continue on individual failures
- Report final summary to user

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         SvelteKit App                           │
├─────────────────────────────────────────────────────────────────┤
│  Routes                                                         │
│  ├── +page.svelte (main dashboard)                             │
│  └── callback/+page.svelte (NIP-55 return)                     │
├─────────────────────────────────────────────────────────────────┤
│  Components                                                     │
│  ├── Login.svelte                                              │
│  ├── RelayList.svelte                                          │
│  ├── RelayCard.svelte                                          │
│  └── SyncModal.svelte                                          │
├─────────────────────────────────────────────────────────────────┤
│  Stores (Svelte 5 Runes)                                       │
│  ├── user.svelte.ts     (pubkey, signer, login state)          │
│  ├── relays.svelte.ts   (connections, messaging relays)        │
│  └── messages.svelte.ts (events by relay, unique tracking)     │
├─────────────────────────────────────────────────────────────────┤
│  Nostr Library                                                  │
│  ├── signer.ts   (NIP-07/NIP-55 abstraction)                   │
│  ├── relay.ts    (WebSocket manager, NIP-42 AUTH)              │
│  └── nip17.ts    (kind 10050, kind 1059 operations)            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      External Services                          │
├─────────────────────────────────────────────────────────────────┤
│  Signers                     │  Relays                         │
│  ├── NIP-07 Extensions       │  ├── Default (purplepag.es...)  │
│  │   (Alby, nos2x, etc.)     │  └── User's kind 10050 relays   │
│  └── NIP-55 Amber (mobile)   │                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
1. Login
   User clicks login → Signer returns pubkey → Store in user state

2. Discover Relays
   Connect to defaults → Query kind 10050 → Extract relay URLs → Store

3. Fetch Messages
   Connect to each messaging relay → Query kind 1059 #p:[pubkey]
   → Store events by relay → Calculate unique sets

4. Display Stats
   For each relay: total = events.size, unique = notInOtherRelays.size

5. Sync
   User clicks sync → Get unique events → Publish to other relays
   → Track progress → Show results
```

## Risks / Trade-offs

| Risk | Impact | Mitigation |
|------|--------|------------|
| Relay requires AUTH but we can't sign | Can't access messages | Detect auth-required, prompt user, auto-retry after AUTH |
| Large message count overwhelms UI | Poor performance | Implement pagination/virtualization if needed |
| Relay offline during sync | Incomplete sync | Show per-relay status, allow retry |
| NIP-55 callback fails | User stuck | Provide manual pubkey entry fallback |
| Rate limiting by relays | Slow sync | Add delays between publishes, show progress |

## Open Questions

1. Should we persist relay connections across page refreshes?
   - Current plan: No, reconnect on load for simplicity

2. Maximum messages to query per relay?
   - Current plan: 1000 limit, add pagination UI if users need more

3. Should we show message timestamps (from gift wrap created_at)?
   - Current plan: No, as these are randomized per NIP-17 for privacy
