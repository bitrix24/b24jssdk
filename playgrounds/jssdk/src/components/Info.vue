<script setup lang="ts">
import CodeIcon from '@bitrix24/b24icons-vue/common-service/CodeIcon'
</script>

<template>
	<div class="mt-2 py-2 px-4 sm:pl-2 rounded text-warning-background-on bg-warning-background  flex flex-row flex-nowrap gap-4 items-start justify-self-auto">
		<CodeIcon class="hidden sm:block w-8 h-8" />
		<div class="flex-1"><slot /></div>
	</div>
</template>