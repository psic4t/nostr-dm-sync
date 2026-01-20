<script lang="ts">
	import { onMount } from 'svelte';
	import { nip19 } from 'nostr-tools';
	import Login from '$components/Login.svelte';
	import RelayList from '$components/RelayList.svelte';
	import SyncModal from '$components/SyncModal.svelte';
	import {
		getUserState,
		logout,
		getRelayState,
		discoverMessagingRelays,
		resetRelayState,
		getMessageState,
		fetchAllMessages,
		resetMessageState
	} from '$lib/stores';

	const user = getUserState();
	const relayState = getRelayState();
	const messageState = getMessageState();

	// Sync modal state
	let showSyncModal = $state(false);
	let syncSourceRelay = $state<string | null>(null);

	// Guards to prevent duplicate operations
	let discoveryStarted = $state(false);
	let fetchStarted = $state(false);

	// Format pubkey as npub for display
	const npub = $derived(
		user.pubkey ? nip19.npubEncode(user.pubkey).slice(0, 16) + '...' : ''
	);

	// Start discovery when user logs in
	async function handlePostLogin() {
		if (!user.pubkey || discoveryStarted) return;

		discoveryStarted = true;
		console.log('[Page] Starting post-login flow');

		// Discover messaging relays
		const relays = await discoverMessagingRelays(user.pubkey);

		// Fetch messages if we found relays
		if (relays.length > 0 && !fetchStarted) {
			fetchStarted = true;
			await fetchAllMessages(relays, user.pubkey);
		}
	}

	// Watch for login and trigger discovery
	$effect(() => {
		if (user.isLoggedIn && user.pubkey && !discoveryStarted) {
			handlePostLogin();
		}
	});

	function handleLogout() {
		// Reset guards
		discoveryStarted = false;
		fetchStarted = false;

		// Reset state
		resetMessageState();
		resetRelayState();
		logout();
	}

	function handleSync(url: string) {
		syncSourceRelay = url;
		showSyncModal = true;
	}

	async function handleSyncClose() {
		showSyncModal = false;
		syncSourceRelay = null;

		// Refresh messages after sync
		if (user.pubkey && relayState.messagingRelays.length > 0) {
			await fetchAllMessages(relayState.messagingRelays, user.pubkey);
		}
	}
</script>

<svelte:head>
	<title>nostr-dm-sync</title>
	<meta name="description" content="Sync your NIP-17 direct messages across Nostr relays" />
</svelte:head>

{#if !user.isLoggedIn}
	<Login />
{:else}
	<div class="min-h-screen bg-gray-900">
		<!-- Header -->
		<header class="bg-gray-800 border-b border-gray-700">
			<div class="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
				<h1 class="text-xl font-bold text-white">nostr-dm-sync</h1>
				<div class="flex items-center gap-4">
					<span class="text-gray-400 text-sm font-mono">{npub}</span>
					<button
						onclick={handleLogout}
						class="px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
					>
						Logout
					</button>
				</div>
			</div>
		</header>

		<!-- Main content -->
		<main class="max-w-6xl mx-auto px-4 py-8">
			<RelayList onSync={handleSync} />
		</main>
	</div>

	<!-- Sync Modal -->
	{#if showSyncModal && syncSourceRelay}
		<SyncModal sourceRelay={syncSourceRelay} onClose={handleSyncClose} />
	{/if}
{/if}
