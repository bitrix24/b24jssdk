<script setup lang="ts">
import B24HookConfig from '../../config.hook'
import { DateTime } from 'luxon'
import { ref, reactive, computed, type Ref } from 'vue'
import Search1Icon from '@bitrix24/b24icons-vue/main/Search1Icon'
import AlertIcon from '@bitrix24/b24icons-vue/button/AlertIcon'
import FileDownloadIcon from '@bitrix24/b24icons-vue/main/FileDownloadIcon'
import CompanyIcon from '@bitrix24/b24icons-vue/crm/CompanyIcon'

import {
	LoggerBrowser,
	Result,
	B24Hook,
	EnumCrmEntityTypeId,
	Text, B24LangList
} from '@bitrix24/b24jssdk'
import type { IResult, ISODate } from '@bitrix24/b24jssdk'

import Info from '../../components/Info.vue'
import Alert from '../../components/Alert.vue'

definePageMeta({
	layout: 'page',
	title: 'List of companies'
})

const $logger = LoggerBrowser.build(
	'Demo: crm.items.list',
	import.meta.env?.DEV === true
)

let result: IResult = reactive(new Result())
const isProcessLoadB24: Ref<boolean> = ref(false)
const dataList: Ref<{
	id: number,
	title: string,
	createdTime: DateTime
}[]> = ref([])
const problemMessageList = computed(() => {
	let problemMessageList: string[] = [];
	const problem = result.getErrorMessages();
	if( typeof (problem || '') === 'string' )
	{
		problemMessageList.push(problem.toString());
	}
	else if(Array.isArray(problem))
	{
		problemMessageList = problemMessageList.concat(problem);
	}
	
	return problemMessageList;
})

const openSlider = async (id: number): Promise<void> => {
	window.open(
		`${B24HookConfig.b24Url}/crm/company/details/${id}/`
	)
	
	return Promise.resolve()
}

const $b24 = new B24Hook(
	B24HookConfig
)
$b24.setLogger($logger)

const b24CurrentLang: Ref<string> = ref(B24LangList.en)

const actionCompanyAdd = async (needAdd: number = 10): Promise<void> => {
	result = reactive(new Result())
	
	let commands = [];
	
	if(needAdd < 1)
	{
		needAdd = 1
	}
	else if(needAdd > 50)
	{
		needAdd = 50
	}
	
	let iterator = 0;
	while(iterator < needAdd)
	{
		iterator++;
		commands.push({
			method: 'crm.item.add',
			params: {
				entityTypeId: EnumCrmEntityTypeId.company,
				fields: {
					title: Text.getUuidRfc4122(),
					comments: '[B]Auto generate[/B] from [URL=https://bitrix24.github.io/b24jssdk/]@bitrix24/b24jssdk-playground[/URL]'
				}
			}
		})
	}
	
	let data: any
	isProcessLoadB24.value = true
	
	return $b24.callBatch(
		commands,
		true
	)
	.then((response: Result) => {
		data = response.getData()
		$logger.info('response >> ', data)
		
		return actionCompanyList()
	})
	.catch((error: Error|string) => {
		result.addError(error)
		$logger.error(error)
	})
	.finally(() => {
		isProcessLoadB24.value = false
		$logger.info('load >> stop ')
	})
}

const actionCompanyList = async (): Promise<void> => {
	
	result = reactive(new Result())
	
	let commands = {
		CompanyList: {
			method: 'crm.item.list',
			params: {
				entityTypeId: EnumCrmEntityTypeId.company,
				order: { id: 'desc' },
				select: [
					'id',
					'title',
					'createdTime'
				]
			}
		}
	}
	
	let data: any
	
	isProcessLoadB24.value = true
	
	return $b24.callBatch(
		commands,
		true
	)
	.then((response: Result) => {
		data = response.getData()
		$logger.info('response >> ', data)
		
		dataList.value = (data.CompanyList.items || []).map((item: any) => {
			return {
				id: Number(item.id),
				title: item.title,
				createdTime: Text.toDateTime(item.createdTime as ISODate)
			}
		});
	})
	.catch((error: Error|string) => {
		result.addError(error)
		$logger.error(error)
	})
	.finally(() => {
		isProcessLoadB24.value = false
		$logger.info('load >> stop ')
	})
}

actionCompanyList()
</script>

<template>
	<ClientOnly>
		<Info>You need to set environment variables in the <code>.env.local</code> file</Info>
		<div class="mt-6 flex flex-col lg:flex-row gap-2">
			<button
				type="button"
				class="flex flex-row flex-nowrap gap-1.5 justify-center items-center uppercase rounded border border-blue-400 bg-blue-200 pl-1 pr-3 py-2 text-sm font-medium text-blue-900 hover:bg-blue-400 disabled:text-blue-700 disabled:bg-blue-400/[0.40] disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
				:disabled="isProcessLoadB24"
				@click="actionCompanyAdd(50)"
			>
				<CompanyIcon class="size-6" />
				<div class="text-nowrap truncate">Add some companies</div>
			</button>
			<button
				type="button"
				class="flex flex-row flex-nowrap gap-1.5 justify-center items-center uppercase rounded border border-base-500 pl-1 pr-3 py-2 text-sm font-medium text-base-700 hover:text-base-900 hover:bg-base-200 disabled:text-base-700 disabled:bg-base-400/[0.40] disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2"
				@click="actionCompanyList"
				:disabled="isProcessLoadB24"
			>
				<FileDownloadIcon class="size-6" />
				<div class="text-nowrap truncate">Load 50 latest companies</div>
			</button>
		</div>
		<div
			v-show="result.isSuccess"
			class="mt-5 flex flex-col gap-1.5"
		>
			<div class="flex flex-col flex-nowrap justify-between items-center my-4  text-gray" v-if="!isProcessLoadB24 && dataList.length < 1">
				<Search1Icon class="h-10 w-10" />
				<div>No data available</div>
			</div>
			<div class="flex flex-col flex-nowrap justify-between items-center my-4  text-gray" v-if="isProcessLoadB24">
				<AlertIcon class="h-10 w-10" />
				<div>Processing ...</div>
			</div>
			<div class="flex flex-row" v-else>
				<table class="w-full">
					<thead>
						<tr>
							<td class="w-[40px] px-3 py-2 border border-gray-400 font-bold text-gray-50 bg-gray-800">Id</td>
							<td class="px-3 py-2 border border-gray-400 font-bold text-gray-50 bg-gray-800">Title</td>
							<td class="px-3 py-2 border border-gray-400 font-bold text-gray-50 bg-gray-800">Created</td>
						</tr>
					</thead>
					<tbody>
						<tr
							v-for="(company, indexCompany) in dataList" :key="indexCompany"
						>
							<td class="w-[40px] px-3 py-2 border border-gray-400">{{ company.id }}</td>
							<td class="px-3 py-2 border border-gray-400">
								<div
									class="cursor-pointer hover:text-info"
									@click="openSlider(company.id)"
								>
									{{ company.title }}
								</div>
							</td>
							<td class="px-3 py-2 border border-gray-400">
								{{ company.createdTime.setLocale(b24CurrentLang).toLocaleString(DateTime.DATETIME_SHORT) }}
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>
		<Alert
			class="mt-lg"
			v-show="!result.isSuccess"
		>
			<h3 class="text-h3 mb-1">Error</h3>
			<ul class="text-txt-md">
				<li v-for="(problem, index) in problemMessageList" :key="index">{{ problem }}</li>
			</ul>
		</Alert>
	</ClientOnly>
</template>