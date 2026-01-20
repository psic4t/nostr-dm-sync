# Change: Add NIP-17 DM Sync Application

## Why

Nostr users store their NIP-17 gift-wrapped direct messages across multiple messaging relays (defined in kind 10050). Messages may exist on some relays but not others, causing incomplete message history depending on which relay a client queries. Users need a tool to identify and sync unique messages across all their messaging relays to ensure complete DM availability.

## What Changes

- **NEW**: SvelteKit web application for syncing NIP-17 direct messages
- **NEW**: Authentication via NIP-07 (browser extensions) and NIP-55 (Amber mobile signer)
- **NEW**: Relay connection management with NIP-42 AUTH support
- **NEW**: Message discovery across user's kind 10050 messaging relays
- **NEW**: Per-relay message statistics (total count, unique count)
- **NEW**: Sync functionality to publish unique messages to other relays
- **NEW**: Real-time sync progress modal with per-relay status

## Impact

- **Affected specs**: 
  - `authentication` (new) - NIP-07/NIP-55 signer handling
  - `relay-management` (new) - WebSocket connections, NIP-42 AUTH
  - `message-discovery` (new) - Kind 10050 and 1059 querying
  - `message-sync` (new) - Publishing gift wraps to relays
  - `ui-dashboard` (new) - Login, relay list, sync modal components

- **Affected code**: 
  - `src/lib/nostr/` - Core Nostr protocol library
  - `src/lib/stores/` - Svelte 5 reactive stores
  - `src/routes/` - SvelteKit pages
  - `src/components/` - Svelte UI components

- **Dependencies**:
  - SvelteKit + Svelte 5
  - nostr-tools (NIP-44, NIP-59 support)
  - Tailwind CSS

## Out of Scope

- Message decryption (we only sync encrypted gift wraps)
- Message viewing/reading
- Sending new messages
- Key management (relies on external signers)
