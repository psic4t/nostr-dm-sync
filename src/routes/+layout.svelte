<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { initFromStorage } from '$lib/stores';

	// Initialize user state from storage on mount
	onMount(() => {
		initFromStorage();
	});
</script>

<slot />
