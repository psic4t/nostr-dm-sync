import { Relay } from 'nostr-tools';
import type { Event, Filter, EventTemplate, VerifiedEvent } from 'nostr-tools';
import type { Signer, NostrEvent } from './types';

// Re-export types
export type { Event, Filter };

// Auth status for a relay connection
type RelayAuthStatus = 'unknown' | 'not_required' | 'required' | 'authenticated' | 'failed';

// Connection status for a relay
export type RelayConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

// Query result with metadata
export interface QueryResult {
	events: Event[];
	timedOut: boolean;
	closedReason?: string;
}

// Extended relay state with auth and connection tracking
interface RelayState {
	relay: Relay | null;
	authStatus: RelayAuthStatus;
	authRetryCount: number;
	connectionStatus: RelayConnectionStatus;
	connectionError: string | null;
	closingIntentionally: boolean; // Flag to prevent onclose from firing during intentional reconnect
}

// Listeners for connection status changes
type ConnectionStatusListener = (url: string, status: RelayConnectionStatus, error: string | null) => void;
const connectionStatusListeners = new Set<ConnectionStatusListener>();

/**
 * Subscribe to connection status changes
 */
export function onConnectionStatusChange(listener: ConnectionStatusListener): () => void {
	connectionStatusListeners.add(listener);
	return () => connectionStatusListeners.delete(listener);
}

/**
 * Notify all listeners of a connection status change
 */
function notifyConnectionStatusChange(url: string, status: RelayConnectionStatus, error: string | null): void {
	for (const listener of connectionStatusListeners) {
		try {
			listener(url, status, error);
		} catch (e) {
			console.error('[Relay] Connection status listener error:', e);
		}
	}
}

// Configuration
const MAX_AUTH_RETRIES = 3;
const CONNECTION_TIMEOUT = 15000; // 15 seconds (default is 4.4s)
const AUTH_WAIT_TIMEOUT = 3000; // Wait up to 3 seconds for AUTH challenge
const POST_CONNECT_MONITOR_DELAY = 2000; // Monitor for disconnects within 2 seconds of connect

// Relay connection cache with auth state
const relayStates = new Map<string, RelayState>();

// Known relays that require AUTH (persisted to localStorage)
const KNOWN_AUTH_RELAYS_KEY = 'nostr-dm-sync:known-auth-relays';
const DEBUG_PUBLISH_KEY = 'nostr-dm-sync:debug-publish';
const GIFTWRAP_P_CAP_KEY = 'nostr-dm-sync:cap-giftwrap-p';
const NO_PTAG_FILTER_KEY = 'nostr-dm-sync:no-ptag-filter';
let knownAuthRelays: Set<string> = new Set();
let giftwrapPCap: Map<string, boolean> = new Map();
let noPtagFilter: Set<string> = new Set();

function debugPublishEnabled(): boolean {
	if (typeof localStorage === 'undefined') return false;
	try {
		const v = localStorage.getItem(DEBUG_PUBLISH_KEY);
		return v === '1' || v === 'verify' || v === 'probe';
	} catch {
		return false;
	}
}

function debugPublishVerifyEnabled(): boolean {
	if (typeof localStorage === 'undefined') return false;
	try {
		const v = localStorage.getItem(DEBUG_PUBLISH_KEY);
		return v === 'verify' || v === 'probe';
	} catch {
		return false;
	}
}

function debugPublishProbeEnabled(): boolean {
	if (typeof localStorage === 'undefined') return false;
	try {
		return localStorage.getItem(DEBUG_PUBLISH_KEY) === 'probe';
	} catch {
		return false;
	}
}

function shortId(id: string | undefined): string {
	return id ? `${id.slice(0, 8)}...` : 'unknown';
}

// Load known auth relays from localStorage
function loadKnownAuthRelays(): void {
	if (typeof localStorage === 'undefined') return;
	try {
		const stored = localStorage.getItem(KNOWN_AUTH_RELAYS_KEY);
		if (stored) {
			knownAuthRelays = new Set(JSON.parse(stored));
			console.log('[AUTH] Loaded known auth relays:', Array.from(knownAuthRelays));
		}
	} catch {
		// Ignore parse errors
	}
}

function loadGiftwrapPCap(): void {
	if (typeof localStorage === 'undefined') return;
	try {
		const stored = localStorage.getItem(GIFTWRAP_P_CAP_KEY);
		if (!stored) return;
		const obj = JSON.parse(stored) as Record<string, boolean>;
		giftwrapPCap = new Map(Object.entries(obj));
	} catch {
		// Ignore parse errors
	}
}

function loadNoPtagFilter(): void {
	if (typeof localStorage === 'undefined') return;
	try {
		const stored = localStorage.getItem(NO_PTAG_FILTER_KEY);
		if (!stored) return;
		noPtagFilter = new Set(JSON.parse(stored));
	} catch {
		// Ignore parse errors
	}
}

function saveGiftwrapPCap(): void {
	if (typeof localStorage === 'undefined') return;
	try {
		const obj: Record<string, boolean> = {};
		for (const [k, v] of giftwrapPCap) obj[k] = v;
		localStorage.setItem(GIFTWRAP_P_CAP_KEY, JSON.stringify(obj));
	} catch {
		// Ignore storage errors
	}
}

function saveNoPtagFilter(): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(NO_PTAG_FILTER_KEY, JSON.stringify(Array.from(noPtagFilter)));
	} catch {
		// Ignore storage errors
	}
}

function setGiftwrapPQueryCap(url: string, supported: boolean): void {
	const prev = giftwrapPCap.get(url);
	if (prev === supported) return;
	giftwrapPCap.set(url, supported);
	saveGiftwrapPCap();
	console.log(`[Cap] giftwrap #p query for ${url}: ${supported ? 'supported' : 'unsupported'}`);
}

export function getGiftwrapPQueryCap(url: string): boolean | null {
	return giftwrapPCap.get(url) ?? null;
}

function markRelayNoPtagFilter(url: string): void {
	if (!noPtagFilter.has(url)) {
		noPtagFilter.add(url);
		saveNoPtagFilter();
		console.log(`[Cap] Marked ${url} as not supporting #p filter`);
	}
}

export function supportsPtagFilter(url: string): boolean | null {
	if (noPtagFilter.has(url)) return false;
	const cap = giftwrapPCap.get(url);
	if (cap !== undefined) return cap;
	return null;
}

export function setRelayPtagSupport(url: string, supported: boolean): void {
	const prev = giftwrapPCap.get(url);
	if (prev === supported) return;
	giftwrapPCap.set(url, supported);
	saveGiftwrapPCap();
	console.log(`[Cap] #p filter for ${url}: ${supported ? 'supported' : 'unsupported'}`);

	if (supported === false) {
		markRelayNoPtagFilter(url);
	}
}

export function detectPtagFilterCapability(url: string): void {
	if (url.includes('nosflare.com')) {
		console.log(`[Cap] Auto-detect: nosflare.com known to not support #p filter`);
		setRelayPtagSupport(url, false);
	}
}

// Save known auth relays to localStorage
function saveKnownAuthRelays(): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(KNOWN_AUTH_RELAYS_KEY, JSON.stringify(Array.from(knownAuthRelays)));
	} catch {
		// Ignore storage errors
	}
}

// Mark a relay as requiring auth (persisted)
function markRelayRequiresAuth(url: string): void {
	if (!knownAuthRelays.has(url)) {
		knownAuthRelays.add(url);
		saveKnownAuthRelays();
		console.log(`[AUTH] Marked ${url} as requiring auth (persisted)`);
	}
}

// Initialize on module load
loadKnownAuthRelays();
loadGiftwrapPCap();
loadNoPtagFilter();

let signer: Signer | null = null;

/**
 * Create an AUTH handler that signs AUTH events using the current signer
 */
function createAuthHandler(url: string): ((evt: EventTemplate) => Promise<VerifiedEvent>) | undefined {
	if (!signer) return undefined;

	return async (evt: EventTemplate): Promise<VerifiedEvent> => {
		console.log(`[AUTH] Signing auth event for ${url}`, { kind: evt.kind, tags: evt.tags });
		const signed = await signer!.signEvent({
			kind: evt.kind,
			created_at: evt.created_at,
			tags: evt.tags,
			content: evt.content
		});
		return signed as VerifiedEvent;
	};
}

/**
 * Set the signer for AUTH operations
 * Updates onauth handlers for all existing relay connections
 */
export function setSigner(s: Signer | null): void {
	const previousSigner = signer;
	signer = s;

	// Update onauth handler for all existing connections
	for (const [url, state] of relayStates) {
		if (state.relay && state.relay.connected) {
			state.relay.onauth = s ? createAuthHandler(url) : undefined;
			console.log(`[AUTH] Updated onauth handler for ${url} (signer: ${s ? 'set' : 'cleared'})`);

			// Reset auth status if we now have a signer and previously failed
			if (s && !previousSigner && state.authStatus === 'failed') {
				state.authStatus = 'required';
				state.authRetryCount = 0;
				console.log(`[AUTH] Reset auth status for ${url} - will retry on next operation`);
			}
		}
	}
}

/**
 * Get the current signer
 */
export function getSigner(): Signer | null {
	return signer;
}

/**
 * Authenticate with a relay using nostr-tools' native auth() method
 * Returns true if authentication succeeded, false otherwise
 */
async function authenticateRelay(url: string): Promise<boolean> {
	const state = relayStates.get(url);
	if (!state?.relay || !state.relay.connected) {
		console.warn(`[AUTH] Cannot authenticate ${url}: not connected`);
		return false;
	}

	if (!signer) {
		console.warn(`[AUTH] Cannot authenticate ${url}: no signer available`);
		return false;
	}

	// Check retry limit
	if (state.authRetryCount >= MAX_AUTH_RETRIES) {
		console.warn(`[AUTH] Max retries (${MAX_AUTH_RETRIES}) reached for ${url}`);
		state.authStatus = 'failed';
		return false;
	}

	state.authRetryCount++;

	// Ensure onauth is set
	if (!state.relay.onauth) {
		state.relay.onauth = createAuthHandler(url);
	}

	try {
		console.log(`[AUTH] Authenticating with ${url} (attempt ${state.authRetryCount}/${MAX_AUTH_RETRIES})...`);
		
		// Use nostr-tools native auth() - it handles challenge internally
		await state.relay.auth(createAuthHandler(url)!);
		
		state.authStatus = 'authenticated';
		console.log(`[AUTH] Successfully authenticated with ${url}`);
		return true;
	} catch (e) {
		const errMsg = e instanceof Error ? e.message : String(e);
		
		// "no challenge was received" means the relay hasn't sent AUTH challenge yet
		// This is normal - the onauth callback will handle it when the challenge arrives
		if (errMsg.includes('no challenge')) {
			console.log(`[AUTH] No challenge received yet from ${url} - onauth will handle when it arrives`);
			// Don't count this as a retry failure
			state.authRetryCount--;
			return false;
		}
		
		console.warn(`[AUTH] Authentication failed for ${url}:`, errMsg);
		
		// Only mark as failed if we've exhausted retries
		if (state.authRetryCount >= MAX_AUTH_RETRIES) {
			state.authStatus = 'failed';
		}
		return false;
	}
}

/**
 * Get or create a relay connection with AUTH support
 * For known AUTH relays, proactively authenticates after connection
 */
async function getRelay(url: string): Promise<Relay> {
	let state = relayStates.get(url);

	// Return existing connected relay (must have valid relay object)
	if (state?.relay && state.relay.connected) {
		return state.relay;
	}

	// If there's a stale state with null/disconnected relay, clean it up
	if (state && (!state.relay || !state.relay.connected)) {
		console.log(`[Relay] Cleaning up stale state for ${url}`);
		relayStates.delete(url);
		state = undefined;
	}

	// Notify connecting status
	notifyConnectionStatusChange(url, 'connecting', null);

	// Check if this is a known AUTH relay
	const isAuthRelay = knownAuthRelays.has(url);
	const hasSigner = !!signer;

	// Create new relay connection using static connect method
	console.log(`[Relay] Connecting to ${url}${isAuthRelay ? ' (AUTH relay)' : ''}`);
	const relay = await Relay.connect(url);
	
	// Set longer connection timeout to handle slow relays and AUTH
	relay.connectionTimeout = CONNECTION_TIMEOUT;
	
	console.log(`[Relay] WebSocket connected to ${url}`);

	// Set up AUTH handler BEFORE anything else
	const authHandler = createAuthHandler(url);
	if (authHandler) {
		relay.onauth = authHandler;
		console.log(`[AUTH] Registered onauth handler for ${url}`);
	} else if (isAuthRelay) {
		console.warn(`[AUTH] No signer available for AUTH relay ${url} - authentication will fail`);
	}

	// Determine initial auth status
	const initialAuthStatus: RelayAuthStatus = isAuthRelay ? 'required' : 'unknown';

	// Cache the relay state - but mark as 'connecting' until AUTH completes for AUTH relays
	state = {
		relay,
		authStatus: initialAuthStatus,
		authRetryCount: 0,
		connectionStatus: (isAuthRelay && hasSigner) ? 'connecting' : 'connected',
		connectionError: null,
		closingIntentionally: false
	};
	relayStates.set(url, state);

	// Set up onclose handler to track disconnections
	relay.onclose = () => {
		console.log(`[Relay] Connection closed for ${url}`);
		const currentState = relayStates.get(url);
		// Only notify if this wasn't an intentional close (e.g., during reconnect)
		if (currentState && !currentState.closingIntentionally) {
			const wasConnecting = currentState.connectionStatus === 'connecting';
			currentState.connectionStatus = 'error';
			currentState.connectionError = wasConnecting 
				? 'Connection failed during authentication' 
				: 'Connection closed unexpectedly';
			currentState.relay = null; // Clear the relay reference
			notifyConnectionStatusChange(url, 'error', currentState.connectionError);
		}
	};

	// For known AUTH relays with a signer, wait for AUTH to complete
	if (isAuthRelay && hasSigner) {
		console.log(`[AUTH] Waiting for AUTH challenge from ${url}...`);
		
		try {
			// Wait for AUTH challenge to arrive and complete authentication
			const authSuccess = await waitForAuth(relay, url, AUTH_WAIT_TIMEOUT);
			
			if (authSuccess) {
				state.authStatus = 'authenticated';
				state.connectionStatus = 'connected';
				console.log(`[AUTH] Successfully authenticated with ${url}`);
				notifyConnectionStatusChange(url, 'connected', null);
			} else {
				// AUTH didn't complete in time, but connection is still open
				// The relay might not require AUTH for all operations, or challenge will come later
				state.connectionStatus = 'connected';
				console.log(`[AUTH] AUTH not completed for ${url}, but connection is open - proceeding`);
				notifyConnectionStatusChange(url, 'connected', null);
			}
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : 'Authentication failed';
			console.error(`[AUTH] AUTH failed for ${url}:`, errorMsg);
			state.connectionStatus = 'error';
			state.connectionError = `Authentication failed: ${errorMsg}`;
			notifyConnectionStatusChange(url, 'error', state.connectionError);
			throw new Error(state.connectionError);
		}
	} else {
		// Non-AUTH relay or no signer - notify connected immediately
		notifyConnectionStatusChange(url, 'connected', null);
		
		// Set up post-connect monitoring to catch early disconnects
		setupPostConnectMonitor(url, relay);
	}

	return relay;
}

/**
 * Wait for AUTH challenge and complete authentication
 * Returns true if AUTH completed successfully, false if timed out (but connection still open)
 * Throws if AUTH failed
 */
async function waitForAuth(relay: Relay, url: string, timeoutMs: number): Promise<boolean> {
	const startTime = Date.now();
	
	// Poll for challenge arrival
	while (Date.now() - startTime < timeoutMs) {
		// Check if relay is still connected
		if (!relay.connected) {
			throw new Error('Connection closed while waiting for AUTH');
		}
		
		// Try to authenticate (will fail with "no challenge" if not received yet)
		try {
			const authHandler = createAuthHandler(url);
			if (!authHandler) {
				throw new Error('No signer available');
			}
			
			await relay.auth(authHandler);
			return true; // AUTH completed successfully
		} catch (e) {
			const errMsg = e instanceof Error ? e.message : String(e);
			
			if (errMsg.includes('no challenge')) {
				// Challenge not received yet, wait and retry
				await new Promise(resolve => setTimeout(resolve, 200));
				continue;
			}
			
			// Real AUTH error
			throw e;
		}
	}
	
	// Timed out waiting for challenge, but connection is still open
	return false;
}

/**
 * Monitor for early disconnects after connection
 * This catches cases where the relay closes shortly after opening (e.g., AUTH timeout on relay side)
 */
function setupPostConnectMonitor(url: string, relay: Relay): void {
	setTimeout(() => {
		const state = relayStates.get(url);
		if (state && state.relay === relay && !relay.connected && state.connectionStatus === 'connected') {
			console.warn(`[Relay] Connection to ${url} lost shortly after connecting`);
			state.connectionStatus = 'error';
			state.connectionError = 'Connection lost shortly after connecting';
			state.relay = null;
			notifyConnectionStatusChange(url, 'error', state.connectionError);
		}
	}, POST_CONNECT_MONITOR_DELAY);
}

/**
 * Query events from a single relay with AUTH support and status tracking
 * Handles auth-required: close reason by authenticating and retrying
 * Returns QueryResult with events, timeout status, and close reason
 */
export async function queryRelayWithStatus(
	url: string,
	filter: Filter,
	timeoutMs: number = 10000
): Promise<QueryResult> {
	try {
		const relay = await getRelay(url);
		const state = relayStates.get(url)!;

		return new Promise((resolve) => {
			const events: Event[] = [];
			let resolved = false;
			let authRetried = false;
			let timedOut = false;
			let closedReason: string | undefined;

			const done = () => {
				if (!resolved) {
					resolved = true;
					resolve({ events, timedOut, closedReason });
				}
			};

			const doSubscribe = () => {
				let closedForAuth = false;

				const sub = relay.subscribe([filter], {
					onevent(event) {
						events.push(event);
					},
					oneose() {
						// Don't resolve if we're in the middle of an auth retry
						if (closedForAuth) {
							console.log(`[AUTH] Ignoring oneose for ${url} - auth in progress`);
							return;
						}

						// If we got events, mark auth as not required (for reads at least)
						if (events.length > 0 && state.authStatus === 'unknown') {
							state.authStatus = 'not_required';
						}

						sub.close();
						done();
					},
					onclose(reason) {
						console.log(`[Relay] Subscription closed for ${url}, reason: "${reason}"`);

						// Ignore "closed by caller" - we closed it ourselves (could be timeout or manual)
						if (reason === 'closed by caller') {
							return;
						}

						closedReason = reason;

						// Check if auth required
						if (reason.startsWith('auth-required:')) {
							// Mark relay as requiring auth
							state.authStatus = 'required';
							markRelayRequiresAuth(url);

							// Check if we can retry
							if (authRetried || state.authRetryCount >= MAX_AUTH_RETRIES) {
								console.warn(`[AUTH] Cannot retry auth for ${url} (already retried or max retries reached)`);
								done();
								return;
							}

							authRetried = true;
							closedForAuth = true;

							console.log(`[AUTH] Subscription to ${url} requires auth, authenticating...`);

							// Authenticate and retry
							authenticateRelay(url)
								.then((success) => {
									if (success) {
										console.log(`[AUTH] Auth completed for ${url}, retrying subscription`);
										closedReason = undefined; // Reset close reason after successful auth
										doSubscribe(); // Retry
									} else {
										console.warn(`[AUTH] Auth failed for ${url}, giving up`);
										closedReason = 'auth-failed';
										done();
									}
								})
								.catch((err: Error) => {
									console.warn(`[AUTH] Auth error for ${url}:`, err);
									closedReason = `auth-error: ${err.message}`;
									done();
								});
						} else if (!closedForAuth) {
							// Non-auth close - just resolve
							done();
						}
					}
				});

				return sub;
			};

			const sub = doSubscribe();

			// Timeout fallback
			setTimeout(() => {
				if (!resolved) {
					timedOut = true;
					console.warn(`[Relay] Query to ${url} timed out after ${timeoutMs}ms (got ${events.length} events)`);
					sub.close();
					done();
				}
			}, timeoutMs);
		});
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : 'Connection failed';
		console.warn(`[Relay] Query to ${url} failed:`, err);
		
		// Update connection status to error
		const state = relayStates.get(url);
		if (state) {
			state.connectionStatus = 'error';
			state.connectionError = errorMsg;
			state.relay = null; // Clear invalid relay
		} else {
			// Create error state for relay we couldn't connect to
			relayStates.set(url, {
				relay: null,
				authStatus: 'unknown',
				authRetryCount: 0,
				connectionStatus: 'error',
				connectionError: errorMsg,
				closingIntentionally: false
			});
		}
		notifyConnectionStatusChange(url, 'error', errorMsg);
		
		return { events: [], timedOut: false, closedReason: errorMsg };
	}
}

/**
 * Query events from a single relay with AUTH support
 * Handles auth-required: close reason by authenticating and retrying
 * @deprecated Use queryRelayWithStatus for better error handling
 */
export async function queryRelay(
	url: string,
	filter: Filter,
	timeoutMs: number = 10000
): Promise<Event[]> {
	const result = await queryRelayWithStatus(url, filter, timeoutMs);
	return result.events;
}

/**
 * Query events from multiple relays with AUTH support
 */
export async function queryRelays(
	urls: string[],
	filter: Filter,
	timeoutMs: number = 5000
): Promise<Event[]> {
	const results = await Promise.all(
		urls.map((url) => queryRelay(url, filter, timeoutMs))
	);

	// Deduplicate events by ID
	const eventMap = new Map<string, Event>();
	for (const events of results) {
		for (const event of events) {
			eventMap.set(event.id, event);
		}
	}

	return Array.from(eventMap.values());
}

/**
 * Publish an event to a single relay with AUTH support
 * Pre-authenticates if relay is known to require auth
 */
async function publishToRelay(url: string, event: Event): Promise<boolean> {
	try {
		const relay = await getRelay(url);
		const state = relayStates.get(url)!;
		const dbg = debugPublishEnabled();

		if (dbg) {
			console.log(`[Publish] Begin relay=${url} id=${shortId(event.id)} authStatus=${state.authStatus}`);
		}

		// If relay is known to require auth and we're not authenticated, pre-auth
		if (state.authStatus === 'required') {
			console.log(`[AUTH] Relay ${url} requires auth, ensuring authenticated before publish...`);
			const authOk = await authenticateRelay(url);
			if (!authOk) {
				console.warn(`[AUTH] Pre-auth failed for ${url}, attempting publish anyway`);
			}
		}

		try {
			await relay.publish(event);
			// If publish succeeded without auth, relay doesn't require auth for writes
			if (state.authStatus === 'unknown') {
				state.authStatus = 'not_required';
			}
			if (dbg) {
				console.log(`[Publish] OK relay=${url} id=${shortId(event.id)} authStatus=${state.authStatus}`);
			}

			// Optional debug verify: query the event back by id
			if (debugPublishVerifyEnabled()) {
				await verifyPublish(url, event);
			}

			return true;
		} catch (err) {
			// Check if auth required
			if (err instanceof Error && err.message.startsWith('auth-required:')) {
				// Mark relay as requiring auth
				state.authStatus = 'required';
				markRelayRequiresAuth(url);

				if (dbg) {
					console.log(`[Publish] AUTH_REQUIRED relay=${url} id=${shortId(event.id)}`);
				}

				// Check retry limit
				if (state.authRetryCount >= MAX_AUTH_RETRIES) {
					console.warn(`[AUTH] Max retries reached for ${url}, giving up on publish`);
					return false;
				}

				console.log(`[AUTH] Publish to ${url} requires auth, authenticating...`);

				// Try to authenticate
				const authOk = await authenticateRelay(url);
				if (!authOk) {
					console.warn(`[AUTH] Authentication failed for ${url}`);
					return false;
				}

				// Retry publish after successful auth
				try {
					console.log(`[AUTH] Retrying publish to ${url}...`);
					await relay.publish(event);
					console.log(`[AUTH] Retry publish succeeded for ${url}`);
					if (dbg) {
						console.log(`[Publish] OK_AFTER_AUTH relay=${url} id=${shortId(event.id)}`);
					}

					// Optional debug verify
					if (debugPublishVerifyEnabled()) {
						await verifyPublish(url, event);
					}

					return true;
				} catch (retryErr) {
					const errMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
					if (errMsg.startsWith('auth-required:')) {
						console.warn(`[AUTH] Auth not accepted by ${url}, publish still requires auth`);
						state.authStatus = 'failed';
					} else {
						console.warn(`[AUTH] Retry publish failed for ${url}:`, retryErr);
					}
					return false;
				}
			}

			throw err; // Re-throw non-auth errors
		}
	} catch (err) {
		if (debugPublishEnabled()) {
			const msg = err instanceof Error ? err.message : String(err);
			console.warn(`[Publish] FAIL relay=${url} id=${shortId(event.id)} err=${JSON.stringify(msg)}`);
		}
		console.warn(`[Relay] Publish to ${url} failed:`, err);
		return false;
	}
}

/**
 * Debug helper: verify a published event can be fetched back
 */
async function verifyPublish(url: string, event: Event): Promise<void> {
	try {
		const gotBack = await queryRelay(url, { ids: [event.id], limit: 1 }, 3000);
		console.log(
			`[Publish] VERIFY relay=${url} id=${shortId(event.id)} found=${gotBack.length}`
		);

		// Optional debug probe: compare ids-only vs ids+kinds+#p for the logged-in pubkey
		if (debugPublishProbeEnabled() && gotBack[0] && url === 'wss://nostr.land') {
			const pTags = (gotBack[0].tags ?? [])
				.filter((t) => t[0] === 'p' && typeof t[1] === 'string')
				.map((t) => t[1]);
			const userPubkey = signer ? await signer.getPublicKey() : null;
			console.log(
				`[Probe] idsOnly relay=${url} id=${event.id} kind=${gotBack[0].kind} pTags=${JSON.stringify(pTags)} userPubkey=${userPubkey ?? 'none'}`
			);

			if (userPubkey) {
				const withP = await queryRelay(
					url,
					{ ids: [event.id], kinds: [gotBack[0].kind], '#p': [userPubkey], limit: 1 },
					3000
				);
				console.log(
					`[Probe] ids+kinds+#p relay=${url} id=${event.id} found=${withP.length}`
				);

				// Persist capability if this is a giftwrap (kind 1059)
				if (gotBack[0].kind === 1059) {
					setGiftwrapPQueryCap(url, withP.length > 0);
				}
			} else {
				console.log(`[Probe] Skipped ids+kinds+#p (missing user pubkey)`);
			}
		}
	} catch (e) {
		console.warn(`[Publish] VERIFY_FAILED relay=${url} id=${shortId(event.id)}`, e);
	}
}

/**
 * Publish an event to multiple relays with AUTH support
 */
export async function publishToRelays(
	urls: string[],
	event: NostrEvent
): Promise<Map<string, boolean>> {
	const results = new Map<string, boolean>();
	const dbg = debugPublishEnabled();

	if (dbg) {
		console.log(`[Publish] Batch begin id=${shortId((event as Event).id)} relays=${urls.length}`);
	}

	await Promise.all(
		urls.map(async (url) => {
			const success = await publishToRelay(url, event as Event);
			results.set(url, success);
		})
	);

	if (dbg) {
		const ok: string[] = [];
		const fail: string[] = [];
		for (const [u, s] of results) {
			(s ? ok : fail).push(u);
		}
		console.log(`[Publish] Batch end id=${shortId((event as Event).id)} ok=${ok.length} fail=${fail.length}`);
	}

	return results;
}

/**
 * Close connections to specific relays
 */
export function closeRelays(urls: string[]): void {
	for (const url of urls) {
		const state = relayStates.get(url);
		if (state) {
			state.closingIntentionally = true; // Prevent onclose from firing notifications
			if (state.relay) {
				state.relay.close();
			}
			relayStates.delete(url);
		}
	}
}

/**
 * Destroy all relay connections
 */
export function destroyPool(): void {
	for (const [, state] of relayStates) {
		state.closingIntentionally = true; // Prevent onclose from firing notifications
		if (state.relay) {
			state.relay.close();
		}
	}
	relayStates.clear();
}

/**
 * Get auth status for a relay (for debugging/UI)
 */
export function getRelayAuthStatus(url: string): RelayAuthStatus | null {
	return relayStates.get(url)?.authStatus ?? null;
}

/**
 * Get all known auth-required relays
 */
export function getKnownAuthRelays(): string[] {
	return Array.from(knownAuthRelays);
}

/**
 * Reset auth retry count for a relay (useful for manual retry)
 */
export function resetAuthRetry(url: string): void {
	const state = relayStates.get(url);
	if (state) {
		state.authRetryCount = 0;
		if (state.authStatus === 'failed') {
			state.authStatus = 'required';
		}
		console.log(`[AUTH] Reset retry count for ${url}`);
	}
}

/**
 * Get max auth retries configuration
 */
export function getMaxAuthRetries(): number {
	return MAX_AUTH_RETRIES;
}

/**
 * Get connection status for a relay
 */
export function getRelayConnectionStatus(url: string): RelayConnectionStatus | null {
	const state = relayStates.get(url);
	if (!state) return null;
	// Also check the actual connection state from nostr-tools
	if (state.relay && !state.relay.connected && state.connectionStatus === 'connected') {
		state.connectionStatus = 'disconnected';
	}
	return state.connectionStatus;
}

/**
 * Get connection error for a relay
 */
export function getRelayConnectionError(url: string): string | null {
	return relayStates.get(url)?.connectionError ?? null;
}

/**
 * Manually reconnect to a relay
 * Returns true if reconnection succeeded, false otherwise
 */
export async function reconnectRelay(url: string): Promise<boolean> {
	console.log(`[Relay] Manual reconnect requested for ${url}`);
	
	// Close existing connection if any - mark as intentional to prevent race condition
	const existingState = relayStates.get(url);
	if (existingState) {
		existingState.closingIntentionally = true; // Prevent onclose from firing
		try {
			if (existingState.relay) {
				existingState.relay.close();
			}
		} catch {
			// Ignore close errors
		}
		// Delete state AFTER marking intentional and closing
		relayStates.delete(url);
	}

	// Reset auth retry count for this relay to give it a fresh start
	// (The state was deleted, but we also need to ensure the new state starts fresh)

	// Note: getRelay() will notify 'connecting' status, so we don't need to here
	// This prevents duplicate notifications

	try {
		const relay = await getRelay(url);
		
		// Double-check connection is actually working
		if (!relay.connected) {
			throw new Error('Connection established but relay reports disconnected');
		}
		
		return true;
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : 'Connection failed';
		console.error(`[Relay] Reconnect failed for ${url}:`, errorMsg);
		
		// Check if getRelay already set error state
		const currentState = relayStates.get(url);
		if (!currentState || currentState.connectionStatus !== 'error') {
			// Store error state
			relayStates.set(url, {
				relay: null,
				authStatus: 'unknown',
				authRetryCount: 0,
				connectionStatus: 'error',
				connectionError: errorMsg,
				closingIntentionally: false
			});
			
			notifyConnectionStatusChange(url, 'error', errorMsg);
		}
		return false;
	}
}

/**
 * Get all relay connection statuses (for UI)
 */
export function getAllRelayConnectionStatuses(): Map<string, { status: RelayConnectionStatus; error: string | null }> {
	const result = new Map<string, { status: RelayConnectionStatus; error: string | null }>();
	for (const [url, state] of relayStates) {
		// Check actual connection state
		let status = state.connectionStatus;
		if (state.relay && !state.relay.connected && status === 'connected') {
			status = 'disconnected';
		}
		result.set(url, { status, error: state.connectionError });
	}
	return result;
}
