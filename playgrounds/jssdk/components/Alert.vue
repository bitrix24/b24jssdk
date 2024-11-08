<script setup lang="ts">
import AlertIcon from '@bitrix24/b24icons-vue/button/AlertIcon'
</script>

<template>
	<div class="px-lg py-md rounded-md text-white bg-red-500 flex flex-row flex-nowrap gap-4 items-center justify-start">
		<div class="rounded-full border-2 border-red-400 bg-white size-5xl min-w-10 min-h-10 flex items-center justify-center">
			<component
				:is="AlertIcon"
				class="size-2xl text-red-500"
			></component>
		</div>
		<div>
			<slot />
		</div>
	</div>
</template>