import {
	onConnectionStatusChange,
	reconnectRelay as relayReconnect,
	getAllRelayConnectionStatuses,
	type RelayConnectionStatus
} from '$lib/nostr';

// Connection state using Svelte 5 runes
let connectionStatuses = $state<Map<string, RelayConnectionStatus>>(new Map());
let connectionErrors = $state<Map<string, string | null>>(new Map());
let reconnecting = $state<Set<string>>(new Set());

// Subscribe to connection status changes from relay module
onConnectionStatusChange((url, status, error) => {
	connectionStatuses.set(url, status);
	connectionStatuses = new Map(connectionStatuses); // Trigger reactivity

	connectionErrors.set(url, error);
	connectionErrors = new Map(connectionErrors); // Trigger reactivity

	// Clear reconnecting flag when we get a definitive status
	if (status === 'connected' || status === 'error' || status === 'disconnected') {
		reconnecting.delete(url);
		reconnecting = new Set(reconnecting);
	}
});

/**
 * Manually reconnect to a relay
 */
export async function reconnectToRelay(url: string): Promise<boolean> {
	if (reconnecting.has(url)) {
		console.log('[Connections] Already reconnecting to', url);
		return false;
	}

	reconnecting.add(url);
	reconnecting = new Set(reconnecting);

	// Clear any previous error - the relay module will notify 'connecting' status
	connectionErrors.set(url, null);
	connectionErrors = new Map(connectionErrors);

	try {
		const success = await relayReconnect(url);
		return success;
	} finally {
		reconnecting.delete(url);
		reconnecting = new Set(reconnecting);
	}
}

/**
 * Sync connection statuses from the relay module
 * Call this to initialize state or refresh it
 */
export function syncConnectionStatuses(): void {
	const statuses = getAllRelayConnectionStatuses();
	for (const [url, { status, error }] of statuses) {
		connectionStatuses.set(url, status);
		connectionErrors.set(url, error);
	}
	connectionStatuses = new Map(connectionStatuses);
	connectionErrors = new Map(connectionErrors);
}

/**
 * Reset connection state (on logout)
 */
export function resetConnectionState(): void {
	connectionStatuses = new Map();
	connectionErrors = new Map();
	reconnecting = new Set();
}

/**
 * Get connection state (for reactive access in components)
 */
export function getConnectionState() {
	return {
		get connectionStatuses() {
			return connectionStatuses;
		},
		get connectionErrors() {
			return connectionErrors;
		},
		get reconnecting() {
			return reconnecting;
		},
		getStatus(url: string): RelayConnectionStatus | null {
			return connectionStatuses.get(url) ?? null;
		},
		getError(url: string): string | null {
			return connectionErrors.get(url) ?? null;
		},
		isReconnecting(url: string): boolean {
			return reconnecting.has(url);
		}
	};
}
