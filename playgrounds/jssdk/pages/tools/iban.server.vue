<script setup lang="ts">
import { useFormatter } from "@bitrix24/b24jssdk";

definePageMeta({
	layout: 'page',
	title: 'IBAN'
})

const { formatterIban } = useFormatter()

const listCases = ref([
	'IE29AIBK93115212345678',
	'ES9121000418450200051332',
	'GB29NWBK60161331926819',
	'PL61109010140000071219812874',
	'FR1420041010050500013M02606',
	'IT60X0542811101000000123456',
	'PT50000201231234567890154',
	'NL91ABNA0417164300',
	'IR710570029971601460641001',
	'AZ77VTBA00000000001234567890',
	'GE60NB0000000123456789',
	'JO71CBJO0000000000001234567890',
	'BY09ALFA30132120160130270000',
])
</script>

<template>
	<div class="text-md text-base-900 border border-base-30 rounded-md px-lg2 py-sm2 shadow-sm bg-white">
		<dl class="divide-y divide-base-300">
			<div
				class="px-2 py-1 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0"
				v-for="(caseData, caseIndex) in listCases"
				:key="caseIndex"
			>
				<dt class="text-sm font-medium leading-6 line-clamp-3">
					{{ caseData }}
				</dt>
				<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0 whitespace-nowrap truncate ">
					{{ formatterIban.printFormat(caseData, ' ') }}
				</dd>
			</div>
		</dl>
	</div>
</template>