<script lang="ts">
	import { getMessageState, getConnectionState, reconnectToRelay, fetchMessagesFromRelay } from '$lib/stores';
	import { getGiftwrapPQueryCap } from '$lib/nostr';
	import { getUserState } from '$lib/stores';

	interface Props {
		url: string;
		onSync?: (url: string) => void;
	}

	let { url, onSync }: Props = $props();

	const messageState = getMessageState();
	const connectionState = getConnectionState();
	const userState = getUserState();

	const isFetching = $derived(messageState.isFetching(url));
	const totalMessages = $derived(messageState.getMessageCount(url));
	const uniqueMessages = $derived(messageState.getUniqueCount(url));
	const missingElsewhere = $derived(messageState.getMissingCount(url));
	const fetchError = $derived(messageState.fetchErrors.get(url));
	const fetchProgressCount = $derived(messageState.getFetchProgress(url));
	const giftwrapPQueryCap = $derived(getGiftwrapPQueryCap(url));
	const fetchStatus = $derived(messageState.getFetchStatus(url));

	// Connection status
	const connectionStatus = $derived(connectionState.getStatus(url));
	const connectionError = $derived(connectionState.getError(url));
	const isReconnecting = $derived(connectionState.isReconnecting(url));

	// Determine if relay is in error/disconnected state
	const hasConnectionError = $derived(
		connectionStatus === 'error' || connectionStatus === 'disconnected'
	);

	// Determine if fetch had issues (timeout or partial)
	const hasFetchWarning = $derived(
		fetchStatus?.status === 'timeout' || fetchStatus?.status === 'partial'
	);

	function handleSync() {
		onSync?.(url);
	}

	async function handleRetry() {
		await reconnectToRelay(url);
	}

	async function handleRefetch() {
		if (userState.pubkey) {
			await fetchMessagesFromRelay(url, userState.pubkey);
		}
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

	// Get status indicator color
	function getStatusColor(status: string | null): string {
		switch (status) {
			case 'connected':
				return 'bg-green-500';
			case 'connecting':
				return 'bg-yellow-500';
			case 'disconnected':
			case 'error':
				return 'bg-red-500';
			default:
				return 'bg-gray-500';
		}
	}

	// Get status badge styling
	function getStatusBadgeClass(status: string | null): string {
		switch (status) {
			case 'connected':
				return 'border-green-500/40 text-green-300 bg-green-500/10';
			case 'connecting':
				return 'border-yellow-500/40 text-yellow-300 bg-yellow-500/10';
			case 'disconnected':
			case 'error':
				return 'border-red-500/40 text-red-300 bg-red-500/10';
			default:
				return 'border-gray-500/40 text-gray-300 bg-gray-500/10';
		}
	}

	// Get status label
	function getStatusLabel(status: string | null): string {
		switch (status) {
			case 'connected':
				return 'Connected';
			case 'connecting':
				return 'Connecting';
			case 'disconnected':
				return 'Disconnected';
			case 'error':
				return 'Error';
			default:
				return 'Unknown';
		}
	}
</script>

<div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
	<div class="flex items-start justify-between mb-3">
		<div class="flex items-center gap-2 min-w-0">
			<!-- Status indicator dot -->
			<span
				class="shrink-0 w-2.5 h-2.5 rounded-full {getStatusColor(connectionStatus)} {connectionStatus === 'connecting' || isReconnecting ? 'animate-pulse' : ''}"
				title={getStatusLabel(connectionStatus)}
			></span>
			<h3 class="text-white font-medium truncate" title={url}>
				{formatUrl(url)}
			</h3>
		</div>
		<div class="flex items-center gap-2 shrink-0">
			<!-- Connection status badge -->
			{#if connectionStatus}
				<span class="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border {getStatusBadgeClass(connectionStatus)}">
					{#if isReconnecting}
						Reconnecting
					{:else}
						{getStatusLabel(connectionStatus)}
					{/if}
				</span>
			{/if}
			{#if giftwrapPQueryCap === false}
				<span class="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border border-amber-500/40 text-amber-300 bg-amber-500/10">
					Unqueryable (#p)
				</span>
			{/if}
		</div>
	</div>

	{#if hasConnectionError && !isFetching}
		<!-- Connection error state -->
		<div class="mb-3">
			<p class="text-red-400 text-sm mb-2">
				{connectionError || 'Connection failed'}
			</p>
			<button
				onclick={handleRetry}
				disabled={isReconnecting}
				class="w-full px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
			>
				{#if isReconnecting}
					<svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
					</svg>
					Reconnecting...
				{:else}
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
					</svg>
					Retry Connection
				{/if}
			</button>
		</div>
	{:else if isFetching}
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
	{:else if fetchError && !hasFetchWarning}
		<div class="text-red-400 text-sm mb-3">
			{fetchError}
		</div>
	{:else}
		<!-- Fetch warning banner for timeout/partial -->
		{#if hasFetchWarning}
			<div class="mb-3 p-2 rounded-lg border {fetchStatus?.status === 'timeout' ? 'bg-amber-900/20 border-amber-700/50' : 'bg-yellow-900/20 border-yellow-700/50'}">
				<div class="flex items-start gap-2">
					<svg class="w-4 h-4 shrink-0 mt-0.5 {fetchStatus?.status === 'timeout' ? 'text-amber-400' : 'text-yellow-400'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
					</svg>
					<div class="flex-1 min-w-0">
						<p class="text-sm {fetchStatus?.status === 'timeout' ? 'text-amber-300' : 'text-yellow-300'}">
							{#if fetchStatus?.status === 'timeout'}
								Query timed out - relay may be slow
							{:else}
								Partial results - some data may be missing
							{/if}
						</p>
						{#if fetchStatus?.errorMessage}
							<p class="text-xs text-gray-400 mt-0.5">{fetchStatus.errorMessage}</p>
						{/if}
					</div>
					<button
						onclick={handleRefetch}
						disabled={isFetching}
						class="shrink-0 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded transition-colors"
					>
						Retry
					</button>
				</div>
			</div>
		{/if}

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

	{#if !hasConnectionError || isFetching}
		<button
			onclick={handleSync}
			disabled={missingElsewhere === 0 || isFetching || hasConnectionError}
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
	{/if}
</div>
