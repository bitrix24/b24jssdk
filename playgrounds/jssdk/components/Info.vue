<script setup lang="ts">
import CodeIcon from '@bitrix24/b24icons-vue/common-service/CodeIcon'
</script>

<template>
	<div
		class="px-lg py-md rounded-md text-warning-background-on bg-warning-background flex flex-row flex-nowrap gap-4 items-center justify-start"
	>
		<div class="rounded-full border-2 border-warning-background-on bg-white size-5xl min-w-10 min-h-10 flex items-center justify-center">
			<component
				:is="CodeIcon"
				class="size-2xl text-warning-background-on"
			></component>
		</div>
		<div>
			<slot />
		</div>
	</div>
</template>