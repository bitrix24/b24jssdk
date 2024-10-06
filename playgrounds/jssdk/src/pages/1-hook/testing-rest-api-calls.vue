<script setup lang="ts">
import { ref, reactive, computed, type Ref, onMounted } from 'vue'
import B24HookConfig from '../../config'
import TrashBinIcon from "@bitrix24/b24icons-vue/main/TrashBinIcon";
import SendIcon from "@bitrix24/b24icons-vue/main/SendIcon";
import { LoggerBrowser, Result, type IResult } from '@bitrix24/b24jssdk'
import { B24Hook } from '@bitrix24/b24jssdk/hook'
import type {GetPayload, ListPayload} from '@bitrix24/b24jssdk/types/payloads';
import type { UserBrief } from '@bitrix24/b24jssdk/types/user';
import { AjaxResult } from "@bitrix24/b24jssdk/core/http/ajaxResult";
import { EnumCrmEntityTypeId } from "@bitrix24/b24jssdk/types/crm";

import Info from "../../components/Info.vue";
import ProgressBar from "../../components/ProgressBar.vue";

import { Chart, ChartOptions, registerables } from 'chart.js';

// region init ////
const logger = LoggerBrowser.build(
	'Demo: Testing Rest-Api Calls',
	true
)

const result: IResult = reactive(new Result());
const B24 = new B24Hook(
	B24HookConfig
)
B24.setLogger(logger)

const status = ref({
	isProcess: false,
	title: 'Specify what we will test',
	messages: [],
	progress: {
		value: 0,
		max: 0
	}
});
// endregion ////

let listCallToMaxAll = ref(10);
let listCrmEntity = ref(0);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let crmEntityListAllLoader = ref('');
let fetchListLoader = ref('');

// region Actions ////
let listCallToMax = ref(200);
const makeSelectItemsList_v1 = async () =>
{
	
	status.value.isProcess = true
	status.value.title = 'Testing Sequential Calls'
	status.value.messages = []
	status.value.messages.push('In a loop, we call B24.callMethod one by one.')
	status.value.messages.push('With a large number of requests, B24 will start to pause between calls.')
	status.value.progress.value = 0;
	status.value.progress.max = listCallToMax.value;
	
	listCrmEntity.value = listCallToMax.value;
	while(listCrmEntity.value > 0)
	{
		listCrmEntity.value--;
		status.value.progress.value = status.value.progress.max - listCrmEntity.value;
		logger.log(`>> Testing Sequential Calls >>> ${ status.value.progress.value } / ${ status.value.progress.max }`);
		
		await B24.callMethod(
			'user.current'
		);
	}
	
	listCallToMax.value = listCallToMax.value * 2;
	status.value.isProcess = false
}

async function makeSomeActionsAll()
{
	const list = [];
	listCrmEntity.value = listCallToMaxAll.value;
	
	console.clear();
	console.log('>> ', listCrmEntity.value);
	
	while(listCrmEntity.value > 0)
	{
		listCrmEntity.value--;
		list.push(B24.callMethod(
			'user.current',
			{}
		))
	}
	
	await Promise.all(list);
	
	listCallToMaxAll.value = listCallToMaxAll.value * 2;
}

async function crmEntityListAll()
{
	console.clear();
	crmEntityListAllLoader.value = '0%';
	B24.callListMethod(
		'crm.item.list',
		{
			entityTypeId: EnumCrmEntityTypeId.company,
		},
		(progress: number) =>
		{
			crmEntityListAllLoader.value = `${progress}%`;
		}
	)
		.then((response) =>
		{
			crmEntityListAllLoader.value = `ttl: ${response.getData().length}`;
		});
}

async function fetchListAll()
{
	console.clear();
	
	fetchListLoader.value = '0';
	let generator = B24.fetchListMethod(
		'crm.item.list',
		{
			entityTypeId: EnumCrmEntityTypeId.company,
		},
		'id',
		'items'
	);
	
	let ttl = 0;
	for await (let entities of generator)
	{
		for(let entity of entities)
		{
			ttl++;
			fetchListLoader.value = `ttl: ${ttl} ...`;
			console.log('Crm Entity:', entity);
			
			await sleep(10);
		}
	}
	
	fetchListLoader.value = `ttl: ${ttl}`;
}

async function callBatch()
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
		
		// A batch of requests in the form of an object with a maximum number of commands in a request of 50
		let callsV2 = {
			get_lead: ['crm.lead.get', {id: 2}],
			get_company: ['crm.company.get', {id: '$result[get_lead][COMPANY_ID]'}],
			get_contact: ['crm.contact.get', {id: '$result[get_lead][CONTACT_ID]'}]
		};
		
		// We send a request packet as an object
		response = await B24.callBatch(
			callsV2,
			false
		);
		console.log('Response object:', response);
		alert('res2');
		
	}catch(error)
	{
		alert(`Error: ${error.message} -> ${error.linenumber}`);
		console.log(error.stack);
	}
	
}

// endregion ////

// region Chart ////
Chart.register(...registerables);

const chartCanvas = ref < HTMLCanvasElement | null > (null);
const promisesState = ref < string[] > ([]);
let chartInstance: Chart | null = null;

const initializeChart = () =>
{
	if(chartCanvas.value)
	{
		const ctx = chartCanvas.value.getContext('2d');
		if(ctx)
		{
			chartInstance = new Chart(ctx, {
				type: 'bar',
				data: {
					labels: promisesState.value.map((_, index) => `Promise ${index + 1}`),
					datasets: [
						{
							label: 'Promise States',
							data: promisesState.value.map(state =>
							{
								switch(state)
								{
									case 'fulfilled':
										return 1;
									case 'rejected':
										return -1;
									case 'paused':
										return 0.5;
									default:
										return 0;
								}
							}),
							backgroundColor: promisesState.value.map(state =>
							{
								switch(state)
								{
									case 'fulfilled':
										return 'green';
									case 'rejected':
										return 'red';
									case 'paused':
										return 'orange';
									default:
										return 'gray';
								}
							}),
						},
					],
				},
				options: {
					animation: {
						duration: 1000,
						easing: 'easeInOutQuad',
					},
					scales: {
						y: {
							beginAtZero: true,
							ticks: {
								callback: (value) =>
								{
									switch(value)
									{
										case 1:
											return 'Fulfilled';
										case 0.5:
											return 'Paused';
										case 0:
											return 'Pending';
										case -1:
											return 'Rejected';
										default:
											return '';
									}
								},
							},
						},
					},
				} as ChartOptions,
			});
		}
	}
};

const updateChart = () =>
{
	if(chartInstance)
	{
		chartInstance.data.labels = promisesState.value.map((_, index) => `Promise ${index + 1}`);
		chartInstance.data.datasets[0].data = promisesState.value.map(state =>
		{
			switch(state)
			{
				case 'fulfilled':
					return 1;
				case 'rejected':
					return -1;
				case 'paused':
					return 0.5;
				default:
					return 0;
			}
		});
		chartInstance.data.datasets[0].backgroundColor = promisesState.value.map(state =>
		{
			switch(state)
			{
				case 'fulfilled':
					return 'green';
				case 'rejected':
					return 'red';
				case 'paused':
					return 'orange';
				default:
					return 'gray';
			}
		});
		chartInstance.update();
	}
};

const executePromises = async () =>
{
	const promises = Array.from({length: 10}, (_, index) =>
		new Promise((resolve, reject) =>
		{
			const delay = Math.random() * 3000;
			setTimeout(() =>
			{
				if(Math.random() > 0.5)
				{
					promisesState.value[index] = 'paused';
					updateChart();
					setTimeout(() =>
					{
						Math.random() > 0.5 ? resolve(`Result ${index + 1}`) : reject(`Error ${index + 1}`);
					}, 1000);
				}
				else
				{
					Math.random() > 0.5 ? resolve(`Result ${index + 1}`) : reject(`Error ${index + 1}`);
				}
			}, delay);
		})
			.then(() =>
			{
				promisesState.value[index] = 'fulfilled';
				updateChart();
			})
			.catch(() =>
			{
				promisesState.value[index] = 'rejected';
				updateChart();
			})
	);
	
	promisesState.value = Array(promises.length).fill('pending');
	updateChart();
	
	await Promise.all(promises.map((promise, index) =>
		promise.finally(() =>
		{
			updateChart();
		})
	));
};

onMounted(() =>
{
	initializeChart();
	executePromises();
});
// endregion ////

</script>

<template>
	<h1 class="text-h1 mb-sm flex whitespace-pre-wrap">Testing Rest-Api Calls</h1>
	<Info>
		You need to set environment variables in the <code>.env.local</code> file.<br>
		Scopes: <code>user_brief</code>, <code>crm</code>
	</Info>
	<div class="mt-10 flex flex-col sm:flex-row gap-10">
		<div class="basis-1/4 flex flex-col gap-y-6">
			<button
				type="button"
				class="flex relative flex-row flex-nowrap gap-1.5 justify-center items-center uppercase rounded border border-base-500 pl-1 pr-3 py-2 text-sm font-medium text-base-700 hover:text-base-900 hover:bg-base-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2"
				@click="makeSelectItemsList_v1"
				:disabled="status.isProcess"
			>
				<SendIcon class="size-6"/>
				<div class="text-nowrap truncate">one by one</div>
			</button>
			<button
				type="button"
				class="flex relative flex-row flex-nowrap gap-1.5 justify-center items-center uppercase rounded border border-base-500 pl-1 pr-3 py-2 text-sm font-medium text-base-700 hover:text-base-900 hover:bg-base-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2"
				@click="makeSomeActionsAll"
			>
				<SendIcon class="size-6"/>
				<div class="text-nowrap truncate">make Some ActionsAll</div>
				<div
					class="text-3xs w-auto rounded z-10 absolute right-0 -top-2.5 px-2.5 py-0.5 bg-alert-background-on text-alert-on">
					{{ listCallToMaxAll }}
				</div>
			</button>
			<button
				type="button"
				class="flex relative flex-row flex-nowrap gap-1.5 justify-center items-center uppercase rounded border border-base-500 pl-1 pr-3 py-2 text-sm font-medium text-base-700 hover:text-base-900 hover:bg-base-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2"
				@click="crmEntityListAll"
			>
				<SendIcon class="size-6"/>
				<div class="text-nowrap truncate">crmEntityListAll</div>
				<div v-show="crmEntityListAllLoader.length > 0"
				     class="text-3xs w-auto rounded z-10 absolute right-0 -top-2.5 px-2.5 py-0.5 bg-alert-background-on text-alert-on">
					{{ crmEntityListAllLoader }}
				</div>
			</button>
			<button
				type="button"
				class="flex relative flex-row flex-nowrap gap-1.5 justify-center items-center uppercase rounded border border-base-500 pl-1 pr-3 py-2 text-sm font-medium text-base-700 hover:text-base-900 hover:bg-base-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2"
				@click="fetchListAll"
			>
				<SendIcon class="size-6"/>
				<div class="text-nowrap truncate">fetchListAll</div>
				<div v-show="fetchListLoader.length > 0"
				     class="text-3xs w-auto rounded z-10 absolute right-0 -top-2.5 px-2.5 py-0.5 bg-alert-background-on text-alert-on">
					{{ fetchListLoader }}
				</div>
			</button>
			<button
				type="button"
				class="flex relative flex-row flex-nowrap gap-1.5 justify-center items-center uppercase rounded border border-base-500 pl-1 pr-3 py-2 text-sm font-medium text-base-700 hover:text-base-900 hover:bg-base-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2"
				@click="callBatch"
			>
				<SendIcon class="size-6"/>
				<div class="text-nowrap truncate">callBatch</div>
			</button>
		</div>
		<div class="flex-1">
			<div
				class="p-5 border border-base-30 rounded-md shadow-md sm:rounded-md col-auto md:col-span-2 lg:col-span-1">
				<div v-if="result.isSuccess">
					<h3 class="text-h3 mb-1">{{ status.title }}</h3>
					<ul class="text-txt-md">
						<li v-for="(message, index) in status.messages" :key="index">{{ message }}</li>
					</ul>
					
					<div class="mt-2" v-show="status.isProcess">
						<ProgressBar
							indicator
							:value="status.progress.value"
							:max="status.progress.max"
						>
							<template #indicator="{ percent }">
								<div class="text-right min-w-[60px] text-xs" :style="{ width: `${percent}%` }">
									<span class="text-blue-500">{{ status.progress.value }} / {{ status.progress.max }}</span>
								</div>
							</template>
						</ProgressBar>
					</div>
				</div>
				<div v-else>
					<h3 class="text-red-500">error</h3>
					<pre>{{ result }}</pre>
				</div>
				<Info v-show="status.isProcess">To view query results, open the developer console.</Info>
			</div>
			<div class="">
				<canvas ref="chartCanvas"></canvas>
			</div>
			
		</div>
	</div>
</template>