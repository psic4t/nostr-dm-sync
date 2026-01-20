import { DEFAULT_RELAYS, fetchMessagingRelays } from '$lib/nostr';

// Relay state using Svelte 5 runes
let messagingRelays = $state<string[]>([]);
let isDiscovering = $state(false);
let discoveryError = $state<string | null>(null);

/**
 * Get default relays
 */
export function getDefaultRelays(): string[] {
	return DEFAULT_RELAYS;
}

/**
 * Discover user's messaging relays from kind 10050
 */
export async function discoverMessagingRelays(pubkey: string): Promise<string[]> {
	if (isDiscovering) {
		console.log('[Relays] Already discovering, skipping');
		return messagingRelays;
	}

	isDiscovering = true;
	discoveryError = null;

	try {
		console.log('[Relays] Starting discovery for', pubkey.slice(0, 8) + '...');
		const relays = await fetchMessagingRelays(pubkey);

		if (relays.length === 0) {
			discoveryError = 'No messaging relays found. Please configure your relays (kind 10050) in a Nostr client.';
		} else {
			messagingRelays = relays;
		}

		console.log('[Relays] Discovery complete, found', relays.length, 'relays');
		return relays;
	} catch (err) {
		console.error('[Relays] Discovery error:', err);
		discoveryError = err instanceof Error ? err.message : 'Failed to discover relays';
		return [];
	} finally {
		isDiscovering = false;
	}
}

/**
 * Reset relay state (on logout)
 */
export function resetRelayState(): void {
	messagingRelays = [];
	isDiscovering = false;
	discoveryError = null;
}

/**
 * Get relay state (for reactive access in components)
 */
export function getRelayState() {
	return {
		get defaultRelays() { return DEFAULT_RELAYS; },
		get messagingRelays() { return messagingRelays; },
		get isDiscovering() { return isDiscovering; },
		get discoveryError() { return discoveryError; }
	};
}
