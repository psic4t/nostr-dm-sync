import type { NostrEvent } from './types';
import type { Filter } from 'nostr-tools';
import { KIND_RELAY_LIST_METADATA, KIND_GIFT_WRAP } from './types';
import { queryRelays, queryRelay, closeRelays, supportsPtagFilter } from './relay';

// Pagination constants
const BATCH_SIZE = 500;
const BATCH_TIMEOUT = 10000; // 10 seconds per batch
const MAX_BATCHES = 20; // 10,000 events max

/**
 * Default relays for discovering user metadata
 */
export const DEFAULT_RELAYS = [
	'wss://purplepag.es',
	'wss://nos.lol',
	'wss://relay.damus.io',
	'wss://nostr.data.haus'
];

/**
 * Fetch the user's messaging relay list (kind 10050) from default relays
 */
export async function fetchMessagingRelays(pubkey: string): Promise<string[]> {
	console.log('[NIP-17] Fetching messaging relays for', pubkey.slice(0, 8) + '...');

	const events = await queryRelays(
		DEFAULT_RELAYS,
		{
			kinds: [KIND_RELAY_LIST_METADATA],
			authors: [pubkey],
			limit: 10
		},
		5000 // 5 second timeout
	);

	// Disconnect from default relays after fetching
	closeRelays(DEFAULT_RELAYS);

	console.log('[NIP-17] Got', events.length, 'kind 10050 events');

	if (events.length === 0) {
		return [];
	}

	// Find the most recent 10050 event
	let latestEvent = events[0];
	for (const event of events) {
		if (event.created_at > latestEvent.created_at) {
			latestEvent = event;
		}
	}

	// Extract relay URLs from tags
	const relays: string[] = [];
	for (const tag of latestEvent.tags) {
		if (tag[0] === 'relay' && tag[1]) {
			relays.push(tag[1]);
		}
	}

	console.log('[NIP-17] Found messaging relays:', relays);
	return relays;
}

/**
 * Fetch gift-wrapped messages (kind 1059) for a user from a specific relay
 * Uses pagination to fetch all messages in batches
 */
export async function fetchGiftWraps(
	relayUrl: string,
	pubkey: string,
	onProgress?: (count: number) => void
): Promise<NostrEvent[]> {
	console.log('[NIP-17] Fetching gift wraps from', relayUrl);

	const supportsPFilter = supportsPtagFilter(relayUrl);
	console.log(`[NIP-17] Relay ${relayUrl} #p filter support:`, supportsPFilter);

	const allEvents = new Map<string, NostrEvent>();
	let until: number | undefined = undefined;
	let batchCount = 0;

	while (batchCount < MAX_BATCHES) {
		batchCount++;

		let filter: Filter;

		if (supportsPFilter === false) {
			// Relay doesn't support #p filtering, query by kind only and filter client-side
			filter = {
				kinds: [KIND_GIFT_WRAP],
				limit: BATCH_SIZE,
				...(until !== undefined ? { until } : {})
			};
			console.log(`[NIP-17] Using fallback query (no #p filter) for ${relayUrl}`);
		} else {
			// Use #p filter if supported or unknown
			filter = {
				kinds: [KIND_GIFT_WRAP],
				'#p': [pubkey],
				limit: BATCH_SIZE,
				...(until !== undefined ? { until } : {})
			};
		}

		let events;
		try {
			events = await queryRelay(relayUrl, filter, BATCH_TIMEOUT);
		} catch (err) {
			console.warn(`[NIP-17] Batch ${batchCount} failed for ${relayUrl}, retrying...`);
			try {
				events = await queryRelay(relayUrl, filter, BATCH_TIMEOUT);
			} catch {
				console.warn(`[NIP-17] Retry failed for ${relayUrl}, returning partial results`);
				break;
			}
		}

		// Filter client-side if relay doesn't support #p filter
		let matchingEvents = events;
		if (supportsPFilter === false) {
			matchingEvents = events.filter((e) => {
				const pTags = (e.tags || []).filter((t) => t[0] === 'p' && typeof t[1] === 'string');
				return pTags.some((ptag) => ptag[1] === pubkey);
			});
			console.log(`[NIP-17] Client-side filter: ${events.length} -> ${matchingEvents.length} events`);
		}

		if (matchingEvents.length === 0) {
			// If we got events but none matched, we've exhausted our events
			if (events.length > 0 && supportsPFilter === false) {
				console.log(`[NIP-17] Got ${events.length} events but none matched user, stopping`);
			}
			break;
		}

		// Add to map (deduplicates by ID)
		for (const event of matchingEvents) {
			allEvents.set(event.id, event as NostrEvent);
		}

		onProgress?.(allEvents.size);

		// Stop if we got fewer than batch size (no more data)
		if (events.length < BATCH_SIZE) break;

		// Find oldest timestamp for next batch
		const oldestTimestamp = Math.min(...events.map((e) => e.created_at));

		// Safeguard: stop if until didn't change (prevents infinite loop)
		if (until !== undefined && oldestTimestamp >= until) {
			console.warn('[NIP-17] Pagination stuck for', relayUrl, '- stopping');
			break;
		}

		until = oldestTimestamp;
		console.log(`[NIP-17] Batch ${batchCount}: got ${events.length} raw, ${matchingEvents.length} matched, total ${allEvents.size}, next until=${until}`);
	}

	console.log('[NIP-17] Got', allEvents.size, 'gift wraps from', relayUrl, `(${batchCount} batches)`);
	return Array.from(allEvents.values());
}
