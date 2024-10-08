<script setup lang="ts">
import { ref, reactive, computed, type Ref, onMounted } from 'vue'
import B24HookConfig from '../../config'
import SendIcon from "@bitrix24/b24icons-vue/main/SendIcon";
import ParallelQueueIcon from '@bitrix24/b24icons-vue/main/ParallelQueueIcon'
import SequentialQueueIcon from '@bitrix24/b24icons-vue/main/SequentialQueueIcon'
import SpeedMeterIcon from '@bitrix24/b24icons-vue/main/SpeedMeterIcon'
import SendContactIcon from '@bitrix24/b24icons-vue/crm/SendContactIcon'
import CompanyIcon from '@bitrix24/b24icons-vue/crm/CompanyIcon'

import { LoggerBrowser, Result, type IResult } from '@bitrix24/b24jssdk'
import { B24Hook } from '@bitrix24/b24jssdk/hook'
import { EnumCrmEntityTypeId } from "@bitrix24/b24jssdk/types/crm"
import useFormatter from "@bitrix24/b24jssdk/tools/useFormatters"
import Info from "../../components/Info.vue";
import ProgressBar from "../../components/ProgressBar.vue";
import useUniqId from "@bitrix24/b24jssdk/tools/uniqId";
import { type UserBrief} from "@bitrix24/b24jssdk/types/user";

definePageMeta({
	layout: "app"
})

// region Init ////
const logger = LoggerBrowser.build(
	'Demo: Testing Rest-Api Calls',
	true
)

const { formatterDateTime, formatterNumber } = useFormatter('en-US')

const B24 = new B24Hook(
	B24HookConfig
)
B24.setLogger(LoggerBrowser.build('Core', true))

let result: IResult = reactive(new Result())
const status = ref({
	isProcess: false,
	title: 'Specify what we will test',
	messages: [],
	processInfo: null,
	resultInfo: null,
	progress: {
		animation: false,
		indicator: true,
		value: 0,
		max: 0
	},
	time: {
		start: null,
		stop: null,
		diff: null,
	}
});
// endregion ////

// region Actions ////
const consoleClear = () => {
	console.clear()
}

const reInitStatus = () => {
	result = reactive(new Result())
	
	status.value.isProcess = false
	status.value.title = 'Specify what we will test'
	status.value.messages = []
	status.value.processInfo = null
	status.value.resultInfo = null
	status.value.progress.animation = false
	status.value.progress.indicator = true
	status.value.progress.value = 0
	status.value.progress.max = 0
	status.value.time.start = null
	status.value.time.stop = null
	status.value.time.diff = null
}

let listCallToMax = ref(10);
const makeSelectItemsList_v1 = async () =>
{
	return new Promise((resolve) => {
		reInitStatus()
		status.value.isProcess = true
		status.value.title = 'Testing Sequential Calls'
		status.value.messages.push(`In the loop we call B24.callMethod one after another ${listCallToMax.value} times.`)
		status.value.messages.push('With a large number of requests, B24 will start to pause between calls.')
		status.value.progress.value = 0
		status.value.progress.max = listCallToMax.value
		status.value.time.start = new Date()
		
		return resolve(null)
	})
	.then(async () => {
		let iterator = status.value.progress.max
		while(iterator > 0)
		{
			iterator--
			status.value.progress.value++
			logger.log(`>> Testing Sequential Calls >>> ${ status.value.progress.value } | ${ status.value.progress.max }`)
			
			await B24.callMethod(
				'user.current'
			)
		}
	})
	.then(() => {
		listCallToMax.value = listCallToMax.value * 2
	})
	.catch((error: Error|string) => {
		result.addError(error)
		logger.error(error)
	})
	.finally(() => {
		status.value.isProcess = false
		status.value.time.stop = new Date()
		status.value.time.diff = Math.abs(status.value.time.stop - status.value.time.start)
	})
}

let listCallToMaxAll = ref(10);
async function makeSelectItemsList_v2()
{
	return new Promise((resolve) => {
		reInitStatus()
		status.value.isProcess = true
		status.value.title = 'Testing Parallel Calls'
		status.value.messages.push(`We use Promise.all. We send ${listCallToMaxAll.value} calls at once.`)
		status.value.messages.push('With a large number of requests, B24 will start to pause between calls.')
		status.value.progress.value = 0
		status.value.progress.max = listCallToMaxAll.value
		status.value.time.start = new Date()
		
		return resolve(null)
	})
	.then(async () => {
		const list = [];
		let iterator = status.value.progress.max
		
		while(iterator > 0)
		{
			iterator--
			list.push(
				B24.callMethod(
					'user.current',
					{}
				).finally(() => {
					status.value.progress.value++
					logger.log(`>> Testing Parallel Calls >>> ${ status.value.progress.value } | ${ status.value.progress.max }`)
				})
			)
		}
		
		await Promise.all(list)
	})
	.then(() => {
		listCallToMaxAll.value = listCallToMaxAll.value * 2
	})
	.catch((error: Error|string) => {
		result.addError(error)
		logger.error(error)
	})
	.finally(() => {
		status.value.isProcess = false
		status.value.time.stop = new Date()
		status.value.time.diff = Math.abs(status.value.time.stop - status.value.time.start)
	})
}

async function makeSelectItemsList_v3()
{
	return new Promise((resolve) => {
		reInitStatus()
		status.value.isProcess = true
		status.value.title = 'Getting All Elements'
		status.value.messages.push('We call the queries sequentially one after another and get the entire list of elements.')
		status.value.messages.push('This is not an optimal implementation for receiving large amounts of data.')
		status.value.messages.push('With a large number of requests, B24 will start to pause between calls.')
		status.value.progress.value = 0
		status.value.progress.max = 100
		status.value.time.start = new Date()
		
		return resolve(null)
	})
	.then(async () => {
		return B24.callListMethod(
			'crm.item.list',
			{
				entityTypeId: EnumCrmEntityTypeId.company,
			},
			(progress: number) => {
				status.value.progress.value = progress
				logger.log(`>> Getting All Elements >>> ${ status.value.progress.value }`)
			},
			'items'
		)
		.then((response) => {
			const ttl = response.getData().length
			logger.log(`>> Getting All Elements >>> ttl: ${ ttl }`)
			status.value.resultInfo = `It was chosen: ${ formatterNumber.format(ttl) } elements`
		})
	})
	.catch((error: Error|string) => {
		result.addError(error)
		logger.error(error)
	})
	.finally(() => {
		status.value.isProcess = false
		status.value.time.stop = new Date()
		status.value.time.diff = Math.abs(status.value.time.stop - status.value.time.start)
	})
}

async function makeSelectItemsList_v4()
{
	return new Promise((resolve) => {
		reInitStatus()
		status.value.isProcess = true
		status.value.title = 'Retrieve Large Volumes of Data'
		status.value.messages.push('Using Bitrix24 recommendations, we make a specific sequence of calls.')
		status.value.messages.push('With a large number of requests, B24 will start to pause between calls.')
		
		status.value.processInfo = 'processing'
		status.value.progress.animation = true
		status.value.progress.indicator = false
		status.value.progress.value = null
		status.value.time.start = new Date()
		
		return resolve(null)
	})
	.then(async () => {
		let generator = B24.fetchListMethod(
			'crm.item.list',
			{
				entityTypeId: EnumCrmEntityTypeId.company,
				select: [
					'id',
					'title'
				]
			},
			'id',
			'items'
		)
		
		let ttl = 0
		
		for await (let entities of generator)
		{
			for(let entity of entities)
			{
				ttl++;
				logger.log(`>> Retrieve Large Volumes of Data >>> entity ${ ttl } ...`, entity)
				
				status.value.processInfo = `[id:${entity.id}] ${entity.title}`
			}
		}
		status.value.resultInfo = `It was chosen: ${ formatterNumber.format(ttl) } elements`
	})
	.catch((error: Error|string) => {
		result.addError(error)
		logger.error(error)
	})
	.finally(() => {
		status.value.isProcess = false
		status.value.time.stop = new Date()
		status.value.time.diff = Math.abs(status.value.time.stop - status.value.time.start)
		status.value.processInfo = null
	})
}

let needAdd = ref(10);
async function makeSelectItemsList_v5()
{
	if(needAdd.value < 1)
	{
		needAdd.value = 5
	}
	else if(needAdd.value > 50)
	{
		needAdd.value = 5
	}
	
	return new Promise((resolve) => {
		reInitStatus()
		status.value.isProcess = true
		status.value.title = 'Testing the batch processing work'
		status.value.messages.push(`There will be one request. However, it contains ${needAdd.value} commands to create an entities.`)
		status.value.messages.push('With a large number of requests, B24 will start to pause between calls.')
		
		status.value.progress.animation = true
		status.value.progress.indicator = false
		status.value.progress.value = null
		status.value.time.start = new Date()
		
		return resolve(null)
	})
	.then(() => {
		let commands = []
		
		let iterator = 0
		while(iterator < needAdd.value)
		{
			iterator++
			commands.push({
				method: 'crm.item.add',
				params: {
					entityTypeId: EnumCrmEntityTypeId.company,
					fields: {
						title: useUniqId(),
						comments: '[B]Auto generate[/B] from [URL=https://bitrix24.github.io/b24jssdk/]@bitrix24/b24jssdk-playground[/URL]'
					}
				}
			})
		}
		
		logger.info('Testing the batch processing work >> send >>> ', commands)
		return B24.callBatch(
			commands,
			true
		)
	})
	.then((response: Result) => {
		let data: any = response.getData()
		logger.info('Testing the batch processing work >> response >>> ', data)
		
		status.value.resultInfo = `It was add: ${ needAdd.value } elements`
	})
	.then(() => {
		needAdd.value = needAdd.value + 10
		if(needAdd.value > 50)
		{
			needAdd.value = 5
		}
	})
	.catch((error: Error|string) => {
		result.addError(error)
		logger.error(error)
	})
	.finally(() => {
		status.value.isProcess = false
		status.value.time.stop = new Date()
		status.value.time.diff = Math.abs(status.value.time.stop - status.value.time.start)
		status.value.processInfo = null
	})
}

async function makeSelectItemsList_v6()
{
	const promptEntityId = prompt(
		'Please provide your company Id'
	)
	
	const needEntityId = Number(promptEntityId)
	
	return new Promise((resolve) => {
		reInitStatus()
		status.value.isProcess = true
		status.value.title = 'Testing the batch fetch work'
		status.value.messages.push(`The entity and its responsible person data will be selected.`)
		status.value.messages.push('With a large number of requests, B24 will start to pause between calls.')
		
		status.value.progress.animation = true
		status.value.progress.indicator = false
		status.value.progress.value = null
		status.value.time.start = new Date()
		
		return resolve(null)
	})
	.then(() => {
		
		if(Number.isNaN(needEntityId))
		{
			return Promise.reject(new Error('Wrong entity Id'))
		}
		
		let commands = {
			getCompany: {
				method: 'crm.item.get',
				params: {
					entityTypeId: EnumCrmEntityTypeId.company,
					id: needEntityId
				}
			},
			getAssigned: {
				method: 'user.get',
				params: {
					ID: '$result[getCompany][item][assignedById]'
				}
			}
		}
		
		logger.info('Testing the batch fetch work >> send >>> ', commands)
		return B24.callBatch(
			commands,
			true
		)
	})
	.then((response: Result) => {
		let data: any = response.getData()
		logger.info('Testing the batch fetch work >> response >>> ', data)
		
		const assigned = data.getAssigned[0] as UserBrief | null
		
		let assignedInfo = ''
		if(!!assigned)
		{
			assignedInfo = [
				`id: ${assigned.ID}`,
				assigned.ACTIVE ? 'active' : 'not active',
				assigned.LAST_NAME,
				assigned.NAME,
			].join(' ')
		}
		
		status.value.resultInfo = `entityId: ${data.getCompany.item?.id || '?'}; assigned: ${assignedInfo}`
	})
	.catch((error: Error|string) => {
		result.addError(error)
		logger.error(error)
	})
	.finally(() => {
		status.value.isProcess = false
		status.value.time.stop = new Date()
		status.value.time.diff = Math.abs(status.value.time.stop - status.value.time.start)
		status.value.processInfo = null
	})
	
}
// endregion ////

// region Error ////
const problemMessageList = (result: IResult) => {
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
}
// endregion ////
</script>

<template>
	<ClientOnly>
		<h1 class="text-h1 mb-sm flex whitespace-pre-wrap">Testing Rest-Api Calls</h1>
		<Info>
			You need to set environment variables in the <code>.env.local</code> file.<br>
			Scopes: <code>user_brief</code>, <code>crm</code><br><br>
			To view query results, open the developer console.
		</Info>
		<div class="mt-10 flex flex-col sm:flex-row gap-10">
			<div class="basis-1/4 flex flex-col gap-y-6">
				<button
					type="button"
					class="flex relative flex-row flex-nowrap gap-1.5 justify-center items-center uppercase rounded border border-base-500 pl-1 pr-3 py-2 text-sm font-medium text-base-700 hover:text-base-900 hover:bg-base-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-base-200 disabled:text-base-900 disabled:opacity-75"
					@click="makeSelectItemsList_v1"
					:disabled="status.isProcess"
				>
					<SequentialQueueIcon class="size-6"/>
					<div class="text-nowrap truncate">one by one</div>
					<div v-show="listCallToMax > 0"
					     class="text-3xs w-auto rounded z-10 absolute -right-1 -top-2.5 px-2.5 py-0.5 border border-info-text bg-info-background text-info-background-on">
						{{ listCallToMax }}
					</div>
				</button>
				<button
					type="button"
					class="flex relative flex-row flex-nowrap gap-1.5 justify-center items-center uppercase rounded border border-base-500 pl-1 pr-3 py-2 text-sm font-medium text-base-700 hover:text-base-900 hover:bg-base-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-base-200 disabled:text-base-900 disabled:opacity-75"
					@click="makeSelectItemsList_v2"
					:disabled="status.isProcess"
				>
					<ParallelQueueIcon class="size-6"/>
					<div class="text-nowrap truncate">parallel</div>
					<div v-show="listCallToMaxAll > 0"
					     class="text-3xs w-auto rounded z-10 absolute -right-1 -top-2.5 px-2.5 py-0.5 border border-info-text bg-info-background text-info-background-on">
						{{ listCallToMaxAll }}
					</div>
				</button>
				<button
					type="button"
					class="flex relative flex-row flex-nowrap gap-1.5 justify-center items-center uppercase rounded border border-base-500 pl-1 pr-3 py-2 text-sm font-medium text-base-700 hover:text-base-900 hover:bg-base-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-base-200 disabled:text-base-900 disabled:opacity-75"
					@click="makeSelectItemsList_v3"
					:disabled="status.isProcess"
				>
					<SendContactIcon class="size-6"/>
					<div class="text-nowrap truncate">get all elements</div>
				</button>
				<button
					type="button"
					class="flex relative flex-row flex-nowrap gap-1.5 justify-center items-center uppercase rounded border border-base-500 pl-1 pr-3 py-2 text-sm font-medium text-base-700 hover:text-base-900 hover:bg-base-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-base-200 disabled:text-base-900 disabled:opacity-75"
					@click="makeSelectItemsList_v4"
					:disabled="status.isProcess"
				>
					<SpeedMeterIcon class="size-6"/>
					<div class="text-nowrap truncate">get large volumes</div>
				</button>
				<button
					type="button"
					class="flex relative flex-row flex-nowrap gap-1.5 justify-center items-center uppercase rounded border border-base-500 pl-1 pr-3 py-2 text-sm font-medium text-base-700 hover:text-base-900 hover:bg-base-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-base-200 disabled:text-base-900 disabled:opacity-75"
					@click="makeSelectItemsList_v5"
					:disabled="status.isProcess"
				>
					<CompanyIcon class="size-6"/>
					<div class="text-nowrap truncate">batch creation</div>
					<div v-show="needAdd > 0"
					     class="text-3xs w-auto rounded z-10 absolute -right-1 -top-2.5 px-2.5 py-0.5 border border-info-text bg-info-background text-info-background-on">
						{{ needAdd }}
					</div>
				</button>
				<button
					type="button"
					class="flex relative flex-row flex-nowrap gap-1.5 justify-center items-center uppercase rounded border border-base-500 pl-1 pr-3 py-2 text-sm font-medium text-base-700 hover:text-base-900 hover:bg-base-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-base-200 disabled:text-base-900 disabled:opacity-75"
					@click="makeSelectItemsList_v6"
					:disabled="status.isProcess"
				>
					<SendIcon class="size-6"/>
					<div class="text-nowrap truncate">batch fetch</div>
				</button>
			</div>
			<div class="flex-1">
				<div class="px-lg2 py-sm2 border border-base-30 rounded-md shadow-sm hover:shadow-md sm:rounded-md col-auto md:col-span-2 lg:col-span-1 bg-white">
					<h3 class="text-h5 font-semibold">{{ status.title }}</h3>
					<ul class="text-xs mt-sm2" v-show="status.messages.length > 0">
						<li v-for="(message, index) in status.messages" :key="index">{{ message }}</li>
						<li class="mt-2 pl-2 text-base-600" v-show="null !== status.time.start">start: {{ formatterDateTime.formatDate(status.time.start, 'H:i:s') }}</li>
						<li class="pl-2 text-base-600" v-show="null !== status.time.stop">stop: {{ formatterDateTime.formatDate(status.time.stop, 'H:i:s') }}</li>
						<li class="pl-2 text-base-600" v-show="null !== status.time.diff">diff: {{ formatterNumber.format(status.time.diff) }} ms</li>
						<li class="mt-2 pl-2 text-base-800 font-bold" v-show="null !== status.resultInfo">{{ status.resultInfo }}</li>
					</ul>
					
					<div class="mt-2" v-show="status.isProcess">
						<div class="mt-2 pl-0.5 text-4xs text-blue-500" v-show="status.processInfo">{{ status.processInfo }}</div>
						<ProgressBar
							:animation="status.progress.animation"
							:indicator="status.progress.indicator"
							:value="status.progress.value"
							:max="status.progress.max"
						>
							<template
								v-if="status.progress.indicator"
								#indicator="{ percent }">
								<div class="text-right min-w-[60px] text-xs w-full">
									<span class="text-blue-500">{{ status.progress.value }} / {{ status.progress.max }}</span>
								</div>
							</template>
						</ProgressBar>
					</div>
				</div>
				<div
					class="mt-6 text-alert-text px-lg2 py-sm2 border border-base-30 rounded-md shadow-sm hover:shadow-md sm:rounded-md col-auto md:col-span-2 lg:col-span-1 bg-white"
					v-if="!result.isSuccess"
				>
					<h3 class="text-h5 font-semibold">Error</h3>
					<ul class="text-txt-md mt-sm2">
						<li v-for="(problem, index) in problemMessageList(result)" :key="index">{{ problem }}</li>
					</ul>
				</div>
			</div>
		</div>
	</ClientOnly>
</template>