import { getEventHash } from 'nostr-tools';
import type { Signer, UnsignedEvent, NostrEvent, SignerType } from './types';

/**
 * Check if NIP-07 browser extension is available
 */
export function hasNip07(): boolean {
	return typeof window !== 'undefined' && window.nostr !== undefined;
}

/**
 * NIP-07 Signer implementation using browser extension (Alby, nos2x, etc.)
 */
export class Nip07Signer implements Signer {
	type: SignerType = 'nip07';

	async getPublicKey(): Promise<string> {
		if (!window.nostr) {
			throw new Error('NIP-07 extension not available');
		}
		return window.nostr.getPublicKey();
	}

	async signEvent(event: UnsignedEvent): Promise<NostrEvent> {
		if (!window.nostr) {
			throw new Error('NIP-07 extension not available');
		}
		return window.nostr.signEvent(event);
	}
}

/**
 * NIP-55 Signer implementation for Amber (Android)
 * Uses nostrsigner: URL scheme with callback
 */
export class Nip55Signer implements Signer {
	type: SignerType = 'nip55';
	private pubkey: string | null = null;
	private callbackUrl: string;
	private pendingSignatures: Map<string, { resolve: (event: NostrEvent) => void; reject: (err: Error) => void; event: UnsignedEvent }> = new Map();

	constructor(callbackUrl: string) {
		this.callbackUrl = callbackUrl;
	}

	setPubkey(pubkey: string) {
		this.pubkey = pubkey;
	}

	getPubkeySync(): string | null {
		return this.pubkey;
	}

	async getPublicKey(): Promise<string> {
		if (this.pubkey) {
			return this.pubkey;
		}

		// Redirect to Amber for pubkey
		const url = `nostrsigner:?compressionType=none&returnType=signature&type=get_public_key&callbackUrl=${encodeURIComponent(this.callbackUrl)}`;
		window.location.href = url;

		// This will redirect, so we throw to indicate async flow
		throw new Error('Redirecting to Amber for authentication');
	}

	async signEvent(event: UnsignedEvent): Promise<NostrEvent> {
		if (!this.pubkey) {
			throw new Error('NIP-55 signer not initialized with pubkey');
		}

		// Create event with pubkey and id
		const eventWithPubkey = {
			...event,
			pubkey: this.pubkey
		};

		const id = getEventHash(eventWithPubkey as NostrEvent);
		const eventJson = JSON.stringify({ ...eventWithPubkey, id });

		// Generate a unique request ID
		const requestId = crypto.randomUUID();

		// Store in sessionStorage for callback retrieval
		sessionStorage.setItem(`nip55_sign_${requestId}`, eventJson);

		// Redirect to Amber for signing
		const callbackWithId = `${this.callbackUrl}?requestId=${requestId}`;
		const url = `nostrsigner:${encodeURIComponent(eventJson)}?compressionType=none&returnType=event&type=sign_event&callbackUrl=${encodeURIComponent(callbackWithId)}`;
		window.location.href = url;

		// This will redirect, so we throw to indicate async flow
		throw new Error('Redirecting to Amber for signing');
	}

	/**
	 * Handle callback from Amber with signed event
	 */
	handleSignCallback(requestId: string, signedEventJson: string): NostrEvent {
		sessionStorage.removeItem(`nip55_sign_${requestId}`);
		return JSON.parse(signedEventJson) as NostrEvent;
	}
}

/**
 * Create appropriate signer based on type
 */
export function createSigner(type: SignerType, callbackUrl: string = ''): Signer {
	switch (type) {
		case 'nip07':
			return new Nip07Signer();
		case 'nip55':
			return new Nip55Signer(callbackUrl);
		default:
			throw new Error(`Unknown signer type: ${type}`);
	}
}

/**
 * Generate the NIP-55 login URL for Amber
 */
export function getNip55LoginUrl(callbackUrl: string): string {
	return `nostrsigner:?compressionType=none&returnType=signature&type=get_public_key&callbackUrl=${encodeURIComponent(callbackUrl)}`;
}
