<script lang="ts">
	import { getRelayState, getMessageState } from '$lib/stores';
	import RelayCard from './RelayCard.svelte';

	interface Props {
		onSync?: (url: string) => void;
	}

	let { onSync }: Props = $props();

	const relayState = getRelayState();
	const messageState = getMessageState();

	// Check if any relay is currently fetching
	const isAnyFetching = $derived(
		relayState.messagingRelays.some(url => messageState.isFetching(url))
	);
	const isLoading = $derived(relayState.isDiscovering || isAnyFetching);
</script>

<div class="space-y-6">
	{#if relayState.isDiscovering}
		<div class="flex items-center justify-center py-12">
			<div class="text-center">
				<svg class="animate-spin h-8 w-8 mx-auto mb-4 text-purple-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
					<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
				</svg>
				<p class="text-gray-400">Discovering your messaging relays...</p>
			</div>
		</div>
	{:else if relayState.discoveryError}
		<div class="bg-amber-900/30 border border-amber-700 rounded-lg p-6 text-center">
			<svg class="w-12 h-12 mx-auto mb-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
			</svg>
			<p class="text-amber-300 mb-2">{relayState.discoveryError}</p>
			<p class="text-gray-400 text-sm">
				Your messaging relays are defined in a kind 10050 event. 
				Use a Nostr client like Amethyst, Damus, or Primal to configure them.
			</p>
		</div>
	{:else if relayState.messagingRelays.length === 0}
		<div class="bg-gray-800 rounded-lg p-6 text-center">
			<p class="text-gray-400">No messaging relays found.</p>
		</div>
	{:else}
		<div class="space-y-4">
			<div class="flex items-center justify-between">
				<h2 class="text-lg font-semibold text-white">
					Your Messaging Relays ({relayState.messagingRelays.length})
				</h2>
				{#if isLoading}
					<span class="text-sm text-gray-400 flex items-center gap-2">
						<svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
						</svg>
						Loading...
					</span>
				{/if}
			</div>

			<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				{#each relayState.messagingRelays as url (url)}
					<RelayCard {url} {onSync} />
				{/each}
			</div>
		</div>
	{/if}
</div>
