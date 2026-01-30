// Types
export type {
	NostrEvent,
	UnsignedEvent,
	NostrFilter,
	RelayStatus,
	SignerType,
	Signer
} from './types';

export {
	KIND_RELAY_LIST_METADATA,
	KIND_GIFT_WRAP,
	KIND_AUTH
} from './types';

// Signer
export {
	hasNip07,
	Nip07Signer,
	Nip55Signer,
	createSigner,
	getNip55LoginUrl
} from './signer';

// Relay (direct Relay connections with AUTH support)
export {
	setSigner,
	getSigner,
	queryRelays,
	queryRelay,
	publishToRelays,
	closeRelays,
	destroyPool,
	getGiftwrapPQueryCap,
	detectPtagFilterCapability,
	getRelayConnectionStatus,
	getRelayConnectionError,
	reconnectRelay,
	getAllRelayConnectionStatuses,
	onConnectionStatusChange
} from './relay';

export type { RelayConnectionStatus } from './relay';

// NIP-17
export {
	DEFAULT_RELAYS,
	fetchMessagingRelays,
	fetchGiftWraps
} from './nip17';

export type { FetchGiftWrapsResult } from './nip17';
export type { QueryResult } from './relay';
