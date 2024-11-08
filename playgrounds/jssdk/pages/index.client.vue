<script setup lang="ts">
import WheelIcon from '@bitrix24/b24icons-vue/common-service/WheelIcon'
import CheckIcon from '@bitrix24/b24icons-vue/main/CheckIcon'
import CloudTransferDataIcon from '@bitrix24/b24icons-vue/main/CloudTransferDataIcon'


definePageMeta({
	layout: "page",
	title: 'Playground'
})

interface Item {
	code: string,
	icon: any,
	title: string,
	description: string,
	isActive: boolean,
}

interface Group {
	code: string,
	title: string,
	items: Item[]
}

const groups: Ref<Group[]> = ref([
	{
		code: `hook`,
		title: 'Hook',
		items: [
			{
				code: 'crm-item-list',
				icon: WheelIcon,
				title: 'List of companies',
				description: 'Shows a selection of data from CRM by company',
				isActive: false,
			},
			{
				code: 'testing-rest-api-calls',
				icon: CloudTransferDataIcon,
				title: 'Testing Rest-Api calls',
				description: 'Shows a sample of data',
				isActive: false,
			},
		]
	} as Group,
	{
		code: `core`,
		title: 'Core',
		items: [
			{
				code: 'use-result',
				icon: WheelIcon,
				title: 'Result',
				description: 'Example of working with the Result object',
				isActive: false,
			},
			{
				code: '404',
				icon: WheelIcon,
				title: 'Page 404',
				description: 'Error handling example',
				isActive: false,
			}
		]
	} as Group,
	{
		code: `tools`,
		title: 'Tools',
		items: [
			{
				code: 'use-logger',
				icon: WheelIcon,
				title: 'LoggerBrowser',
				description: 'Example of working with the LoggerBrowser object',
				isActive: false,
			},
			{
				code: 'date-time',
				icon: WheelIcon,
				title: 'DateTime',
				description: 'A couple of examples of date and time processing',
				isActive: false,
			},
			{
				code: 'iban',
				icon: WheelIcon,
				title: 'IBAN',
				description: 'IBAN formatting demonstration',
				isActive: false,
			}
		]
	} as Group
])
</script>

<template>
	<div
		v-for="(group) in groups"
		:key="group.code"
		class="mb-md"
	>
		<div class="mb-sm font-b24-secondary text-h4 font-light leading-8 text-base-900">{{ group.title }}</div>
		<div class="grid grid-cols-[repeat(auto-fill,minmax(266px,1fr))] gap-y-sm gap-x-xs">
			<NuxtLink
				v-for="(item) in group.items"
				:key="item.code"
				class="bg-white py-sm2 px-xs2 cursor-pointer rounded-md flex flex-row gap-sm border-2 transition-shadow shadow hover:shadow-lg relative"
				:class="item.isActive ? 'border-success-text' : 'border-white hover:border-primary'"
				:to="`/${group.code}/${item.code}`"
			>
				<div
					v-if="item.isActive"
					class="absolute -top-2 -right-2 rounded-full bg-success-text size-5 text-success-on flex items-center justify-center"
				>
					<CheckIcon class="size-md" />
				</div>
				<div class="rounded-full bg-blue-200 size-14 min-w-14 min-h-14 flex items-center justify-center">
					<component
						:is="item.icon"
						class="size-12 text-info-text"
					></component>
				</div>
				<div class="max-w-11/12">
					<div
						class="font-b24-secondary text-black text-h6 leading-4 mb-xs font-semibold line-clamp-2"
						:title="item.title"
					>{{ item.title }}</div>
					<div
						class="font-b24-primary text-sm text-base-500 line-clamp-2"
						:title="item.description"
					>
						<div>{{ item.description }}</div>
					</div>
				</div>
			</NuxtLink>
		</div>
	</div>
</template>