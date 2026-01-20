<script lang="ts">
	import { getMessageState, getRelayState, syncMissingMessages, resetSyncState } from '$lib/stores';

	interface Props {
		sourceRelay: string;
		onClose: () => void;
	}

	let { sourceRelay, onClose }: Props = $props();

	const messageState = getMessageState();
	const relayState = getRelayState();

	// Local state for sync
	let isStarted = $state(false);
	let isComplete = $state(false);
	let currentProgress = $state(0);
	let totalMessages = $state(0);
	let results = $state<Map<string, { success: number; failed: number; total: number; errors: string[] }>>(new Map());

	const targetRelays = $derived(
		relayState.messagingRelays.filter((url) => url !== sourceRelay)
	);

	const missingByRelay = $derived(messageState.getMissingByRelay(sourceRelay));
	const totalMissingCount = $derived(messageState.getMissingCount(sourceRelay));

	const progressPercent = $derived(
		totalMessages > 0 ? Math.round((currentProgress / totalMessages) * 100) : 0
	);

	async function startSync() {
		isStarted = true;
		totalMessages = totalMissingCount;

		await syncMissingMessages(sourceRelay, targetRelays, (current, total, syncResults) => {
			currentProgress = current;
			totalMessages = total;
			results = new Map(syncResults);
		});

		isComplete = true;
	}

	function handleClose() {
		if (isStarted && !isComplete) {
			// Could add confirmation here
		}
		resetSyncState();
		onClose();
	}

	function formatUrl(relayUrl: string): string {
		try {
			const parsed = new URL(relayUrl);
			return parsed.hostname;
		} catch {
			return relayUrl;
		}
	}
</script>

<!-- Modal backdrop -->
<div class="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
	<!-- Modal content -->
	<div class="bg-gray-800 rounded-lg max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
		<!-- Header -->
		<div class="p-4 border-b border-gray-700">
			<h2 class="text-lg font-semibold text-white">
				Syncing from {formatUrl(sourceRelay)}
			</h2>
		</div>

		<!-- Body -->
		<div class="p-4 overflow-y-auto flex-1">
			{#if !isStarted}
				<!-- Pre-sync breakdown -->
				<div class="space-y-4">
					<p class="text-gray-300">
						Will sync <span class="text-white font-semibold">{totalMissingCount}</span> message{totalMissingCount !== 1 ? 's' : ''} to:
					</p>
					<div class="space-y-2">
						{#each targetRelays as relay (relay)}
							{@const missingCount = missingByRelay.get(relay)?.length ?? 0}
							<div class="flex items-center justify-between bg-gray-700/50 rounded-lg px-3 py-2">
								<span class="text-white text-sm truncate" title={relay}>
									{formatUrl(relay)}
								</span>
								<span class="text-sm {missingCount > 0 ? 'text-purple-400' : 'text-green-400'}">
									{#if missingCount > 0}
										{missingCount} missing
									{:else}
										synced
									{/if}
								</span>
							</div>
						{/each}
					</div>
					
					<button
						onclick={startSync}
						disabled={totalMissingCount === 0}
						class="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors"
					>
						Start Sync
					</button>
				</div>
			{:else if !isComplete}
				<div class="space-y-4">
					<!-- Progress bar -->
					<div>
						<div class="flex justify-between text-sm text-gray-400 mb-2">
							<span>Syncing messages...</span>
							<span>{currentProgress} / {totalMessages}</span>
						</div>
						<div class="w-full bg-gray-700 rounded-full h-2.5">
							<div 
								class="bg-purple-600 h-2.5 rounded-full transition-all duration-300"
								style="width: {progressPercent}%"
							></div>
						</div>
					</div>

					<!-- Target relays status -->
					<div class="space-y-2">
						<p class="text-sm text-gray-400">Target Relays:</p>
						{#each targetRelays as relay (relay)}
							{@const relayResult = results.get(relay)}
							{@const relayTotal = relayResult?.total ?? 0}
							<div class="flex items-center justify-between bg-gray-700/50 rounded-lg px-3 py-2">
								<span class="text-white text-sm truncate" title={relay}>
									{formatUrl(relay)}
								</span>
								<span class="text-sm flex items-center gap-2">
									{#if relayResult}
										{#if relayResult.success > 0}
											<span class="text-green-400">{relayResult.success}/{relayTotal}</span>
										{/if}
										{#if relayResult.failed > 0}
											<span class="text-red-400">{relayResult.failed} failed</span>
										{/if}
										{#if relayResult.success === 0 && relayResult.failed === 0}
											<span class="text-gray-500">0/{relayTotal}</span>
										{/if}
									{:else}
										<span class="text-gray-500">Pending</span>
									{/if}
								</span>
							</div>
						{/each}
					</div>
				</div>
			{:else}
				<!-- Completion summary -->
				<div class="space-y-4">
					<div class="text-center py-4">
						<svg class="w-12 h-12 mx-auto mb-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						<h3 class="text-lg font-semibold text-white">Sync Complete!</h3>
						<p class="text-gray-400 text-sm mt-1">
							Processed {totalMessages} message{totalMessages !== 1 ? 's' : ''}
						</p>
					</div>

					<!-- Results per relay -->
					<div class="space-y-2">
						{#each targetRelays as relay (relay)}
							{@const relayResult = results.get(relay)}
							<div class="bg-gray-700/50 rounded-lg px-3 py-2">
								<div class="flex items-center justify-between">
									<span class="text-white text-sm truncate" title={relay}>
										{formatUrl(relay)}
									</span>
									<div class="flex items-center gap-3 text-sm">
										{#if relayResult}
											<span class="text-green-400 flex items-center gap-1">
												<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
													<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
												</svg>
												{relayResult.success}
											</span>
											{#if relayResult.failed > 0}
												<span class="text-red-400 flex items-center gap-1">
													<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
														<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
													</svg>
													{relayResult.failed}
												</span>
											{/if}
										{/if}
									</div>
								</div>
								{#if relayResult?.errors && relayResult.errors.length > 0}
									<div class="mt-2 text-xs text-red-400">
										{relayResult.errors.slice(0, 3).join(', ')}
										{#if relayResult.errors.length > 3}
											<span>... and {relayResult.errors.length - 3} more</span>
										{/if}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		<!-- Footer -->
		<div class="p-4 border-t border-gray-700">
			<button
				onclick={handleClose}
				class="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
			>
				{#if isComplete}
					Close
				{:else if isStarted}
					Cancel
				{:else}
					Cancel
				{/if}
			</button>
		</div>
	</div>
</div>
