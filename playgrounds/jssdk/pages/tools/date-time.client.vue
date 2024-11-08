<script setup lang="ts">
import { DateTime } from 'luxon'
import { Text } from '@bitrix24/b24jssdk'
import Info from "~/components/Info.vue";

definePageMeta({
	layout: 'page',
	title: 'DateTime'
})

type TypeCase = {
	caption: string,
	data: string|DateTime,
}

const listCases: TypeCase[] = [
	{
		caption: 'Text.getDateForLog()',
		data: Text.getDateForLog()
	},
	{
		caption: 'Text.toDateTime(\'2012-04-12\', \'y-MM-dd\')',
		data: Text.toDateTime('2012-04-12', 'y-MM-dd'),
	},
	{
		caption: 'Text.toDateTime(\'12.04.2012\', \'dd.MM.y\')',
		data: Text.toDateTime('12.04.2012', 'dd.MM.y'),
	},
	{
		caption: 'Text.toDateTime(\'2012-04-12 14:05:56\', \'y-MM-dd HH:mm:ss\')',
		data: Text.toDateTime('2012-04-12 14:05:56', 'y-MM-dd HH:mm:ss'),
	},
	{
		caption: 'Text.toDateTime(\'2012-04-12T14:05:56+03:00\')',
		data: Text.toDateTime('2012-04-12T14:05:56+03:00'),
	}
]

</script>

<template>
	<Info>
		Using the <a href="https://moment.github.io/luxon/" target="_blank" class="underline hover:text-info-link">Luxon</a> library
	</Info>
	<div class="mt-xl text-md text-base-900 border border-base-30 rounded-md px-lg2 py-sm2 shadow-sm bg-white">
		<dl class="divide-y divide-base-300">
			<div
				class="px-2 py-1 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0"
				v-for="(caseData, caseIndex) in listCases"
				:key="caseIndex"
			>
				<dt class="text-sm font-medium leading-6 line-clamp-3">
					{{ caseData.caption }}
				</dt>
				<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0 whitespace-nowrap truncate ">
					<code v-if="caseData.data instanceof DateTime">{{ caseData.data.isValid ? caseData.data : caseData.data.invalidReason}}</code>
					<code v-else>{{ caseData.data }}</code>
				</dd>
			</div>
		</dl>
	</div>
</template>