// Nostr event types following NIP-01

export interface NostrEvent {
	id: string;
	pubkey: string;
	created_at: number;
	kind: number;
	tags: string[][];
	content: string;
	sig: string;
}

export interface UnsignedEvent {
	created_at: number;
	kind: number;
	tags: string[][];
	content: string;
}

export interface NostrFilter {
	ids?: string[];
	authors?: string[];
	kinds?: number[];
	'#e'?: string[];
	'#p'?: string[];
	since?: number;
	until?: number;
	limit?: number;
}

// Relay message types
export type RelayMessage =
	| ['EVENT', string, NostrEvent]
	| ['OK', string, boolean, string]
	| ['EOSE', string]
	| ['CLOSED', string, string]
	| ['NOTICE', string]
	| ['AUTH', string];

export type ClientMessage =
	| ['REQ', string, ...NostrFilter[]]
	| ['CLOSE', string]
	| ['EVENT', NostrEvent]
	| ['AUTH', NostrEvent];

// Connection status
export type RelayStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

// Signer types
export type SignerType = 'nip07' | 'nip55';

export interface Signer {
	type: SignerType;
	getPublicKey(): Promise<string>;
	signEvent(event: UnsignedEvent): Promise<NostrEvent>;
}

// Kind constants
export const KIND_RELAY_LIST_METADATA = 10050;
export const KIND_GIFT_WRAP = 1059;
export const KIND_AUTH = 22242;
