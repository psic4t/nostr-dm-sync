// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	interface Window {
		nostr?: {
			getPublicKey(): Promise<string>;
			signEvent(event: import('./lib/nostr/types').UnsignedEvent): Promise<import('./lib/nostr/types').NostrEvent>;
			nip04?: {
				encrypt(pubkey: string, plaintext: string): Promise<string>;
				decrypt(pubkey: string, ciphertext: string): Promise<string>;
			};
			nip44?: {
				encrypt(pubkey: string, plaintext: string): Promise<string>;
				decrypt(pubkey: string, ciphertext: string): Promise<string>;
			};
		};
	}
}

export {};
