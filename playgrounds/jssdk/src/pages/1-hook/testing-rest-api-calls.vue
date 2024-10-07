<script setup lang="ts">
import { ref, reactive, computed, type Ref, onMounted } from 'vue'
import B24HookConfig from '../../config'
import TrashBinIcon from "@bitrix24/b24icons-vue/main/TrashBinIcon";
import SendIcon from "@bitrix24/b24icons-vue/main/SendIcon";
import ParallelQueueIcon from '@bitrix24/b24icons-vue/main/ParallelQueueIcon'
import SequentialQueueIcon from '@bitrix24/b24icons-vue/main/SequentialQueueIcon'
import SpeedMeterIcon from '@bitrix24/b24icons-vue/main/SpeedMeterIcon'
import SendContactIcon from '@bitrix24/b24icons-vue/crm/SendContactIcon'

import { LoggerBrowser, Result, type IResult } from '@bitrix24/b24jssdk'
import { B24Hook } from '@bitrix24/b24jssdk/hook'
import { EnumCrmEntityTypeId } from "@bitrix24/b24jssdk/types/crm"
import useFormatter from "@bitrix24/b24jssdk/tools/useFormatters"
import Info from "../../components/Info.vue";
import ProgressBar from "../../components/ProgressBar.vue";

// region init ////
const logger = LoggerBrowser.build(
	'Demo: Testing Rest-Api Calls',
	true
)

const { formatterDateTime, formatterNumber } = useFormatter('en-US')

const result: IResult = reactive(new Result());
const B24 = new B24Hook(
	B24HookConfig
)
B24.setLogger(LoggerBrowser.build(
	'Core',
	true
))

const status = ref({
	isProcess: false,
	title: 'Specify what we will test',
	messages: [],
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

let listCrmEntity = ref(0);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let fetchListLoader = ref('');

// region Actions ////
const consoleClear = () => {
	console.clear()
}

const reInitStatus = () => {
	status.value.isProcess = false
	status.value.title = 'Specify what we will test'
	status.value.messages = []
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
		status.value.messages.push('In a loop, we call B24.callMethod one by one.')
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
		status.value.messages.push('We use Promise.all. We send all calls at once.')
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
		
		status.value.isProcess = false
		status.value.time.stop = new Date()
		status.value.time.diff = Math.abs(status.value.time.stop - status.value.time.start)
	})
}

async function makeSelectItemsList_v3()
{
	const itemsSelect = [];
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
			status.value.messages.push(`...`)
			status.value.messages.push(`It was chosen: ${ formatterNumber.format(ttl) } elements`)
		})
	})
	.then(() => {
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
		status.value.progress.animation = true
		status.value.progress.indicator = false
		status.value.progress.value = 0
		status.value.progress.max = 0
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
		status.value.progress.value = 1
		
		for await (let entities of generator)
		{
			for(let entity of entities)
			{
				ttl++;
				logger.log(`>> Retrieve Large Volumes of Data >>> entity ${ ttl } ...`, entity)
			}
		}
		
		status.value.messages.push(`...`)
		status.value.messages.push(`It was chosen: ${ formatterNumber.format(ttl) } elements`)
	})
	.then(() => {
		status.value.progress.value = 2
		status.value.isProcess = false
		status.value.time.stop = new Date()
		status.value.time.diff = Math.abs(status.value.time.stop - status.value.time.start)
	})
}

async function makeSelectItemsList_v5()
{
	try
	{
		let calls = [
			['crm.item.get', {id: 2880}],
			['crm.item.get', {id: 8}],
			['crm.item.get', {id: 6}]
		];
		
		// We send a request packet as an array
		let response = await B24.callBatch(
			calls,
			false
		);
		console.log('Response array:', response);
		alert('res1');
		
	}
	catch(error)
	{
		alert(`Error: ${error.message} -> ${error.linenumber}`);
		console.log(error.stack);
	}
	
}

async function makeSelectItemsList_v6()
{
	try
	{
		// A batch of requests in the form of an object with a maximum number of commands in a request of 50
		let callsV2 = {
			get_lead: ['crm.lead.get', {id: 2}],
			get_company: ['crm.company.get', {id: '$result[get_lead][COMPANY_ID]'}],
			get_contact: ['crm.contact.get', {id: '$result[get_lead][CONTACT_ID]'}]
		};
		
		// We send a request packet as an object
		let response = await B24.callBatch(
			callsV2,
			false
		);
		console.log('Response object:', response);
		alert('res2');
		
	}
	catch(error)
	{
		alert(`Error: ${error.message} -> ${error.linenumber}`);
		console.log(error.stack);
	}
	
}

// endregion ////
</script>

<template>
	<h1 class="text-h1 mb-sm flex whitespace-pre-wrap">Testing Rest-Api Calls</h1>
	<Info>
		You need to set environment variables in the <code>.env.local</code> file.<br>
		Scopes: <code>user_brief</code>, <code>crm</code><br><br>
		To view query results, open the developer console.
	</Info>
	<Info>
		Bitrix24 only considers the IP address from which the REST request is made. In other words, if your server hosts several applications that all work with the same Bitrix24, the request intensity limit will be shared among all applications. Keep this feature in mind when designing.<br>
		<a href="https://apidocs.bitrix24.com/limits.html" target="_blank" class="underline text-warning-link/60 hover:text-warning-link">Learn more</a>
	</Info>
	<Info>
		Check out the Bitrix24 <a href="https://apidocs.bitrix24.com/api-reference/performance/huge-data.html" target="_blank" class="mt-1.5 underline text-warning-link/60 hover:text-warning-link">recommendations</a> for receiving large amounts of data.
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
				class="flex relative flex-row flex-nowrap gap-1.5 justify-center items-center uppercase rounded border border-base-500 pl-1 pr-3 py-2 text-sm font-medium text-base-700 hover:text-base-900 hover:bg-base-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2"
				@click="makeSelectItemsList_v5"
			>
				<SendIcon class="size-6"/>
				<div class="text-nowrap truncate">makeSelectItemsList_v5</div>
			</button>
			<button
				type="button"
				class="flex relative flex-row flex-nowrap gap-1.5 justify-center items-center uppercase rounded border border-base-500 pl-1 pr-3 py-2 text-sm font-medium text-base-700 hover:text-base-900 hover:bg-base-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2"
				@click="makeSelectItemsList_v6"
			>
				<SendIcon class="size-6"/>
				<div class="text-nowrap truncate">makeSelectItemsList_v6</div>
			</button>
		</div>
		<div class="flex-1">
			<div
				class="p-5 border border-base-30 rounded-md shadow-md sm:rounded-md col-auto md:col-span-2 lg:col-span-1">
				<div v-if="result.isSuccess">
					<h3 class="text-h3 mb-1">{{ status.title }}</h3>
					<ul class="text-txt-md">
						<li v-for="(message, index) in status.messages" :key="index">{{ message }}</li>
						<li class="mt-2 pl-2 text-base-600" v-show="null !== status.time.start">start: {{ formatterDateTime.formatDate(status.time.start, 'H:i:s') }}</li>
						<li class="pl-2 text-base-600" v-show="null !== status.time.stop">stop: {{ formatterDateTime.formatDate(status.time.stop, 'H:i:s') }}</li>
						<li class="pl-2 text-base-600" v-show="null !== status.time.diff">diff: {{ formatterNumber.format(status.time.diff) }} ms</li>
					</ul>
					
					<div class="mt-2" v-show="status.isProcess">
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
				<div v-else>
					<h3 class="text-h3 mb-1 text-alert-text">Error</h3>
					<pre>{{ result }}</pre>
				</div>
			</div>
		</div>
	</div>
</template>