<script lang="ts">
	import { getMessageState } from '$lib/stores';
	import { getGiftwrapPQueryCap } from '$lib/nostr';

	interface Props {
		url: string;
		onSync?: (url: string) => void;
	}

	let { url, onSync }: Props = $props();

	const messageState = getMessageState();

	const isFetching = $derived(messageState.isFetching(url));
	const totalMessages = $derived(messageState.getMessageCount(url));
	const uniqueMessages = $derived(messageState.getUniqueCount(url));
	const missingElsewhere = $derived(messageState.getMissingCount(url));
	const fetchError = $derived(messageState.fetchErrors.get(url));
	const fetchProgressCount = $derived(messageState.getFetchProgress(url));
	const giftwrapPQueryCap = $derived(getGiftwrapPQueryCap(url));

	function handleSync() {
		onSync?.(url);
	}

	// Format relay URL for display
	function formatUrl(relayUrl: string): string {
		try {
			const parsed = new URL(relayUrl);
			return parsed.hostname;
		} catch {
			return relayUrl;
		}
	}
</script>

<div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
	<div class="flex items-start justify-between mb-3">
		<div class="flex items-center gap-2 min-w-0">
			<h3 class="text-white font-medium truncate" title={url}>
				{formatUrl(url)}
			</h3>
			{#if giftwrapPQueryCap === false}
				<span class="shrink-0 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border border-amber-500/40 text-amber-300 bg-amber-500/10">
					Unqueryable (#p)
				</span>
			{/if}
		</div>
	</div>

	{#if isFetching}
		<div class="flex items-center gap-2 text-gray-400 mb-3">
			<svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
				<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
				<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
			</svg>
			<span class="text-sm">
				{#if fetchProgressCount > 0}
					Fetching... ({fetchProgressCount.toLocaleString()} messages)
				{:else}
					Connecting...
				{/if}
			</span>
		</div>
	{:else if fetchError}
		<div class="text-red-400 text-sm mb-3">
			{fetchError}
		</div>
	{:else}
		<div class="grid grid-cols-3 gap-3 mb-4">
			<div>
				<p class="text-gray-400 text-xs uppercase tracking-wide">Total</p>
				<p class="text-2xl font-bold text-white">
					{#if giftwrapPQueryCap === false}
						N/A
					{:else}
						{totalMessages.toLocaleString()}
					{/if}
				</p>
			</div>
			<div>
				<p class="text-gray-400 text-xs uppercase tracking-wide">Unique</p>
				<p class="text-2xl font-bold {uniqueMessages > 0 ? 'text-amber-400' : 'text-white'}">
					{uniqueMessages.toLocaleString()}
				</p>
			</div>
			<div>
				<p class="text-gray-400 text-xs uppercase tracking-wide">Missing</p>
				<p class="text-2xl font-bold {missingElsewhere > 0 ? 'text-purple-400' : 'text-white'}">
					{missingElsewhere.toLocaleString()}
				</p>
			</div>
		</div>
	{/if}

	<button
		onclick={handleSync}
		disabled={missingElsewhere === 0 || isFetching}
		class="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm"
	>
		{#if giftwrapPQueryCap === false}
			Sync (unqueryable relay)
		{:else if missingElsewhere > 0}
			Sync {missingElsewhere} message{missingElsewhere !== 1 ? 's' : ''} to other relays
		{:else}
			All messages synced
		{/if}
	</button>
</div>
