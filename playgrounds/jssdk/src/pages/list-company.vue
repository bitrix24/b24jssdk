<script setup lang="ts">
import { ref, reactive, computed, type Ref } from 'vue'
import Search1Icon from '@bitrix24/b24icons-vue/main/Search1Icon'
import AlertIcon from '@bitrix24/b24icons-vue/button/AlertIcon'
import b24HookConfig from '../config';

import {
	B24Hook,
	LoggerBrowser,
	type IResult,
	Result,
	EnumCrmEntityTypeId
} from '@bitrix24/b24jssdk';

const B24: B24Hook = new B24Hook(
	b24HookConfig
);

const logger = LoggerBrowser.build('Demo: List Company');
const result: IResult = reactive(new Result());
const isProcessLoadB24: Ref<boolean> = ref(true);

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
});

async function openSlider (id: number): Promise<void> {
	window.open(
		`${b24HookConfig.b24Url}/crm/company/details/${id}/`
	);
	
	return Promise.resolve();
}

const dataList: Ref<{
	id: number,
	title: string
}[]> = ref([]);

logger.info('>> start ');

// region Load Data ////
let commands = {
	CompanyList: {
		method: 'crm.item.list',
		params: {
			entityTypeId: EnumCrmEntityTypeId.company,
			order: {id: 'desc'},
			select: [
				'id', 'title'
			]
		}
	}
};

logger.info('send >> ', commands);
let data: any;

isProcessLoadB24.value = true;

B24.callBatch(
	commands,
	true
)
.then((response: Result) => {
	data = response.getData();
	logger.info('response >> ', data);
	
	dataList.value = data.CompanyList.items || [];
	isProcessLoadB24.value = false;
	
	logger.info('init >> stop ');
})
.catch((error: Error|string) => {
	result.addError(error);
	logger.error(error);
});
// endregion ////

logger.info('>> stop ');

</script>

<template>
	<h1 class="text-h1 mb-sm flex whitespace-pre-wrap">List Company</h1>
	<div
		v-show="result.isSuccess"
		class="flex flex-col gap-1.5"
	>
		<div class="flex flex-row">
			<table
				class="w-full"
			>
				<thead>
				<tr>
					<td class="w-4 px-3 py-2 border border-gray-400 font-bold text-gray-50 bg-gray-800">Id</td>
					<td class="px-3 py-2 border border-gray-400 font-bold text-gray-50 bg-gray-800">Title</td>
				</tr>
				</thead>
				<tbody v-if="!isProcessLoadB24 && dataList.length < 1">
				<tr>
					<td colspan="2" class="min-h-[240px]">
						<div class="flex flex-col flex-nowrap justify-between items-center my-4  text-gray">
							<Search1Icon class="h-10 w-10" />
							<div>No data available</div>
						</div>
					</td>
				</tr>
				</tbody>
				<tbody v-if="isProcessLoadB24">
				<tr>
					<td colspan="2" class="min-h-[240px]">
						<div class="flex flex-col flex-nowrap justify-between items-center my-4  text-gray">
							<AlertIcon class="h-10 w-10" />
							<div>Loading data</div>
						</div>
					</td>
				</tr>
				</tbody>
				<tbody v-else>
				<tr
					v-for="(company, indexCompany) in dataList" :key="indexCompany"
				>
					<td class="px-3 py-2 border border-gray-400">{{ company.id }}</td>
					<td class="px-3 py-2 border border-gray-400">
						<div
							class="cursor-pointer hover:text-info"
							@click="openSlider(company.id)"
						>
							{{ company.title }}
						</div>
					</td>
				</tr>
				</tbody>
			</table>
		</div>
	</div>
	<div class="bg-warning-background p-5" v-show="!result.isSuccess">
		<h3 class="text-h3 text-warning-background-on mb-1">Error</h3>
		<ul class="text-txt-md text-warning-background-on">
			<li v-for="(problem, index) in problemMessageList" :key="index">{{problem}}</li>
		</ul>
	</div>
</template>