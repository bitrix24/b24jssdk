<script setup lang="ts">
import CodeIcon from '@bitrix24/b24icons-vue/common-service/CodeIcon'
</script>

<template>
	<div class="mt-2 px-lg py-md rounded text-warning-background-on bg-warning-background flex flex-row flex-nowrap gap-4 items-center justify-start">
		<CodeIcon class="hidden sm:block w-7 h-7" />
		<div class="flex-1 leading-4"><slot /></div>
	</div>
</template>