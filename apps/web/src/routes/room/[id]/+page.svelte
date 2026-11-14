<script lang="ts">
	import Game from '#lib/Game.svelte';
	import type { PageProps } from './$types';

	let { params }: PageProps = $props();
</script>

{#key params.id}
	<Game room={params.id} />
{/key}
