# Tasks: Add NIP-17 DM Sync Application

## 1. Project Setup

- [x] 1.1 Initialize SvelteKit project with TypeScript (`npx sv create`)
- [x] 1.2 Install dependencies: `nostr-tools`, `@noble/hashes`
- [x] 1.3 Install and configure Tailwind CSS
- [x] 1.4 Configure TypeScript strict mode
- [x] 1.5 Create base directory structure (`src/lib/nostr`, `src/lib/stores`, `src/components`)

## 2. Nostr Core Library

- [x] 2.1 Create `src/lib/nostr/types.ts` with Nostr event types and interfaces
- [x] 2.2 Create `src/lib/nostr/signer.ts` with Signer interface
- [x] 2.3 Implement NIP-07 signer (window.nostr detection, getPublicKey, signEvent)
- [x] 2.4 Implement NIP-55 signer (nostrsigner: URL generation, callback handling)
- [x] 2.5 Create `src/lib/nostr/relay.ts` with WebSocket connection management
- [x] 2.6 Implement subscription handling (REQ, CLOSE, EVENT, EOSE)
- [x] 2.7 Implement NIP-42 AUTH challenge/response handling
- [x] 2.8 Implement event publishing with OK response handling
- [x] 2.9 Create `src/lib/nostr/nip17.ts` with kind 10050 query function
- [x] 2.10 Add kind 1059 (gift wrap) query function
- [x] 2.11 Create `src/lib/nostr/index.ts` with re-exports

## 3. Svelte Stores

- [x] 3.1 Create `src/lib/stores/user.svelte.ts` with user state (pubkey, signerType, isLoggedIn)
- [x] 3.2 Add login/logout functions to user store
- [x] 3.3 Create `src/lib/stores/relays.svelte.ts` with relay state
- [x] 3.4 Add default relays configuration
- [x] 3.5 Add messaging relays state (from kind 10050)
- [x] 3.6 Add relay connection status tracking
- [x] 3.7 Create `src/lib/stores/messages.svelte.ts` with message state
- [x] 3.8 Implement messages-by-relay tracking
- [x] 3.9 Implement unique message calculation logic
- [x] 3.10 Create `src/lib/stores/index.ts` with re-exports

## 4. Components

- [x] 4.1 Create `src/components/Login.svelte`
- [x] 4.2 Implement NIP-07 detection and login button
- [x] 4.3 Implement NIP-55 (Amber) login button
- [x] 4.4 Add login error handling and display
- [x] 4.5 Create `src/components/RelayList.svelte`
- [x] 4.6 Implement relay card grid/list layout
- [x] 4.7 Add loading state while fetching relays
- [x] 4.8 Add "no relays configured" empty state
- [x] 4.9 Create `src/components/RelayCard.svelte`
- [x] 4.10 Implement connection status indicator
- [x] 4.11 Implement message count display (total and unique)
- [x] 4.12 Implement sync button with count badge
- [x] 4.13 Create `src/components/SyncModal.svelte`
- [x] 4.14 Implement modal overlay and dialog
- [x] 4.15 Implement progress bar and message count
- [x] 4.16 Implement per-relay status list
- [x] 4.17 Implement completion summary display
- [x] 4.18 Add close button and confirmation for cancellation

## 5. Routes

- [x] 5.1 Create `src/routes/+layout.svelte` with app shell
- [x] 5.2 Add Tailwind CSS imports to layout
- [x] 5.3 Create `src/routes/+page.svelte` as main dashboard
- [x] 5.4 Implement conditional rendering (login vs dashboard)
- [x] 5.5 Wire up relay discovery on login
- [x] 5.6 Wire up message fetching from messaging relays
- [x] 5.7 Create `src/routes/callback/+page.svelte` for NIP-55
- [x] 5.8 Implement pubkey extraction from URL params
- [x] 5.9 Implement redirect to main page after callback

## 6. Integration

- [x] 6.1 Connect Login component to user store
- [x] 6.2 Connect RelayList to relays and messages stores
- [x] 6.3 Connect RelayCard to sync modal trigger
- [x] 6.4 Implement sync execution logic (publish to all other relays)
- [x] 6.5 Connect sync progress to SyncModal display
- [x] 6.6 Implement post-sync statistics refresh

## 7. Styling and Polish

- [x] 7.1 Style Login screen with Tailwind
- [x] 7.2 Style RelayCard with status colors
- [x] 7.3 Style SyncModal with progress indicators
- [x] 7.4 Add responsive breakpoints for mobile
- [x] 7.5 Add loading spinners and transitions

## 8. Testing and Verification

- [ ] 8.1 Test NIP-07 login with browser extension (Alby, nos2x)
- [ ] 8.2 Test NIP-55 login flow with Amber (if mobile available)
- [ ] 8.3 Test relay connection with default relays
- [ ] 8.4 Test kind 10050 discovery
- [ ] 8.5 Test kind 1059 message fetching
- [ ] 8.6 Test unique message calculation
- [ ] 8.7 Test sync to multiple relays
- [ ] 8.8 Test NIP-42 AUTH flow with protected relays
- [ ] 8.9 Test error handling (relay offline, auth failure)
- [ ] 8.10 Test mobile responsiveness

## Dependencies

- Task 2.x depends on 1.x (project setup)
- Task 3.x depends on 2.x (needs nostr library)
- Task 4.x depends on 3.x (components use stores)
- Task 5.x depends on 4.x (routes use components)
- Task 6.x depends on 5.x (integration wires everything)
- Task 7.x can run in parallel with 6.x
- Task 8.x depends on 6.x (need working app to test)

## Parallelizable Work

- Tasks 2.2-2.4 (signer) can parallel with 2.5-2.8 (relay)
- Tasks 3.1-3.2 (user store) can parallel with 3.3-3.6 (relay store)
- Tasks 4.1-4.4 (Login) can parallel with 4.5-4.8 (RelayList)
- Tasks 7.1-7.5 (styling) can parallel with 6.x (integration)
