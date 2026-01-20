# Project Context

## Purpose

nostr-dm-sync is a web application that helps Nostr users sync their NIP-17 gift-wrapped direct messages across all their messaging relays. It identifies messages that exist only on certain relays and allows users to publish them to their other relays, ensuring complete DM availability.

## Tech Stack

- **Framework**: SvelteKit with Svelte 5 (runes-based reactivity)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS v4
- **Nostr Library**: nostr-tools v2.10+
- **Build Tool**: Vite

## Project Structure

```
src/
├── lib/
│   ├── nostr/           # Nostr protocol utilities
│   │   ├── types.ts     # Event types, filters, constants
│   │   ├── signer.ts    # NIP-07 and NIP-55 signer implementations
│   │   ├── relay.ts     # WebSocket relay pool with NIP-42 AUTH
│   │   ├── nip17.ts     # Kind 10050 and 1059 operations
│   │   └── index.ts     # Re-exports
│   └── stores/          # Svelte 5 reactive stores
│       ├── user.svelte.ts     # User auth state
│       ├── relays.svelte.ts   # Relay connections
│       ├── messages.svelte.ts # Message tracking and sync
│       └── index.ts           # Re-exports
├── components/          # Svelte components
│   ├── Login.svelte     # NIP-07/NIP-55 login UI
│   ├── RelayList.svelte # Messaging relay grid
│   ├── RelayCard.svelte # Per-relay stats and sync button
│   └── SyncModal.svelte # Sync progress modal
└── routes/              # SvelteKit pages
    ├── +layout.svelte   # App shell
    ├── +page.svelte     # Main dashboard
    └── callback/+page.svelte # NIP-55 callback handler
```

## Project Conventions

### Code Style

- Use Svelte 5 runes (`$state`, `$derived`, `$effect`) for reactivity
- Export getter functions from stores for reactive access (e.g., `getUserState()`)
- Use TypeScript interfaces for all data structures
- Prefer async/await over raw Promises

### Architecture Patterns

- **Stores**: Centralized state management with Svelte 5 runes
- **Signer Abstraction**: Unified interface for NIP-07 and NIP-55 signers
- **Relay Pool**: Singleton pattern for managing WebSocket connections
- **Component Composition**: Small, focused components with props

### Naming Conventions

- Files: kebab-case for routes, PascalCase for components, camelCase for lib
- Svelte stores: `*.svelte.ts` suffix for files using runes
- Types: PascalCase for interfaces and types
- Constants: SCREAMING_SNAKE_CASE for kind numbers

## Domain Context

### Nostr NIPs Implemented

- **NIP-01**: Basic protocol (events, filters, relay messages)
- **NIP-07**: Browser extension signer (window.nostr)
- **NIP-17**: Private direct messages (gift wrapping)
- **NIP-42**: Client authentication to relays
- **NIP-55**: Android signer (Amber) via nostrsigner: scheme
- **NIP-59**: Gift wrap encryption (kind 1059)

### Key Concepts

- **Kind 10050**: User's messaging relay list
- **Kind 1059**: Gift-wrapped encrypted DM
- **Unique Messages**: Messages that exist only on one relay

## Important Constraints

- Never decrypt gift wrap contents (privacy)
- Rely on external signers (no private key access)
- Handle relay AUTH challenges gracefully
- Support both desktop (NIP-07) and mobile (NIP-55)

## External Dependencies

- Default relays for metadata discovery:
  - wss://purplepag.es
  - wss://nos.lol
  - wss://relay.damus.io
  - wss://nostr.data.haus
