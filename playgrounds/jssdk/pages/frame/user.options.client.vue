<script setup lang="ts">
import {onMounted, onUnmounted, reactive, type Ref, ref, type ComputedRef, computed} from 'vue'
import {
	type SelectedUser,
	type B24FrameQueryParams,
	B24Frame,
	B24LangList,
	useB24Helper,
	LoadDataType,
	LoggerBrowser,
	Text,
	Type
} from '@bitrix24/b24jssdk'

import SpinnerIcon from '@bitrix24/b24icons-vue/specialized/SpinnerIcon'
import UserGroupIcon from '@bitrix24/b24icons-vue/common-b24/UserGroupIcon'
import BtnClockIcon from '@bitrix24/b24icons-vue/button-specialized/BtnClockIcon'
import Toggle from '../../components/Toggle.vue'
import { useI18n } from '#imports'

// region Init ////
definePageMeta({
	layout: 'slider'
})

const $logger = LoggerBrowser.build(
	'Demo: UserOptions',
	true
)

let $b24: B24Frame

const isInit: Ref<boolean> = ref(false)
const processStatus: Ref<{save: boolean, apply: boolean}> = ref({
	save: false,
	apply: false,
})
const { initB24Helper, destroyB24Helper, getB24Helper } = useB24Helper()
const { locales, setLocale } = useI18n()
const b24CurrentLang: Ref<string> = ref(B24LangList.en)

type TypeOptions = {
	keyFloat: number,
	keyInteger: number,
	keyBool: boolean,
	keyString: string,
	keyDate: null|Date,
	keyDateTime: null|Date,
	keyArray: number[],
	keyObject: Record<string, string>
}

const defaultData: TypeOptions = {
	keyFloat: 10.99,
	keyInteger: 24,
	keyBool: true,
	keyString: 'B24',
	keyDate: new Date(),
	keyDateTime: new Date(),
	keyArray: [],
	keyObject: {}
}
defaultData.keyDate?.setHours(0, 0, 0, 0)

const optionsData: TypeOptions = reactive({
	keyFloat: 0,
	keyInteger: 0,
	keyBool: false,
	keyString: '',
	keyDate: null,
	keyDateTime: null,
	keyArray: [],
	keyObject: {}
})

onMounted(async () => {
	try
	{
		$b24 = await initializeB24Frame()
		
		$b24.setLogger(LoggerBrowser.build('Core >> Slider', true))
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
		
		await initB24Helper(
			$b24,
			[
				LoadDataType.Profile,
				LoadDataType.UserOptions,
			]
		)
		
		isInit.value = true
		processStatus.value.save = false
		processStatus.value.apply = false
		
		window.setTimeout(async () => {
			makeRestore()
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
	destroyB24Helper()
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
// endregion ////

// region Actions ////
const isProcess: ComputedRef<boolean> = computed((): boolean => {
	return processStatus.value.save || processStatus.value.apply
})

const makeFitWindow = async () => {
	window.setTimeout(() => {
		$b24.parent.resizeWindowAuto()
	}, 200)
}

const makeRestore = (): void => {
	const optionsManager = getB24Helper().userOptions;
	
	optionsData.keyFloat = optionsManager.getFloat(
		'keyFloat',
		defaultData.keyFloat
	)
	
	optionsData.keyInteger = optionsManager.getInteger(
		'keyInteger',
		defaultData.keyInteger
	)
	
	optionsData.keyBool = optionsManager.getBoolYN(
		'keyBool',
		defaultData.keyBool
	)
	
	optionsData.keyString = optionsManager.getString(
		'keyString',
		defaultData.keyString
	)

	optionsData.keyDate = optionsManager.getDate(
		'keyDate',
		defaultData.keyDate
	)

	optionsData.keyDateTime = optionsManager.getDate(
		'keyDateTime',
		defaultData.keyDateTime
	)
	
	const tmpList = optionsManager.getJsonArray(
		'keyArray',
		defaultData.keyArray
	)
	optionsData.keyArray = []
	tmpList.forEach((userId: any) => {
		optionsData.keyArray.push(Text.toInteger(userId))
	})
	
	optionsData.keyObject = optionsManager.getJsonObject(
		'keyObject',
		defaultData.keyObject
	) as Record<string, string>
	
	$logger.info({
		come: optionsManager.data,
		def: defaultData,
		current: optionsData,
	})
}

const makeClosePage = async (): Promise<void> => {
	return $b24.parent.closeApplication()
}

const makeSave = async (): Promise<void> => {
	processStatus.value.save = true
	try
	{
		await makeApply()
		processStatus.value.save = false
		
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
	
	processStatus.value.save = false
}

const makeApply = async (): Promise<void> => {
	processStatus.value.apply = true
	
	try
	{
		await getB24Helper().userOptions.save(
			{
				keyFloat: optionsData.keyFloat,
				keyInteger: optionsData.keyInteger,
				keyBool: optionsData.keyBool ? 'Y' : 'N',
				keyString: optionsData.keyString,
				keyArray: getB24Helper().userOptions.encode(
					optionsData.keyArray
				),
				keyObject: getB24Helper().userOptions.encode(
					optionsData.keyObject
				),
				keyDate: tmpFormatDateWithTimezone(optionsData.keyDate),
				keyDateTime: tmpFormatDateWithTimezone(optionsData.keyDateTime)
			},
			{
				moduleId: 'main',
				command: 'reload.options',
				params: {
					from: 'user.options'
				},
			}
		)
		
		processStatus.value.apply = false
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
	
	processStatus.value.apply = false
}

const makeSelectUsersV1 = async () => {
	try
	{
		const selectedUsers = await $b24.dialog.selectUsers()
		
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
// endregion ////

// region TMP ////

// '2023-07-27'
const tmpDateFormat = (value?: any): string => {
	if(!(value instanceof Date))
	{
		return ''
	}
	
	const result = new Date(value.getTime()-(value.getTimezoneOffset() * 60 * 1_000))
	
	return result.toISOString().slice(0, 10)
}

const onTmpDateChange = ($event: Event): void => {
	const element = $event.target as HTMLInputElement
	
	const tmp = element.valueAsDate;
	
	if(!(tmp instanceof Date))
	{
		return
	}
	
	if(!(optionsData.keyDate instanceof Date))
	{
		optionsData.keyDate = new Date
	}
	
	optionsData.keyDate = new Date(tmp.getTime() - (optionsData.keyDate.getTimezoneOffset() * 60 * 1_000));
	optionsData.keyDate?.setHours(0, 0, 0, 0)
}

// '2023-07-27T09:23:28'
const tmpDateTimeFormat = (value?: any, isUseSeconds = true): string => {
	if(!(value instanceof Date))
	{
		return ''
	}
	
	const result = new Date(value.getTime() - (value.getTimezoneOffset() * 60 * 1_000))
	
	return result.toISOString().slice(0, isUseSeconds ? 19 : 16)
}

const onTmpDateTimeChange = ($event: Event): void => {
	const element = $event.target as HTMLInputElement
	
	let tmp = element.value;
	
	if(!Type.isStringFilled(tmp))
	{
		return
	}
	
	if(!(optionsData.keyDateTime instanceof Date))
	{
		optionsData.keyDateTime = new Date
	}

	optionsData.keyDateTime =new Date(tmp)
	
	$logger.info({
		c: tmpFormatDateWithTimezone(optionsData.keyDateTime),
	})
}

const tmpFormatDateWithTimezone = (date?: any): string => {
	if(!(date instanceof Date))
	{
		return ''
	}
	
	const pad = (n: number) => n.toString().padStart(2, '0')
	
	const year = date.getFullYear()
	const month = pad(date.getMonth() + 1)
	const day = pad(date.getDate())
	const hours = pad(date.getHours())
	const minutes = pad(date.getMinutes())
	const seconds = pad(date.getSeconds())
	
	const timezoneOffset = -date.getTimezoneOffset()
	const offsetHours = pad(Math.floor(Math.abs(timezoneOffset) / 60))
	const offsetMinutes = pad(Math.abs(timezoneOffset) % 60)
	const offsetSign = timezoneOffset >= 0 ? '+' : '-'
	
	return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offsetSign}${offsetHours}:${offsetMinutes}`
}
// endregion ////

</script>

<template>
	<ClientOnly>
		<div class="bg-white min-h-screen overflow-hidden">
			<div
				v-if="!isInit"
				class="absolute top-0 bottom-0 left-0 right-0 flex flex-col justify-center items-center"
			>
				<div class="absolute z-10 text-info">
					<SpinnerIcon class="animate-spin stroke-2 size-44" />
				</div>
			</div>
			<div
				v-else
			>
				<div class="p-4 mb-20">
					<div>
						<h1 class="text-h1 font-semibold leading-7 text-base-900">User Options</h1>
						<p class="mt-1 max-w-2xl text-sm leading-6 text-base-500">The user settings are listed here.</p>
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
									keyInteger
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
										type="date"
										:value="tmpDateFormat(optionsData.keyDate)"
										@change="onTmpDateChange"
										autocomplete="off"
										class="border border-base-300 text-base-900 rounded block w-full p-2.5 disabled:opacity-75"
										:disabled="isProcess"
									>
								</dd>
							</div>
							<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
								<dt class="text-sm font-medium leading-6">
									keyDateTime
								</dt>
								<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">
									<input
										type="datetime-local"
										:value="tmpDateTimeFormat(optionsData.keyDateTime, true)"
										@change="onTmpDateTimeChange"
										autocomplete="off"
										class="border border-base-300 text-base-900 rounded block w-full p-2.5 disabled:opacity-75"
										:disabled="isProcess"
									>
								</dd>
							</div>
							<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
								<dt class="text-sm font-medium leading-6">
									<div>keyArray (list of userId)</div>
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
								</dt>
								<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">
									<div v-if="optionsData.keyArray.length > 0">{{ optionsData.keyArray.join('; ') }}</div>
									<div v-else>
										~ empty ~
									</div>
								</dd>
							</div>
							<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
								<dt class="text-sm font-medium leading-6">
									<div>keyObject (list of userName)</div>
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
								</dt>
								<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">
									<div v-if="Object.values(optionsData.keyObject).length > 0">{{ Object.values(optionsData.keyObject).join('; ') }}</div>
									<div v-else>
										~ empty ~
									</div>
								</dd>
							</div>
						</dl>
					</div>
				</div>
				<div class="w-full shadow-top-2xs fixed insert-x-0 bottom-0 p-3 bg-white">
					<div class="flex flex-row items-center justify-end gap-1">
						<div class="w-2/3 flex flex-row justify-end gap-4">
							<button
								@click="makeSave"
								:disabled="isProcess"
								class="min-w-[90px] flex flex-row items-center justify-center text-xs text-center font-semibold text-base-900 uppercase bg-green px-6 rounded hover:bg-green-400 active:bg-green-600"
							>
								<BtnClockIcon class="w-lg h-lg" v-if="processStatus.save"/>
								<span v-else>Save</span>
							</button>
							
							<button
								@click="makeApply"
								:disabled="isProcess"
								class="min-w-[90px] flex flex-row items-center justify-center text-xs font-semibold text-white uppercase bg-blue px-6 rounded hover:bg-blue-400 active:bg-blue-600"
							>
								<BtnClockIcon class="w-lg h-lg" v-if="processStatus.apply && !processStatus.save"/>
								<span v-else>Apply</span>
							</button>
							
							<button
								@click="makeClosePage"
								:disabled="isProcess"
								class="text-xs text-center font-semibold text-base-900 uppercase px-2 py-3 hover:text-base-800 active:text-base-master"
							>Cancel</button>
						</div>
						<div class="w-1/3 flex flex-row justify-end gap-1">
							&nbsp;
						</div>
					</div>
				</div>
			</div>
		</div>
	</ClientOnly>
</template>