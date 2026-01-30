import { fetchGiftWraps, publishToRelays, getGiftwrapPQueryCap, detectPtagFilterCapability } from '$lib/nostr';
import type { NostrEvent } from '$lib/nostr';

// Fetch status for a relay
export type FetchStatus = 'idle' | 'fetching' | 'success' | 'timeout' | 'error' | 'partial';

export interface RelayFetchStatus {
	status: FetchStatus;
	messageCount: number;
	timedOut: boolean;
	errorMessage?: string;
}

// Message state using Svelte 5 runes
let messagesByRelay = $state<Map<string, Set<string>>>(new Map()); // relay URL -> event IDs
let allMessages = $state<Map<string, NostrEvent>>(new Map()); // event ID -> event
let fetchingRelays = $state<Set<string>>(new Set());
let fetchErrors = $state<Map<string, string>>(new Map());
let fetchProgress = $state<Map<string, number>>(new Map()); // relay URL -> message count during fetch
let fetchStatuses = $state<Map<string, RelayFetchStatus>>(new Map()); // relay URL -> fetch status details

// Sync state
let syncInProgress = $state(false);
let syncSourceRelay = $state<string | null>(null);
let syncProgress = $state<{ current: number; total: number }>({ current: 0, total: 0 });
let syncResults = $state<Map<string, { success: number; failed: number; total: number; errors: string[] }>>(new Map());

/**
 * Calculate unique messages for a relay (messages only on this relay)
 */
function calculateUniqueMessages(relayUrl: string): string[] {
	const relayMessages = messagesByRelay.get(relayUrl);
	if (!relayMessages) return [];

	const otherRelayMessages = new Set<string>();
	for (const [url, messages] of messagesByRelay) {
		if (url !== relayUrl) {
			for (const id of messages) {
				otherRelayMessages.add(id);
			}
		}
	}

	return Array.from(relayMessages).filter((id) => !otherRelayMessages.has(id));
}

/**
 * Calculate messages from source relay that are missing from each target relay
 * Returns Map<targetRelayUrl, missingMessageIds[]>
 */
function calculateMissingMessages(sourceRelay: string): Map<string, string[]> {
	const sourceMessages = messagesByRelay.get(sourceRelay);
	if (!sourceMessages) return new Map();

	const result = new Map<string, string[]>();

	for (const [targetUrl, targetMessages] of messagesByRelay) {
		if (targetUrl === sourceRelay) continue;

		const missing: string[] = [];
		for (const msgId of sourceMessages) {
			if (!targetMessages.has(msgId)) {
				missing.push(msgId);
			}
		}

		if (missing.length > 0) {
			result.set(targetUrl, missing);
		}
	}

	return result;
}

/**
 * Calculate total unique messages that need syncing (missing from at least one other relay)
 */
function calculateMissingCount(sourceRelay: string): number {
	const sourceMessages = messagesByRelay.get(sourceRelay);
	if (!sourceMessages) return 0;

	let count = 0;
	for (const msgId of sourceMessages) {
		// Check if this message is missing from at least one other relay
		for (const [targetUrl, targetMessages] of messagesByRelay) {
			if (targetUrl !== sourceRelay && !targetMessages.has(msgId)) {
				count++;
				break; // Count each message only once
			}
		}
	}
	return count;
}

/**
 * Fetch messages from a specific relay
 */
export async function fetchMessagesFromRelay(relayUrl: string, pubkey: string): Promise<void> {
	// Detect relay capability for #p filtering
	detectPtagFilterCapability(relayUrl);

	// Mark as fetching
	fetchingRelays = new Set([...fetchingRelays, relayUrl]);
	fetchErrors.delete(relayUrl);
	
	// Initialize fetch status
	fetchStatuses.set(relayUrl, {
		status: 'fetching',
		messageCount: 0,
		timedOut: false
	});
	fetchStatuses = new Map(fetchStatuses);

	try {
		console.log('[Messages] Fetching from', relayUrl);
		fetchProgress.set(relayUrl, 0);
		fetchProgress = new Map(fetchProgress);

		const result = await fetchGiftWraps(relayUrl, pubkey, (count) => {
			fetchProgress.set(relayUrl, count);
			fetchProgress = new Map(fetchProgress);
		});

		const { events, timedOut, hadErrors, errorMessage } = result;

		// Store events
		const relayMessageIds = new Set<string>();
		for (const event of events) {
			allMessages.set(event.id, event);
			relayMessageIds.add(event.id);
		}
		messagesByRelay.set(relayUrl, relayMessageIds);

		// Trigger reactivity by creating new references
		allMessages = new Map(allMessages);
		messagesByRelay = new Map(messagesByRelay);

		// Determine final fetch status
		let finalStatus: FetchStatus = 'success';
		if (timedOut && events.length === 0) {
			finalStatus = 'timeout';
		} else if (timedOut && events.length > 0) {
			finalStatus = 'partial'; // Got some events but timed out
		} else if (hadErrors && events.length === 0) {
			finalStatus = 'error';
		} else if (hadErrors) {
			finalStatus = 'partial';
		}

		// Update fetch status
		fetchStatuses.set(relayUrl, {
			status: finalStatus,
			messageCount: events.length,
			timedOut,
			errorMessage
		});
		fetchStatuses = new Map(fetchStatuses);

		// Set error message for UI if needed
		if (finalStatus === 'timeout') {
			fetchErrors.set(relayUrl, 'Query timed out - relay may be slow or unresponsive');
			fetchErrors = new Map(fetchErrors);
		} else if (finalStatus === 'error' && errorMessage) {
			fetchErrors.set(relayUrl, errorMessage);
			fetchErrors = new Map(fetchErrors);
		}

		const cap = getGiftwrapPQueryCap(relayUrl);
		if (events.length === 0 && cap === false) {
			console.log('[Messages] Relay appears unqueryable for giftwrap #p filter:', relayUrl);
		}
		console.log('[Messages] Got', events.length, 'messages from', relayUrl, 
			timedOut ? '[TIMED OUT]' : '', hadErrors ? '[HAD ERRORS]' : '');
	} catch (err) {
		console.error('[Messages] Fetch error for', relayUrl, err);
		const errorMsg = err instanceof Error ? err.message : 'Failed to fetch messages';
		fetchErrors.set(relayUrl, errorMsg);
		fetchErrors = new Map(fetchErrors);
		
		// Update fetch status to error
		fetchStatuses.set(relayUrl, {
			status: 'error',
			messageCount: 0,
			timedOut: false,
			errorMessage: errorMsg
		});
		fetchStatuses = new Map(fetchStatuses);
	} finally {
		// Remove from fetching set and clear progress
		fetchingRelays.delete(relayUrl);
		fetchingRelays = new Set(fetchingRelays);
		fetchProgress.delete(relayUrl);
		fetchProgress = new Map(fetchProgress);
	}
}

/**
 * Fetch messages from all messaging relays
 */
export async function fetchAllMessages(relays: string[], pubkey: string): Promise<void> {
	console.log('[Messages] Fetching from all relays:', relays);

	// Fetch from all relays in parallel
	await Promise.all(relays.map((url) => fetchMessagesFromRelay(url, pubkey)));

	console.log('[Messages] All fetches complete');
}

/**
 * Sync messages from source relay to target relays that are missing them
 */
export async function syncMissingMessages(
	sourceRelay: string,
	targetRelays: string[],
	onProgress?: (current: number, total: number, results: Map<string, { success: number; failed: number; total: number; errors: string[] }>) => void
): Promise<void> {
	const missingByRelay = calculateMissingMessages(sourceRelay);

	// Filter to only requested target relays and collect all unique message IDs
	const filteredMissing = new Map<string, string[]>();
	const allMissingIds = new Set<string>();

	for (const relay of targetRelays) {
		const missing = missingByRelay.get(relay) ?? [];
		filteredMissing.set(relay, missing);
		missing.forEach((id) => allMissingIds.add(id));
	}

	const totalMessages = allMissingIds.size;

	if (totalMessages === 0) {
		console.log('[Messages] No missing messages to sync');
		return;
	}

	console.log('[Sync] Start', {
		sourceRelay,
		totalMessages,
		targetRelays: [...targetRelays]
	});

	syncInProgress = true;
	syncSourceRelay = sourceRelay;
	syncProgress = { current: 0, total: totalMessages };
	syncResults = new Map();

	// Initialize results for each target relay with total count
	for (const relay of targetRelays) {
		const missingCount = filteredMissing.get(relay)?.length ?? 0;
		syncResults.set(relay, { success: 0, failed: 0, total: missingCount, errors: [] });
	}

	try {
		let processedCount = 0;

		// Process each unique message once
		for (const eventId of allMissingIds) {
			const event = allMessages.get(eventId);
			if (!event) continue;

			// Find which target relays need this message
			const relaysNeedingThis: string[] = [];
			for (const [relay, missingIds] of filteredMissing) {
				if (missingIds.includes(eventId)) {
					relaysNeedingThis.push(relay);
				}
			}

			console.log('[Sync] Publish', {
				current: processedCount + 1,
				total: totalMessages,
				eventId: `${eventId.slice(0, 8)}...`,
				targetRelays: [...relaysNeedingThis]
			});

			// Publish to only relays that need it
			const results = await publishToRelays(relaysNeedingThis, event);

			console.log('[Sync] Publish results', {
				eventId: `${eventId.slice(0, 8)}...`,
				results: Array.from(results.entries())
			});

			// Update results
			for (const [relay, success] of results) {
				const relayResult = syncResults.get(relay);
				if (!relayResult) continue;

				if (success) {
					relayResult.success++;
					const targetMessages = messagesByRelay.get(relay) ?? new Set();
					targetMessages.add(eventId);
					messagesByRelay.set(relay, targetMessages);
				} else {
					relayResult.failed++;
					relayResult.errors.push(`Failed to publish ${eventId.slice(0, 8)}...`);
				}
			}

			processedCount++;
			syncProgress = { current: processedCount, total: totalMessages };
			syncResults = new Map(syncResults);
			onProgress?.(processedCount, totalMessages, syncResults);
		}

		messagesByRelay = new Map(messagesByRelay);
	} finally {
		syncInProgress = false;
	}
}

/**
 * Reset sync state
 */
export function resetSyncState(): void {
	syncInProgress = false;
	syncSourceRelay = null;
	syncProgress = { current: 0, total: 0 };
	syncResults = new Map();
}

/**
 * Reset all message state (on logout)
 */
export function resetMessageState(): void {
	messagesByRelay = new Map();
	allMessages = new Map();
	fetchingRelays = new Set();
	fetchErrors = new Map();
	fetchProgress = new Map();
	fetchStatuses = new Map();
	resetSyncState();
}

/**
 * Get message state (for reactive access in components)
 */
export function getMessageState() {
	return {
		get messagesByRelay() { return messagesByRelay; },
		get allMessages() { return allMessages; },
		get fetchingRelays() { return fetchingRelays; },
		get fetchErrors() { return fetchErrors; },
		get fetchProgress() { return fetchProgress; },
		get fetchStatuses() { return fetchStatuses; },
		get syncInProgress() { return syncInProgress; },
		get syncSourceRelay() { return syncSourceRelay; },
		get syncProgress() { return syncProgress; },
		get syncResults() { return syncResults; },
		getMessageCount(relayUrl: string) {
			return messagesByRelay.get(relayUrl)?.size ?? 0;
		},
		getUniqueCount(relayUrl: string) {
			return calculateUniqueMessages(relayUrl).length;
		},
		getUniqueMessages(relayUrl: string) {
			return calculateUniqueMessages(relayUrl);
		},
		getMissingCount(relayUrl: string) {
			return calculateMissingCount(relayUrl);
		},
		getMissingByRelay(relayUrl: string) {
			return calculateMissingMessages(relayUrl);
		},
		isFetching(relayUrl: string) {
			return fetchingRelays.has(relayUrl);
		},
		getFetchProgress(relayUrl: string) {
			return fetchProgress.get(relayUrl) ?? 0;
		},
		getFetchStatus(relayUrl: string): RelayFetchStatus | null {
			return fetchStatuses.get(relayUrl) ?? null;
		}
	};
}
