<script setup lang="ts">
import {onMounted, onUnmounted, reactive, type Ref, ref} from 'vue'
import {computedAsync} from '@vueuse/core'
import type { B24FrameQueryParams, IResult } from '@bitrix24/b24jssdk'
import {
	type AjaxError,
	type SelectedUser,
	B24Frame,
	B24HelperManager,
	B24LangList,
	LoadDataType,
	LoggerBrowser,
	Result,
	Text
} from '@bitrix24/b24jssdk'

import SpinnerIcon from '@bitrix24/b24icons-vue/specialized/SpinnerIcon'
import UserGroupIcon from '@bitrix24/b24icons-vue/common-b24/UserGroupIcon'
import Toggle from '../../components/Toggle.vue'
import {useI18n} from '#imports'

definePageMeta({
	layout: "app"
})

// region Init ////
const $logger = LoggerBrowser.build(
	'Demo: Frame',
	true
)

let $b24: B24Frame
let $b24Helper: null|B24HelperManager = null

const isInit: Ref<boolean> = ref(false)
const isProcess: Ref<boolean> = ref(false)
const appDataRevision: Ref<number> = ref(0)
let result: IResult = reactive(new Result())
const { t, locales, setLocale } = useI18n()
const b24CurrentLang: Ref<string> = ref(B24LangList.en)

const optionsData: {
	keyFloat: number,
	keyInteger: number,
	keyBool: boolean,
	keyString: string,
	keyDate: Date,
	// @todo remove this ////
	keyDate2: Date,
	keyArray: number[],
	keyObject: Record<string, string>
} = reactive({
	keyFloat: 10.99,
	keyInteger: 24,
	keyBool: true,
	keyString: 'B24',
	keyDate: new Date(),
	// @todo remove this ////
	keyDate2: new Date(),
	keyArray: [1],
	keyObject: {}
})

onMounted(async () => {
	try
	{
		$b24 = await initializeB24Frame()
		
		$b24.setLogger(LoggerBrowser.build('Core', true))
		b24CurrentLang.value = $b24.getLang()
		
		if(locales.value.filter(i => i.code === b24CurrentLang.value).length > 0)
		{
			setLocale(b24CurrentLang.value)
			$logger.log('setLocale >>>', b24CurrentLang.value)
		}
		else
		{
			$logger.warn('not support locale >>>', b24CurrentLang.value)
		}
		
		await $b24.parent.setTitle('[playgrounds] App Options')
		
		if(!$b24.auth.isAdmin)
		{
			throw new Error('Only the administrator can view and edit this page');
		}
		
		$b24Helper = new B24HelperManager($b24)
		
		isInit.value = true
		isProcess.value = false
		
		window.setTimeout(async () => {
			await makeRestore()
			await makeFitWindow()
		}, 200)
		
	}
	catch(error: any)
	{
		$logger.error(error)
		showError({
			statusCode: 404,
			statusMessage: error?.message || error,
			data: {
				homePageIsHide: true,
			},
			cause: error,
			fatal: true
		})
	}
})

onUnmounted(() => {
	$b24?.destroy()
	$b24Helper?.destroy()
})

const initializeB24Frame = async (): Promise<B24Frame> => {
	const queryParams: B24FrameQueryParams = {
		DOMAIN: null,
		PROTOCOL: false,
		APP_SID: null,
		LANG: null
	}
	
	if(window.name)
	{
		const [domain, protocol, appSid] = window.name.split('|')
		queryParams.DOMAIN = domain
		queryParams.PROTOCOL = parseInt(protocol) === 1
		queryParams.APP_SID = appSid
		queryParams.LANG = null
	}
	
	if(!queryParams.DOMAIN || !queryParams.APP_SID)
	{
		throw new Error('Unable to initialize Bitrix24Frame library!')
	}
	
	const b24Frame = new B24Frame(queryParams)
	await b24Frame.init()
	$logger.log('b24Frame:mounted')
	
	return b24Frame
}

/**
 * @link https://vueuse.org/core/computedAsync/
 */
const b24Helper: Ref<B24HelperManager|null> = computedAsync (
	async () => {
		if(null === $b24Helper)
		{
			throw new Error(`B24Characteristics not init`)
		}
		
		/**
		 * @memo usage for called dependencies changes
		 */
		if(appDataRevision.value)
		{}
		
		await $b24Helper.loadData([
			LoadDataType.Profile,
			LoadDataType.AppOptions,
			LoadDataType.UserOptions,
		])
		
		if(isProcess.value)
		{
			isProcess.value = false
			await makeFitWindow()
		}
		
		return $b24Helper
	},
	null,
	{
		lazy: true
	}
)
// endregion ////

// region Actions ////
const makeFitWindow = async () => {
	window.setTimeout(() => {
		$b24.parent.fitWindow()
	}, 200)
}

const makeRestore = async (): Promise<void> => {
	if(!b24Helper.value)
	{
		return Promise.reject(new Error('?? b24Helper'))
	}
	
	const optionsManager = b24Helper.value.appOptions;
	
	optionsData.keyFloat = optionsManager.getFloat(
		'keyFloat',
		optionsData.keyFloat
	)
	
	optionsData.keyInteger = optionsManager.getInteger(
		'keyInteger',
		optionsData.keyInteger
	)
	
	optionsData.keyBool = optionsManager.getBoolYN(
		'keyBool',
		optionsData.keyBool
	)
	
	optionsData.keyString = optionsManager.getString(
		'keyString',
		optionsData.keyString
	)
	
	optionsData.keyString = optionsManager.getString(
		'keyString',
		optionsData.keyString
	)
	
	optionsData.keyDate = optionsManager.getDate(
		'keyDate',
		optionsData.keyDate
	)
	
	const tmpList = optionsManager.getJsonArray(
		'keyString',
		optionsData.keyArray
	)
	optionsData.keyArray = []
	tmpList.forEach((userId) => {
		optionsData.keyArray.push(Text.toInteger(userId))
	})
	
	optionsData.keyObject = optionsManager.getJsonObject(
		'keyString',
		optionsData.keyObject
	) as Record<string, string>
	
	return Promise.resolve()
}

const makeClosePage = async (): Promise<void> => {
	return $b24.parent.closeApplication()
}

const makeSave = async (): Promise<void> => {
	try
	{
		await makeApply()
		await makeClosePage()
	}
	catch(error: any)
	{
		$logger.error(error)
		showError({
			statusCode: 404,
			statusMessage: error?.message || error,
			data: {
				homePageIsHide: true,
			},
			cause: error,
			fatal: true
		})
	}
}

const makeApply = async (): Promise<void> => {
	
	isProcess.value = true
	
	try
	{
		await $b24.callBatch([
			{
				method: 'app.option.set',
				params: {
					options: {
						keyFloat: optionsData.keyFloat,
						keyInt: optionsData.keyInteger,
						keyBool: optionsData.keyBool ? 'Y' : 'N',
						keyString: optionsData.keyString,
						keyArray: b24Helper.value?.appOptions.encode(
							optionsData.keyArray
						),
						keyObject: b24Helper.value?.appOptions.encode(
							optionsData.keyObject
						),
						keyDate: optionsData.keyDate.toISOString()
					}
				}
			},
			{
				method: 'pull.application.event.add',
				params: {
					COMMAND: 'reload.options',
					PARAMS: {
						from: 'app.options'
					},
					MODULE_ID: 'application'
				}
			},
		], true)
		
		isProcess.value = false
	}
	catch(error: any)
	{
		
		$logger.error(error)
		
		showError({
			statusCode: 404,
			statusMessage: error?.message || error,
			data: {
				homePageIsHide: true,
			},
			cause: error,
			fatal: true
		})
	}
}

// endregion ////

// region Actions.Pull ////
const makeSendPullCommand = async (
	command: string,
	params: Record<string, any> = {}
) => {
	return $b24.callMethod(
		'pull.application.event.add',
		{
			COMMAND: command,
			PARAMS: params,
			MODULE_ID: 'main'
		}
	)
	.catch((error: AjaxError) => {
		showError({
			statusCode: error.status,
			statusMessage: error.answerError.error,
			data: {
				description: error.answerError.errorDescription,
				homePageIsHide: true,
				isShowClearError: false,
				clearErrorHref: '/frame/app.options'
			},
			cause: error,
			fatal: true
		})
	})
}
// endregion ////

const dateTo_YYYY_MM_DD = (date: Date): string => {
	
	if(!date)
	{
		return ''
	}
	
	return new Date(date.getTime()-(date.getTimezoneOffset() * 60 * 1_000))
		.toISOString()
		.split('T')[0]
}

const dateToYYYY_MM_DD_T_HH_mm_ss = (date: Date): string => {
	
	if(!date)
	{
		return ''
	}
	
	const clearDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60 * 1_000))
	const dateChunks = clearDate.toISOString().split('T')
	dateChunks[1] = dateChunks[1].split('.')[0]
	
	return `${dateChunks[0]}T${dateChunks[1]}`
}

function onDateChange($event: Event)
{
	const element = $event.target as HTMLInputElement
	let newDateTime = Text.toDate(element.value, 'Y-m-dTH:i:s')
	
	$logger.info([
		element.value,
		newDateTime.toISOString(),
		optionsData.keyDate.toISOString(),
	])
	
	if(newDateTime)
	{
		// optionsData.keyDate.getTimezoneOffset()
		newDateTime.setHours(newDateTime.getHours() + (optionsData.keyDate.getTimezoneOffset() / 60))
		
		//newDateTime.setTime( newDateTime.getTime() + (3 * 60 * 60 * 1_000) )
		optionsData.keyDate = newDateTime
	}
	
	$logger.info([
		optionsData.keyDate.toISOString(),
	])
	
}

const makeSelectUsersV1 = async () => {
	try
	{
		const selectedUsers = await $b24.dialog.selectUsers()
		
		$logger.info(selectedUsers)
		
		optionsData.keyArray = []
		
		selectedUsers.forEach((row: SelectedUser) => {
			const userId = Text.toInteger(row.id)
			optionsData.keyArray.push(userId)
		})
	}
	catch(error: any)
	{
		$logger.error(error)
	}
}

const makeSelectUsersV2 = async () => {
	try
	{
		const selectedUsers = await $b24.dialog.selectUsers()
		
		$logger.info(selectedUsers)
		
		optionsData.keyObject = {}
		
		selectedUsers.forEach((row: SelectedUser) => {
			const userId = Text.toInteger(row.id)
			optionsData.keyObject[`user_${userId}`] = row.name
		})
	}
	catch(error: any)
	{
		$logger.error(error)
	}
}

// region Error ////
const problemMessageList = (result: IResult) => {
	let problemMessageList: string[] = []
	const problem = result.getErrorMessages()
	if( typeof (problem || '') === 'string' )
	{
		problemMessageList.push(problem.toString())
	}
	else if(Array.isArray(problem))
	{
		problemMessageList = problemMessageList.concat(problem)
	}
	
	return problemMessageList
}
// endregion ////
</script>

<template>
	<ClientOnly>
		<div>
			<div
				v-if="!isInit || !b24Helper"
				class="absolute top-0 bottom-0 left-0 right-0 flex flex-col justify-center items-center"
			>
				<div class="absolute z-10 text-info">
					<SpinnerIcon class="animate-spin stroke-2 size-44" />
				</div>
			</div>
			<div v-else class="p-4">
				<div>
					<h1 class="text-h1 font-semibold leading-7 text-base-900">App Options</h1>
					<p class="mt-1 max-w-2xl text-sm leading-6 text-base-500">@todo add some text</p>
				</div>
				<div class="mt-3 text-md text-base-900">
					<dl class="divide-y divide-base-100">
						<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
							<dt class="text-sm font-medium leading-6">
								keyFloat
							</dt>
							<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">
								<input
									type="number"
									step="15.03"
									v-model.number="optionsData.keyFloat"
									class="border border-base-300 text-base-900 rounded block w-full p-2.5 disabled:opacity-75"
									:disabled="isProcess"
								>
							</dd>
						</div>
						<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
							<dt class="text-sm font-medium leading-6">
								keyInt
							</dt>
							<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">
								<input
									type="number"
									step="2"
									v-model.number="optionsData.keyInteger"
									class="border border-base-300 text-base-900 rounded block w-full p-2.5 disabled:opacity-75"
									:disabled="isProcess"
								>
							</dd>
						</div>
						<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
							<dt class="text-sm font-medium leading-6">
								keyBool
							</dt>
							<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">
								<Toggle
									v-model="optionsData.keyBool"
									disabled:opacity-75
								/>
							</dd>
						</div>
						<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
							<dt class="text-sm font-medium leading-6">
								keyString
							</dt>
							<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">
								<input
									type="text"
									v-model="optionsData.keyString"
									class="border border-base-300 text-base-900 rounded block w-full p-2.5 disabled:opacity-75"
									:disabled="isProcess"
								>
							</dd>
						</div>
						<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
							<dt class="text-sm font-medium leading-6">
								keyDate
							</dt>
							<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">
								<input
									type="datetime-local"
									@change="onDateChange"
									:value="dateToYYYY_MM_DD_T_HH_mm_ss(optionsData.keyDate)"
									autocomplete="off"
									class="border border-base-300 text-base-900 rounded block w-full p-2.5 disabled:opacity-75"
									:disabled="isProcess"
								>
							</dd>
						</div>
						<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
							<dt class="text-sm font-medium leading-6">
								keyArray (list of userId)
							</dt>
							<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">
								<ul v-if="optionsData.keyArray.length > 0">
									<li
										v-for="(userId, userIndex) in optionsData.keyArray"
										:key="userId"
									>
										{{ userId }}
									</li>
								</ul>
								<div v-else>
									~ empty ~
								</div>
								
								<button
									type="button"
									class="flex relative flex-row flex-nowrap gap-1.5 justify-start items-center rounded-lg border border-base-100 bg-base-20 pl-2 pr-3 py-2 text-sm font-medium text-base-900 hover:shadow-md hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-base-200 disabled:shadow-none disabled:translate-y-0 disabled:text-base-900 disabled:opacity-75"
									@click="makeSelectUsersV1"
									:disabled="isProcess"
								>
									<div class="rounded-full text-base-900 bg-base-100 p-1">
										<UserGroupIcon class="size-5"/>
									</div>
									<div class="text-nowrap truncate">Select Users</div>
								</button>
							</dd>
						</div>
						<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
							<dt class="text-sm font-medium leading-6">
								keyObject (list of userName)
							</dt>
							<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">
								<ul v-if="optionsData.keyObject.values.length > 0">
									<li
										v-for="(userName, userIndex) in optionsData.keyArray"
										:key="userIndex"
									>
										{{ userName }}
									</li>
								</ul>
								<div v-else>
									~ empty ~
								</div>
								
								<button
									type="button"
									class="flex relative flex-row flex-nowrap gap-1.5 justify-start items-center rounded-lg border border-base-100 bg-base-20 pl-2 pr-3 py-2 text-sm font-medium text-base-900 hover:shadow-md hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-base-200 disabled:shadow-none disabled:translate-y-0 disabled:text-base-900 disabled:opacity-75"
									@click="makeSelectUsersV2"
									:disabled="isProcess"
								>
									<div class="rounded-full text-base-900 bg-base-100 p-1">
										<UserGroupIcon class="size-5"/>
									</div>
									<div class="text-nowrap truncate">Select Users</div>
								</button>
							</dd>
						</div>
						<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
							<dt class="text-sm font-medium leading-6">
								???
							</dt>
							<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">
								@todo
							</dd>
						</div>
						<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
							<dt class="text-sm font-medium leading-6">
								???
							</dt>
							<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">
								@todo
							</dd>
						</div>
					</dl>
				</div>
				<div>
					<pre>{{ optionsData }}</pre>
				</div>
				<div>
					<button
						@click="makeSave"
						:disabled="isProcess"
						class="mt-4 text-md font-semibold text-white bg-blue px-4 py-2 rounded hover:bg-blue-400 active:bg-blue-600"
					>Save</button>
					
					<button
						@click="makeApply"
						:disabled="isProcess"
						class="mt-4 text-md font-semibold text-white bg-blue px-4 py-2 rounded hover:bg-blue-400 active:bg-blue-600"
					>Apply</button>
					
					<button
						@click="makeClosePage"
						:disabled="isProcess"
						class="mt-4 text-md font-semibold text-white bg-blue px-4 py-2 rounded hover:bg-blue-400 active:bg-blue-600"
					>Cancel</button>
				</div>
			</div>
		</div>
	</ClientOnly>
</template>