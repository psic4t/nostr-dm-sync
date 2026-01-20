<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { completeNip55Login } from '$lib/stores';

	let error = $state<string | null>(null);
	let processing = $state(true);

	onMount(() => {
		// Get pubkey from URL parameters
		const params = $page.url.searchParams;
		
		// NIP-55 returns the result in various ways
		// Check for 'result' parameter (pubkey) or 'event' parameter (for signed events)
		const result = params.get('result');
		const event = params.get('event');
		
		if (result) {
			// This is a pubkey response from get_public_key
			try {
				// Validate it looks like a hex pubkey
				if (/^[0-9a-fA-F]{64}$/.test(result)) {
					completeNip55Login(result);
					goto('/');
					return;
				} else {
					error = 'Invalid pubkey format received';
				}
			} catch (err) {
				error = err instanceof Error ? err.message : 'Failed to process callback';
			}
		} else if (event) {
			// This might be a signed event callback (for sign_event requests)
			// For now, we only handle login callbacks
			error = 'Unexpected event callback. Please try logging in again.';
		} else {
			error = 'No pubkey received from signer. Please try again.';
		}

		processing = false;
	});
</script>

<svelte:head>
	<title>Authenticating... | nostr-dm-sync</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-gray-900 px-4">
	<div class="max-w-md w-full text-center">
		{#if processing}
			<div class="space-y-4">
				<svg class="animate-spin h-12 w-12 mx-auto text-purple-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
					<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
				</svg>
				<p class="text-gray-400">Processing authentication...</p>
			</div>
		{:else if error}
			<div class="space-y-6">
				<div class="bg-red-900/30 border border-red-700 rounded-lg p-6">
					<svg class="w-12 h-12 mx-auto mb-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
					</svg>
					<h2 class="text-lg font-semibold text-white mb-2">Authentication Failed</h2>
					<p class="text-red-300">{error}</p>
				</div>
				<a
					href="/"
					class="inline-block px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors"
				>
					Back to Login
				</a>
			</div>
		{/if}
	</div>
</div>
