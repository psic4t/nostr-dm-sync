import { Relay } from 'nostr-tools';
import type { Event, Filter, EventTemplate, VerifiedEvent } from 'nostr-tools';
import type { Signer, NostrEvent } from './types';

// Re-export types
export type { Event, Filter };

// Auth status for a relay connection
type RelayAuthStatus = 'unknown' | 'not_required' | 'required' | 'authenticated' | 'failed';

// Extended relay state with auth tracking
interface RelayState {
	relay: Relay;
	authStatus: RelayAuthStatus;
	authRetryCount: number;
}

// Configuration
const MAX_AUTH_RETRIES = 3;

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
		if (state.relay.connected) {
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

	// Return existing connected relay
	if (state?.relay && state.relay.connected) {
		return state.relay;
	}

	// Create new relay connection using static connect method
	console.log(`[Relay] Connecting to ${url}`);
	const relay = await Relay.connect(url);
	console.log(`[Relay] Connected to ${url}`);

	// Set up AUTH handler
	const authHandler = createAuthHandler(url);
	if (authHandler) {
		relay.onauth = authHandler;
		console.log(`[AUTH] Registered onauth handler for ${url}`);
	}

	// Determine initial auth status
	const initialAuthStatus: RelayAuthStatus = knownAuthRelays.has(url) ? 'required' : 'unknown';

	// Cache the relay state
	state = { relay, authStatus: initialAuthStatus, authRetryCount: 0 };
	relayStates.set(url, state);

	// For known AUTH relays, log that we'll handle auth reactively
	// Note: We don't call relay.auth() proactively because the relay may not have
	// sent the AUTH challenge yet. Instead, onauth callback handles challenges
	// automatically, and we handle auth-required: responses in operations.
	if (initialAuthStatus === 'required' && signer) {
		console.log(`[AUTH] Relay ${url} is known to require auth - onauth handler ready`);
	}

	return relay;
}

/**
 * Query events from a single relay with AUTH support
 * Handles auth-required: close reason by authenticating and retrying
 */
export async function queryRelay(
	url: string,
	filter: Filter,
	timeoutMs: number = 10000
): Promise<Event[]> {
	try {
		const relay = await getRelay(url);
		const state = relayStates.get(url)!;

		return new Promise((resolve) => {
			const events: Event[] = [];
			let resolved = false;
			let authRetried = false;

			const done = () => {
				if (!resolved) {
					resolved = true;
					resolve(events);
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

						// Ignore "closed by caller" - we closed it ourselves
						if (reason === 'closed by caller') {
							return;
						}

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
										doSubscribe(); // Retry
									} else {
										console.warn(`[AUTH] Auth failed for ${url}, giving up`);
										done();
									}
								})
								.catch((err: Error) => {
									console.warn(`[AUTH] Auth error for ${url}:`, err);
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
					sub.close();
					done();
				}
			}, timeoutMs);
		});
	} catch (err) {
		console.warn(`[Relay] Query to ${url} failed:`, err);
		return [];
	}
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
			state.relay.close();
			relayStates.delete(url);
		}
	}
}

/**
 * Destroy all relay connections
 */
export function destroyPool(): void {
	for (const [, state] of relayStates) {
		state.relay.close();
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
