<script lang="ts">
	import Game from '#lib/Game.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

{#key data.room}
	<Game game={data.game} room={data.room} />
{/key}
