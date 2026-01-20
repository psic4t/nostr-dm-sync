<script lang="ts">
	import { getUserState, loginWithNip07, loginWithNip55, checkNip07 } from '$lib/stores';
	import { onMount } from 'svelte';

	const user = getUserState();

	// Check for NIP-07 on mount (client-side only)
	let hasNip07 = $state(false);

	onMount(() => {
		hasNip07 = checkNip07();
	});

	function handleNip07Login() {
		loginWithNip07();
	}

	function handleNip55Login() {
		loginWithNip55();
	}
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-900 px-4">
	<div class="max-w-md w-full space-y-8">
		<div class="text-center">
			<h1 class="text-4xl font-bold text-white mb-2">nostr-dm-sync</h1>
			<p class="text-gray-400 text-lg">
				Sync your NIP-17 direct messages across all your messaging relays
			</p>
		</div>

		<div class="bg-gray-800 rounded-lg p-8 space-y-6">
			<div class="space-y-4">
				{#if hasNip07}
					<button
						onclick={handleNip07Login}
						disabled={user.isLoggingIn}
						class="w-full flex items-center justify-center gap-3 px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
					>
						{#if user.isLoggingIn}
							<svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
							</svg>
							Connecting...
						{:else}
							<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
								<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
							</svg>
							Login with Browser Extension
						{/if}
					</button>
				{:else}
					<div class="w-full px-4 py-3 bg-gray-700 text-gray-400 text-center rounded-lg">
						<p class="text-sm">No NIP-07 extension detected</p>
						<p class="text-xs mt-1">Install Alby, nos2x, or another Nostr extension</p>
					</div>
				{/if}

				<div class="relative">
					<div class="absolute inset-0 flex items-center">
						<div class="w-full border-t border-gray-600"></div>
					</div>
					<div class="relative flex justify-center text-sm">
						<span class="px-2 bg-gray-800 text-gray-400">or</span>
					</div>
				</div>

				<button
					onclick={handleNip55Login}
					disabled={user.isLoggingIn}
					class="w-full flex items-center justify-center gap-3 px-4 py-3 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
				>
					<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
						<path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/>
					</svg>
					Login with Amber (Mobile)
				</button>
			</div>

			{#if user.loginError}
				<div class="p-3 bg-red-900/50 border border-red-700 rounded-lg">
					<p class="text-red-300 text-sm">{user.loginError}</p>
				</div>
			{/if}

			<div class="text-center text-gray-500 text-sm">
				<p>Your private key never leaves your signer.</p>
				<p class="mt-1">We only read your public key and message metadata.</p>
			</div>
		</div>
	</div>
</div>
