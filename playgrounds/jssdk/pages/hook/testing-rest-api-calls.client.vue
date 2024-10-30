<script setup lang="ts">
import B24HookConfig from '../../config.hook'
import { ref, reactive, type Ref, computed } from 'vue'
import { DateTime, Interval } from 'luxon'
import {
	LoggerBrowser,
	Result,
	B24Hook,
	useB24Helper,
	LoadDataType,
	EnumCrmEntityTypeId,
	Text,
	useFormatter, B24LangList
} from '@bitrix24/b24jssdk'
import type { IResult, UserBrief } from '@bitrix24/b24jssdk'

import SendIcon from "@bitrix24/b24icons-vue/main/SendIcon";
import ParallelQueueIcon from '@bitrix24/b24icons-vue/main/ParallelQueueIcon'
import SequentialQueueIcon from '@bitrix24/b24icons-vue/main/SequentialQueueIcon'
import SpeedMeterIcon from '@bitrix24/b24icons-vue/main/SpeedMeterIcon'
import SendContactIcon from '@bitrix24/b24icons-vue/crm/SendContactIcon'
import CompanyIcon from '@bitrix24/b24icons-vue/crm/CompanyIcon'
import TrashBinIcon from '@bitrix24/b24icons-vue/main/TrashBinIcon'
import SpinnerIcon from '@bitrix24/b24icons-vue/specialized/SpinnerIcon'
import Info from '../../components/Info.vue';
import ProgressBar from '../../components/ProgressBar.vue'
import Avatar from '~/components/Avatar.vue'

definePageMeta({
	layout: "page"
})

// region Init ////
const $logger = LoggerBrowser.build(
	'Demo: Testing Rest-Api Calls',
	true
)
const { initB24Helper, getB24Helper } = useB24Helper()
const { formatterNumber } = useFormatter()

const $b24 = new B24Hook(B24HookConfig)
$b24.setLogger(LoggerBrowser.build('Core', true))

const $isInitB24Helper = ref(false)
initB24Helper(
	$b24,
	[
		LoadDataType.Profile
	]
)
.then(() =>
{
	$isInitB24Helper.value = true
})
const b24CurrentLang: Ref<string> = ref(B24LangList.en)

let result: IResult = reactive(new Result())

interface IStatus
{
	isProcess: boolean,
	title: string,
	messages: string[],
	processInfo: null|string,
	resultInfo: null|string,
	progress: {
		animation: boolean,
		indicator: boolean,
		value: null|number,
		max: null|number
	},
	time: {
		start: null|DateTime,
		stop: null|DateTime,
		interval: null|Interval
	}
}

const status: Ref<IStatus> = ref({
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
		interval: null,
	}
} as IStatus)

const b24Helper = computed(() =>
{
	if($isInitB24Helper.value)
	{
		return getB24Helper()
	}
	
	return null
})
// endregion ////

// region Actions ////
const stopMakeProcess = () =>
{
	status.value.isProcess = false
	status.value.time.stop = DateTime.now()
	if(
		status.value.time.stop
		&& status.value.time.start
	)
	{
		status.value.time.interval = Interval.fromDateTimes(
			status.value.time.start,
			status.value.time.stop,
		)
	}
	status.value.processInfo = null
}

const clearConsole = () =>
{
	console.clear()
}

const reInitStatus = () =>
{
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
	status.value.time.interval = null
}

let listCallToMax: Ref<number> = ref(10)
const makeSelectItemsList_v1 = async () =>
{
	return new Promise((resolve) =>
	{
		reInitStatus()
		status.value.isProcess = true
		status.value.title = 'Testing Sequential Calls'
		status.value.messages.push(`In the loop we call $b24.callMethod one after another ${ listCallToMax.value } times.`)
		status.value.messages.push('With a large number of requests, B24 will start to pause between calls.')
		status.value.progress.value = 0
		status.value.progress.max = listCallToMax.value
		status.value.time.start = DateTime.now()
		
		return resolve(null)
	})
	.then(async () =>
	{
		let iterator = status.value.progress.max || 0
		while( iterator > 0 )
		{
			iterator--
			if(null !== status.value.progress.value)
			{
				status.value.progress.value++
			}
			$logger.log(`>> Testing Sequential Calls >>> ${ status.value.progress.value } | ${ status.value.progress.max }`)
			
			await $b24.callMethod(
				'user.current'
			)
		}
	})
	.then(() =>
	{
		listCallToMax.value = listCallToMax.value * 2
	})
	.catch((error: Error|string) =>
	{
		result.addError(error)
		$logger.error(error)
	})
	.finally(() =>
	{
		stopMakeProcess()
	})
}

let listCallToMaxAll: Ref<number> = ref(10)
async function makeSelectItemsList_v2()
{
	return new Promise((resolve) =>
	{
		reInitStatus()
		status.value.isProcess = true
		status.value.title = 'Testing Parallel Calls'
		status.value.messages.push(`We use Promise.all. We send ${ listCallToMaxAll.value } calls at once.`)
		status.value.messages.push('With a large number of requests, B24 will start to pause between calls.')
		status.value.progress.value = 0
		status.value.progress.max = listCallToMaxAll.value
		status.value.time.start = DateTime.now()
		
		return resolve(null)
	})
		.then(async () =>
		{
			const list = [];
			let iterator = status.value.progress.max || 0
			
			while( iterator > 0 )
			{
				iterator--
				list.push(
					$b24.callMethod(
						'user.current',
						{}
					).finally(() =>
					{
						(status.value.progress.value as number)++
						$logger.log(`>> Testing Parallel Calls >>> ${ status.value.progress.value } | ${ status.value.progress.max }`)
					})
				)
			}
			
			await Promise.all(list)
		})
		.then(() =>
		{
			listCallToMaxAll.value = listCallToMaxAll.value * 2
		})
		.catch((error: Error|string) =>
		{
			result.addError(error)
			$logger.error(error)
		})
		.finally(() =>
		{
			stopMakeProcess()
		})
}

async function makeSelectItemsList_v3()
{
	return new Promise((resolve) =>
	{
		reInitStatus()
		status.value.isProcess = true
		status.value.title = 'Getting All Elements'
		status.value.messages.push('We call the queries sequentially one after another and get the entire list of elements.')
		status.value.messages.push('This is not an optimal implementation for receiving large amounts of data.')
		status.value.messages.push('With a large number of requests, B24 will start to pause between calls.')
		status.value.progress.value = 0
		status.value.progress.max = 100
		status.value.time.start = DateTime.now()
		
		return resolve(null)
	})
		.then(async () =>
		{
			return $b24.callListMethod(
				'crm.item.list',
				{
					entityTypeId: EnumCrmEntityTypeId.company,
				},
				(progress: number) =>
				{
					status.value.progress.value = progress
					$logger.log(`>> Getting All Elements >>> ${ status.value.progress.value }`)
				},
				'items'
			)
				.then((response) =>
				{
					const ttl = response.getData().length
					$logger.log(`>> Getting All Elements >>> ttl: ${ ttl }`)
					status.value.resultInfo = `It was chosen: ${ formatterNumber?.format(ttl) } elements`
				})
		})
		.catch((error: Error|string) =>
		{
			result.addError(error)
			$logger.error(error)
		})
		.finally(() =>
		{
			stopMakeProcess()
		})
}

async function makeSelectItemsList_v4()
{
	return new Promise((resolve) =>
	{
		reInitStatus()
		status.value.isProcess = true
		status.value.title = 'Retrieve Large Volumes of Data'
		status.value.messages.push('Using Bitrix24 recommendations, we make a specific sequence of calls.')
		status.value.messages.push('With a large number of requests, B24 will start to pause between calls.')
		
		status.value.processInfo = 'processing'
		status.value.progress.animation = true
		status.value.progress.indicator = false
		status.value.progress.value = null
		status.value.time.start = DateTime.now()
		
		return resolve(null)
	})
		.then(async () =>
		{
			let generator = $b24.fetchListMethod(
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
					$logger.log(`>> Retrieve Large Volumes of Data >>> entity ${ ttl } ...`, entity)
					
					status.value.processInfo = `[id:${ entity.id }] ${ entity.title }`
				}
			}
			status.value.resultInfo = `It was chosen: ${ formatterNumber.format(ttl) } elements`
		})
		.catch((error: Error|string) =>
		{
			result.addError(error)
			$logger.error(error)
		})
		.finally(() =>
		{
			stopMakeProcess()
		})
}

let needAdd = ref(10)
async function makeCallBatch_v1()
{
	if(needAdd.value < 1)
	{
		needAdd.value = 5
	}
	else if(needAdd.value > 50)
	{
		needAdd.value = 5
	}
	
	return new Promise((resolve) =>
	{
		reInitStatus()
		status.value.isProcess = true
		status.value.title = 'Testing the batch processing work'
		status.value.messages.push(`There will be one request. However, it contains ${ needAdd.value } commands to create an entities.`)
		status.value.messages.push('With a large number of requests, B24 will start to pause between calls.')
		
		status.value.progress.animation = true
		status.value.progress.indicator = false
		status.value.progress.value = null
		status.value.time.start = DateTime.now()
		
		return resolve(null)
	})
	.then(() =>
	{
		let commands = []
		
		let iterator = 0
		while( iterator < needAdd.value )
		{
			iterator++
			commands.push({
				method: 'crm.item.add',
				params: {
					entityTypeId: EnumCrmEntityTypeId.company,
					fields: {
						title: Text.getUniqId(),
						comments: '[B]Auto generate[/B] from [URL=https://bitrix24.github.io/b24jssdk/]@bitrix24/b24jssdk-playground[/URL]'
					}
				}
			})
		}
		
		$logger.info('Testing the batch processing work >> send >>> ', commands)
		return $b24.callBatch(
			commands,
			true
		)
	})
	.then((response: Result) =>
	{
		let data: any = response.getData()
		$logger.info('Testing the batch processing work >> response >>> ', data)
		
		status.value.resultInfo = `It was add: ${ needAdd.value } elements`
	})
	.then(() =>
	{
		needAdd.value = needAdd.value + 10
		if(needAdd.value > 50)
		{
			needAdd.value = 5
		}
	})
	.catch((error: Error|string) =>
	{
		result.addError(error)
		$logger.error(error)
	})
	.finally(() =>
	{
		stopMakeProcess()
	})
}

async function makeSelectItemsList_v6()
{
	const promptEntityId = prompt(
		'Please provide your company Id'
	)
	
	const needEntityId = Number(promptEntityId)
	
	return new Promise((resolve) =>
	{
		reInitStatus()
		status.value.isProcess = true
		status.value.title = 'Testing the batch fetch work'
		status.value.messages.push(`The entity and its responsible person data will be selected.`)
		status.value.messages.push('With a large number of requests, B24 will start to pause between calls.')
		
		status.value.progress.animation = true
		status.value.progress.indicator = false
		status.value.progress.value = null
		status.value.time.start = DateTime.now()
		
		return resolve(null)
	})
	.then(() =>
	{
		
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
		
		$logger.info('Testing the batch fetch work >> send >>> ', commands)
		return $b24.callBatch(
			commands,
			true
		)
	})
	.then((response: Result) =>
	{
		let data: any = response.getData()
		$logger.info('Testing the batch fetch work >> response >>> ', data)
		
		const assigned = data.getAssigned[0] as UserBrief|null
		
		let assignedInfo = ''
		if(!!assigned)
		{
			assignedInfo = [
				`id: ${ assigned.ID }`,
				assigned.ACTIVE ? 'active' : 'not active',
				assigned.LAST_NAME,
				assigned.NAME,
			].join(' ')
		}
		
		status.value.resultInfo = `entityId: ${ data.getCompany.item?.id || '?' }; assigned: ${ assignedInfo }`
	})
	.catch((error: Error|string) =>
	{
		result.addError(error)
		$logger.error(error)
	})
	.finally(() =>
	{
		stopMakeProcess()
	})
}

const makeOpenSliderForUser = async (userId: number) =>
{
	
	window.open(
		`${ B24HookConfig.b24Url }/company/personal/user/${ userId }/`
	)
	
	return Promise.resolve()
}
// endregion ////

// region Error ////
const problemMessageList = (result: IResult) =>
{
	let problemMessageList: string[] = [];
	const problem = result.getErrorMessages();
	if(typeof (problem || '') === 'string')
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
		<div class="flex flex-col sm:flex-row items-center justify-between gap-x-10 gap-y-2">
			<div class="basis-1/4 mt-2">
				<div
					v-if="$isInitB24Helper"
					class="px-lg2 py-sm2 border border-base-100 rounded-lg hover:shadow-md hover:-translate-y-px col-auto md:col-span-2 lg:col-span-1 bg-white cursor-pointer"
					@click.stop="makeOpenSliderForUser(b24Helper?.profileInfo.data.id || 0)"
				>
					<div class="flex items-center gap-4">
						<Avatar
							:src="b24Helper?.profileInfo.data.photo || ''"
							:alt="b24Helper?.profileInfo.data.lastName || 'user' "
						/>
						<div class="font-medium dark:text-white">
							<div class="text-nowrap text-xs text-base-500 dark:text-base-400">
								{{b24Helper?.hostName.replace('https://', '')}}
							</div>
							<div class="text-nowrap hover:underline hover:text-info-link">
								{{
									[
										b24Helper?.profileInfo.data.lastName,
										b24Helper?.profileInfo.data.name,
									].join(' ')
								}}
							</div>
							<div class="text-xs text-base-800 dark:text-base-400 flex flex-row gap-x-2">
								<span>{{b24Helper?.profileInfo.data.isAdmin ? 'Administrator' : ''}}</span>
							</div>
						</div>
					</div>
				</div>
				<div v-else class="flex items-center justify-between py-sm2 text-info">
					<SpinnerIcon class="m-auto animate-spin stroke-2 size-10"/>
				</div>
			</div>
			<div class="flex-1 w-full">
				<Info>
					You need to set environment variables in the <code>.env.local</code> file.<br>
					Scopes: <code>user_brief</code>, <code>crm</code><br><br>
					To view query results, open the developer console.
				</Info>
			</div>
		</div>
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
						{{listCallToMax}}
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
						{{listCallToMaxAll}}
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
					@click="makeCallBatch_v1"
					:disabled="status.isProcess"
				>
					<CompanyIcon class="size-6"/>
					<div class="text-nowrap truncate">batch creation</div>
					<div v-show="needAdd > 0"
					     class="text-3xs w-auto rounded z-10 absolute -right-1 -top-2.5 px-2.5 py-0.5 border border-info-text bg-info-background text-info-background-on">
						{{needAdd}}
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
				<div class="p-lg2 border border-base-100 rounded-md col-auto md:col-span-2 lg:col-span-1 bg-white">
					<div>
						<div class="w-full flex items-center justify-between">
							<h1 class="text-h1 font-semibold leading-7 text-base-900">{{status.title}}</h1>
							<button
								type="button"
								class="flex relative flex-row flex-nowrap gap-1.5 justify-center items-center uppercase rounded pl-1 pr-3 py-1.5 leading-none text-3xs font-medium text-base-700 hover:text-base-900 hover:bg-base-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-base-200 disabled:text-base-900 disabled:opacity-75"
								@click="clearConsole"
							>
								<TrashBinIcon class="size-4"/>
								<div class="text-nowrap truncate">Clear console</div>
							</button>
						</div>
						<div class="mt-2" v-show="status.messages.length > 0">
							<p class="max-w-2xl text-sm text-base-500" v-for="(message, index) in status.messages" :key="index">{{message}}</p>
						</div>
					</div>
					<div class="text-md text-base-900">
						<dl class="divide-y divide-base-100">
							<div class="mt-4 px-2 py-1 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0" v-show="null !== status.time.start">
								<dt class="text-sm font-medium leading-6">
									start:
								</dt>
								<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">
									{{ (status.time?.start || DateTime.now()).setLocale(b24CurrentLang).toLocaleString(DateTime.TIME_24_WITH_SECONDS) }}
								</dd>
							</div>
							<div class="px-2 py-1 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0" v-show="null !== status.time.stop">
								<dt class="text-sm font-medium leading-6">
									stop:
								</dt>
								<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">
									{{ (status.time?.stop || DateTime.now()).setLocale(b24CurrentLang).toLocaleString(DateTime.TIME_24_WITH_SECONDS) }}
								</dd>
							</div>
							<div class="px-2 py-1 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0" v-show="null !== status.time.interval">
								<dt class="text-sm font-medium leading-6">
									interval:
								</dt>
								<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">
									{{formatterNumber.format(status.time?.interval?.length() || 0)}} sec
								</dd>
							</div>
							<div class="px-2 py-1 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0" v-show="null !== status.resultInfo">
								<dt class="text-sm font-medium leading-6">
									&nbsp;
								</dt>
								<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">
									{{status.resultInfo}}
								</dd>
							</div>
						</dl>
					</div>
					<div class="mt-4" v-show="status.isProcess">
						<div class="mb-2 text-4xs text-blue-500" v-show="status.processInfo">{{ status.processInfo }}</div>
						<ProgressBar
							:animation="status.progress.animation"
							:indicator="status.progress.indicator"
							:value="status.progress?.value || undefined"
							:max="status.progress?.max || 0"
						>
							<template
								v-if="status.progress.indicator"
								#indicator
							>
								<div class="text-right min-w-[60px] text-xs w-full">
									<span class="text-blue-500">{{status.progress.value}} / {{status.progress.max
										}}</span>
								</div>
							</template>
						</ProgressBar>
					</div>
				</div>
				<div
					class="mt-6 text-alert-text px-lg2 py-sm2 border border-base-30 rounded-md shadow-sm hover:shadow-md sm:rounded-md col-auto md:col-span-2 lg:col-span-1 bg-white"
					v-if="!result.isSuccess"
				>
					<div>
						<div class="mb-2 w-full flex items-center justify-between">
							<h1 class="text-h1 font-semibold leading-7 text-base-900">Error</h1>
						</div>
						<p class="max-w-2xl text-txt-md" v-for="(problem, indexProblem) in problemMessageList(result)" :key="indexProblem">{{problem}}</p>
					</div>
				</div>
			</div>
		</div>
	</ClientOnly>
</template>