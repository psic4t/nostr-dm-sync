import { hasNip07, Nip07Signer, Nip55Signer, setSigner, destroyPool } from '$lib/nostr';
import type { Signer, SignerType } from '$lib/nostr';

// User state using Svelte 5 runes
let pubkey = $state<string | null>(null);
let signerType = $state<SignerType | null>(null);
let signer = $state<Signer | null>(null);
let isLoggingIn = $state(false);
let loginError = $state<string | null>(null);

// Derived state
const isLoggedIn = $derived(pubkey !== null);

/**
 * Check if NIP-07 is available (must be called in browser context)
 */
export function checkNip07(): boolean {
	return typeof window !== 'undefined' && hasNip07();
}

/**
 * Initialize user state from storage (for NIP-55 callback recovery)
 */
export function initFromStorage() {
	if (typeof window === 'undefined') return;

	const storedPubkey = sessionStorage.getItem('nostr_pubkey');
	const storedSignerType = sessionStorage.getItem('nostr_signer_type') as SignerType | null;

	if (storedPubkey && storedSignerType) {
		pubkey = storedPubkey;
		signerType = storedSignerType;

		if (storedSignerType === 'nip07') {
			signer = new Nip07Signer();
		} else if (storedSignerType === 'nip55') {
			const nip55Signer = new Nip55Signer(getCallbackUrl());
			nip55Signer.setPubkey(storedPubkey);
			signer = nip55Signer;
		}

		if (signer) {
			setSigner(signer);
		}
	}
}

/**
 * Get the callback URL for NIP-55
 */
export function getCallbackUrl(): string {
	if (typeof window === 'undefined') return '';
	return `${window.location.origin}/callback`;
}

/**
 * Login with NIP-07 browser extension
 */
export async function loginWithNip07(): Promise<void> {
	if (!hasNip07()) {
		loginError = 'No NIP-07 extension detected';
		return;
	}

	isLoggingIn = true;
	loginError = null;

	try {
		const nip07Signer = new Nip07Signer();
		const pk = await nip07Signer.getPublicKey();

		pubkey = pk;
		signerType = 'nip07';
		signer = nip07Signer;

		// Store in session
		sessionStorage.setItem('nostr_pubkey', pk);
		sessionStorage.setItem('nostr_signer_type', 'nip07');

		// Set signer for relay operations
		setSigner(signer);
	} catch (err) {
		loginError = err instanceof Error ? err.message : 'Login failed';
	} finally {
		isLoggingIn = false;
	}
}

/**
 * Start NIP-55 login (redirects to Amber)
 */
export function loginWithNip55(): void {
	isLoggingIn = true;
	loginError = null;

	const callbackUrl = getCallbackUrl();
	const url = `nostrsigner:?compressionType=none&returnType=signature&type=get_public_key&callbackUrl=${encodeURIComponent(callbackUrl)}`;

	// Store intent in session
	sessionStorage.setItem('nostr_login_intent', 'nip55');

	window.location.href = url;
}

/**
 * Complete NIP-55 login from callback
 */
export function completeNip55Login(pk: string): void {
	pubkey = pk;
	signerType = 'nip55';

	const nip55Signer = new Nip55Signer(getCallbackUrl());
	nip55Signer.setPubkey(pk);
	signer = nip55Signer;

	// Store in session
	sessionStorage.setItem('nostr_pubkey', pk);
	sessionStorage.setItem('nostr_signer_type', 'nip55');
	sessionStorage.removeItem('nostr_login_intent');

	// Set signer for relay operations
	setSigner(signer);

	isLoggingIn = false;
}

/**
 * Logout and clear state
 */
export function logout(): void {
	pubkey = null;
	signerType = null;
	signer = null;
	loginError = null;

	// Clear storage
	sessionStorage.removeItem('nostr_pubkey');
	sessionStorage.removeItem('nostr_signer_type');

	// Clear signer and destroy pool
	setSigner(null);
	destroyPool();
}

/**
 * Get current user state (for reactive access in components)
 */
export function getUserState() {
	return {
		get pubkey() { return pubkey; },
		get signerType() { return signerType; },
		get signer() { return signer; },
		get isLoggedIn() { return isLoggedIn; },
		get isLoggingIn() { return isLoggingIn; },
		get loginError() { return loginError; }
	};
}
