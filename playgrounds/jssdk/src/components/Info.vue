<script setup lang="ts">
import CodeIcon from '@bitrix24/b24icons-vue/common-service/CodeIcon'
</script>

<template>
	<div class="mt-2 py-2 rounded text-warning-background-on border-l-2 border-l-warning-link bg-warning-background pl-2 flex flex-row flex-nowrap gap-4 items-center justify-self-auto">
		<CodeIcon class="w-8 h-8" />
		<div class=""><slot /></div>
	</div>
</template>