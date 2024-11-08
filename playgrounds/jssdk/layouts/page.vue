<script setup lang="ts">
useHead({
	bodyAttrs: {
		class: 'bg-tertiary font-b24-system text-base-900 antialiased',
	}
})

const route = useRoute()

</script>

<template>
	<div class="flex flex-col" >
		<div class="px-lg mb-xs2">
			<div class="min-h-7xl h-7xl w-full flex flex-row items-center justify-normal gap-lg2 border-b border-b-base-900/0.1">
				<div class="pl-xs2 text-4xl font-light font-b24-secondary text-base-master">{{ route.meta.title }}</div>
				<div class="pr-xs2 grow flex gap-4 flex-row items-end justify-end text-lg">
					<div class="grow font-b24-primary" v-if="route.path !== '/'">
						<div class="flex flex-row gap-2xs items-end">
							<div class="flex flex-col">
								<div class="text-3xs leading-tight opacity-70 text-base-500 items-center">Playground</div>
								<NuxtLink
									to="/"
									class="text-sm text-primary-link cursor-pointer transition-opacity hover:opacity-80 border-b border-dashed border-b-primary-link"
								>list actions</NuxtLink>
							</div>
						</div>
					</div>
					<div class="text-md font-light text-base-900">
						<a
							class="hover:text-primary-link hover:underline underline-offset-2 transition-opacity hover:opacity-80"
							href="https://bitrix24.github.io/b24style/reference/colors.html"
							target="_blank"
						>@bitrix24/b24style</a>
					</div>
					<div class="text-md font-light text-base-900">
						<a
							class="hover:text-primary-link hover:underline underline-offset-2 transition-opacity hover:opacity-80"
							href="https://bitrix24.github.io/b24icons/guide/icons.html"
							target="_blank"
						>@bitrix24/b24icons</a>
					</div>
				</div>
			</div>
		</div>
		<div class="mx-lg my-sm px-xs2 flex flex-col">
			<slot></slot>
		</div>
	</div>
</template>