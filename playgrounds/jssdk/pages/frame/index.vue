<script setup lang="ts">
/**
 * @todo show error if open not in iframe
 */
import {ref, type Ref, onMounted, onUnmounted, watch, nextTick} from 'vue'
import { computedAsync } from '@vueuse/core'
import { LoggerBrowser, Result, type IResult } from '@bitrix24/b24jssdk'
import { type IB24 } from '@bitrix24/b24jssdk/core/abstractB24'
import { B24LangList } from '@bitrix24/b24jssdk/core/language/list'
import { B24Frame, type SelectedUser, type SelectCRMParams, type SelectedCRMEntity, type SelectedAccess } from '@bitrix24/b24jssdk/frame'
import { CharacteristicsManager } from '@bitrix24/b24jssdk/helper/characteristicsManager'
import { LoadDataType } from '@bitrix24/b24jssdk/types/characteristics'
import type { B24FrameQueryParams } from '@bitrix24/b24jssdk/types/auth'
import type { StatusClose } from '@bitrix24/b24jssdk/types/slider'
import Info from "../../components/Info.vue"
import Avatar from '../../components/Avatar.vue'
import ProgressBar from '~/components/ProgressBar.vue'
import Tabs from '~/components/Tabs.vue'
import SpinnerIcon from '@bitrix24/b24icons-vue/specialized/SpinnerIcon'
import LetCatInIcon from '@bitrix24/b24icons-vue/specialized/LetCatInIcon'
import UserGroupIcon from '@bitrix24/b24icons-vue/common-b24/UserGroupIcon'
import EditIcon from '@bitrix24/b24icons-vue/button/EditIcon'
import PlusIcon from '@bitrix24/b24icons-vue/button/PlusIcon'
import TrashBinIcon from "@bitrix24/b24icons-vue/main/TrashBinIcon"
import Refresh7Icon from '@bitrix24/b24icons-vue/actions/Refresh7Icon'
import CallChatIcon from '@bitrix24/b24icons-vue/main/CallChatIcon'
import VideoAndChatIcon from '@bitrix24/b24icons-vue/main/VideoAndChatIcon'
import TelephonyHandset6Icon from '@bitrix24/b24icons-vue/main/TelephonyHandset6Icon'
import MessengerIcon from '@bitrix24/b24icons-vue/social/MessengerIcon'
import DialogueIcon from '@bitrix24/b24icons-vue/crm/DialogueIcon'
import { useFormatter } from '@bitrix24/b24jssdk/tools/useFormatters'
import { useI18n } from '#imports'

definePageMeta({
	layout: "app"
})

// region Init ////
const logger = LoggerBrowser.build(
	'Demo: Frame',
	true
)

let B24: B24Frame
let B24Characteristics: null|CharacteristicsManager = null

const is404: Ref<boolean> = ref(false)
const isInit: Ref<boolean> = ref(false)
const appDataRevision: Ref<number> = ref(0)
let result: IResult = reactive(new Result())
const { formatterDateTime, formatterNumber } = useFormatter('en-US')
const { t, locales, setLocale } = useI18n()
const b24CurrentLang: Ref<string> = ref(B24LangList.en)

interface IStatus {
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
		start: null|Date,
		stop: null|Date,
		diff: null|number
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
		diff: null,
	}
} as IStatus)

const initializeB24Frame = async (): Promise<B24Frame> => {
	const queryParams: B24FrameQueryParams = {
		DOMAIN: null,
		PROTOCOL: false,
		APP_SID: null,
		LANG: null
	}
	
	if(window.name)
	{
		const [domain, protocol, appSid] = window.name.split('|');
		queryParams.DOMAIN = domain;
		queryParams.PROTOCOL = parseInt(protocol) === 1;
		queryParams.APP_SID = appSid;
		queryParams.LANG = null;
	}
	
	if(!queryParams.DOMAIN || !queryParams.APP_SID)
	{
		is404.value = true
		throw new Error('Unable to initialize Bitrix24Frame library!');
	}
	
	const b24Frame = new B24Frame(queryParams)
	await b24Frame.init()
	logger.log('b24Frame:mounted')
	
	return b24Frame
}

const defTabIndex = ref(5)
const valueForCurrency = ref(123456.789)
const tabsItems = [
	{
		key: 'lang',
		label: 'I18n',
		content: 'Demonstrates the output of language messages depending on the locale of Bitrix24'
	},
	{
		key: 'appInfo',
		label: 'App',
		content: 'Information about the application'
	},
	{
		key: 'licenseInfo',
		label: 'License & Payment',
		content: 'Designation of the plan with the region indicated as a prefix'
	},
	{
		key: 'specific',
		label: 'Specific',
		content: 'List of specific parameters for box and cloud'
	},
	{
		key: 'forB24Form',
		label: 'Form Fields',
		content: 'Examples of fields for the feedback form'
	},
	{
		key: 'currency',
		label: 'Currency',
		content: 'List of currencies created in Bitrix24'
	},
	{
		key: 'test',
		label: 'Test',
		content: '@todo'
	}
]

onMounted(async () => {
	try
	{
		B24 = await initializeB24Frame()
		B24.setLogger(LoggerBrowser.build('Core', true))
		b24CurrentLang.value = B24.getLang()
		
		if(locales.value.filter(i => i.code === b24CurrentLang.value).length > 0)
		{
			setLocale(b24CurrentLang.value)
			logger.log('setLocale >>>', b24CurrentLang.value)
		}
		else
		{
			logger.warn('not support locale >>>', b24CurrentLang.value)
		}
		
		await B24.parent.setTitle('[playgrounds] Testing Frame')
		
		B24Characteristics = new CharacteristicsManager(B24 as unknown as IB24)
		
		isInit.value = true
		
		await makeFitWindow()
	}
	catch(error: any)
	{
		result.addError(error)
		logger.error(error)
	}
})

onUnmounted(() => {
	if(isInit.value)
	{
		B24.destroy()
	}
})

/**
 * @link https://vueuse.org/core/computedAsync/
 */
const b24Characteristics: Ref<CharacteristicsManager|null> = computedAsync (
	async () => {
		if(null === B24Characteristics)
		{
			throw new Error(`B24Characteristics not init`)
		}
		
		/**
		 * @memo usage for called dependencies changes
		 */
		if(appDataRevision.value)
		{}
		
		await B24Characteristics.loadData([
			LoadDataType.Profile,
			LoadDataType.App,
			LoadDataType.Currency,
			LoadDataType.AppOptions,
			LoadDataType.UserOptions,
		])
		
		await makeFitWindow()
		
		if(!isInit.value)
		{
			isInit.value = true
		}
		
		return B24Characteristics;
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
		B24.parent.fitWindow()
		//B24.parent.resizeWindowAuto()
	}, 200)
}

const stopMakeProcess = () => {
	
	status.value.time.stop = new Date()
	if(
		status.value.time.stop
		&& status.value.time.start
	)
	{
		status.value.time.diff = Math.abs(status.value.time.stop.getTime() - status.value.time.start.getTime())
	}
	status.value.processInfo = null
	
	makeFitWindow()
	.then(() => {
		status.value.isProcess = false
	})
}

const clearConsole = () => {
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

const makeReloadWindow = async () => {
	reInitStatus()
	status.value.isProcess = true
	status.value.title = 'test makeReloadWindow'
	status.value.progress.animation = true
	status.value.progress.indicator = false
	status.value.progress.value = null
	
	return B24.parent.reloadWindow()
	.catch((error: Error|string) => {
		result.addError(error);
		logger.error(error);
	})
}

const makeOpenSliderForUser = async (userId: number) => {
	return B24.slider.openPath(
		B24.slider.getUrl(`/company/personal/user/${userId}/`),
		950
	)
	.then((response: StatusClose) => {
		if(
			!response.isOpenAtNewWindow
			&& response.isClose
		)
		{
			logger.info("Slider is closed! Reinit the application")
			isInit.value = false
			appDataRevision.value += 1
		}
		logger.warn(response)
	})
}

const makeOpenSliderEditCurrency = async (currencyCode: string) => {
	return B24.slider.openPath(
		B24.slider.getUrl(`/crm/configs/currency/edit/${currencyCode}/`),
		950
	)
	.then((response: StatusClose) => {
		if(
			!response.isOpenAtNewWindow
			&& response.isClose
		)
		{
			logger.info("Slider is closed! Reinit the application")
			isInit.value = false
			appDataRevision.value += 1
		}
		logger.warn(response)
	})
}

const makeOpenSliderAddCurrency = async () => {
	return B24.slider.openPath(
		B24.slider.getUrl(`/crm/configs/currency/add/`),
		950
	)
	.then((response: StatusClose) => {
		if(
			!response.isOpenAtNewWindow
			&& response.isClose
		)
		{
			logger.info("Slider is closed! Reinit the application")
			isInit.value = false
			appDataRevision.value += 1
		}
		logger.warn(response)
	})
}

const makeOpenPage = async (url: string) => {
	return B24.slider.openPath(
		B24.slider.getUrl(url),
		950
	)
}

const makeOpenUfList = async (url: string) => {
	
	const path = B24.slider.getUrl(url)
	path.searchParams.set('moduleId', 'crm')
	path.searchParams.set('entityId', 'CRM_DEAL')
	
	return B24.slider.openPath(
		path,
		950
	)
}

const makeImCallTo = async (isVideo: boolean = true) => {
	return new Promise((resolve) => {
		reInitStatus()
		status.value.isProcess = true
		status.value.title = 'test imCallTo'
		
		status.value.progress.animation = true
		status.value.progress.indicator = false
		status.value.progress.value = null
		status.value.time.start = new Date()
		
		return resolve(null)
	})
	.then(async () => {
		status.value.messages.push('use B24.dialog.selectUser to select a user')
		
		const selectedUser = await B24.dialog.selectUser()
		
		logger.info(selectedUser)
		
		if(selectedUser)
		{
			if(Number(selectedUser.id) === (b24Characteristics.value?.profileInfo.data.id || 0))
			{
				return Promise.reject(new Error('You can\'t make a call to yourself'))
			}
			status.value.messages.push('use B24.parent.imCallTo to initiate a call via intercom')
			return B24.parent.imCallTo(
				Number(selectedUser.id),
				isVideo
			)
		}
		
		return Promise.reject(new Error('User not selected'))
	})
	.catch((error: Error|string) => {
		result.addError(error)
		logger.error(error)
	})
	.finally(() => {stopMakeProcess()})
}

const makeImPhoneTo = async () => {
	return new Promise((resolve) => {
		reInitStatus()
		status.value.isProcess = true
		status.value.title = 'test ImPhoneTo'
		status.value.messages.push('use B24.parent.imPhoneTo to make call')
		
		status.value.progress.animation = true
		status.value.progress.indicator = false
		status.value.progress.value = null
		status.value.time.start = new Date()
		
		return resolve(null)
	})
	.then(async () => {
		
		const promptPhone = prompt(
			'Please provide phone'
		)
		
		if(null === promptPhone)
		{
			return Promise.resolve()
		}
		
		const phone = String(promptPhone)
		
		if(phone.length < 1)
		{
			return Promise.reject(new Error('Empty phone number'))
		}
		
		return B24.parent.imPhoneTo(
			phone
		)
	})
	.catch((error: Error|string) => {
		result.addError(error)
		logger.error(error)
	})
	.finally(() => {stopMakeProcess()})
}

const makeImOpenMessenger = async () => {
	return new Promise((resolve) => {
		reInitStatus()
		status.value.isProcess = true
		status.value.title = 'test imOpenMessenger'
		status.value.messages.push('use B24.parent.imOpenMessenger to open a chat window')
		status.value.progress.animation = true
		status.value.progress.indicator = false
		status.value.progress.value = null
		status.value.time.start = new Date()
		
		return resolve(null)
	})
	.then(async () => {
		const promptDialogId = prompt(
			'Please provide dialogId (number|`chat${number}`|`sg${number}`|`imol|${number}`|undefined)'
		)
		
		if(null === promptDialogId)
		{
			return Promise.resolve()
		}
		
		let dialogId: any = String(promptDialogId)
		
		if(dialogId.length < 1)
		{
			dialogId = undefined
		}
		else if(
			!dialogId.startsWith('chat')
			&& !dialogId.startsWith('imol')
			&& !dialogId.startsWith('sg')
		)
		{
			dialogId = Number(dialogId)
		}
		
		return B24.parent.imOpenMessenger(
			dialogId
		)
	})
	.catch((error: Error|string) => {
		result.addError(error)
		logger.error(error)
	})
	.finally(() => {stopMakeProcess()})
}

const makeImOpenMessengerWithYourself = async () => {
	return new Promise((resolve) => {
		reInitStatus()
		status.value.isProcess = true
		status.value.title = 'test imOpenMessenger'
		status.value.messages.push('use B24.parent.imOpenMessenger to open a chat window with yourself')
		status.value.progress.animation = true
		status.value.progress.indicator = false
		status.value.progress.value = null
		status.value.time.start = new Date()
		
		return resolve(null)
	})
	.then(async () => {
		return B24.parent.imOpenMessenger(
			(b24Characteristics.value?.profileInfo.data.id || 0)
		)
	})
	.catch((error: Error|string) => {
		result.addError(error)
		logger.error(error)
	})
	.finally(() => {stopMakeProcess()})
}

const makeImOpenHistory = async () => {
	const promptDialogId = prompt(
		'Please provide dialogId (number|`chat${number}`|`imol|${number})'
	)
	
	if(null === promptDialogId)
	{
		return Promise.resolve()
	}
	
	let dialogId: any = String(promptDialogId)
	
	if(
		!dialogId.startsWith('chat')
		&& !dialogId.startsWith('imol')
	)
	{
		dialogId = Number(dialogId)
	}
	
	debugger
	return B24.parent.imOpenHistory(
		dialogId
	)
}

const makeSelectUsers = async () => {
	return new Promise((resolve) => {
		reInitStatus()
		status.value.isProcess = true
		status.value.title = 'test B24.dialog.selectUsers'
		status.value.messages.push('use B24.dialog.selectUsers to select a user')
		
		status.value.progress.animation = true
		status.value.progress.indicator = false
		status.value.progress.value = null
		status.value.time.start = new Date()
		
		return resolve(null)
	})
	.then(async () => {
		const selectedUsers = await B24.dialog.selectUsers()
		
		logger.info(selectedUsers)
		
		const list = selectedUsers.map((row: SelectedUser): string => {
			return [
				`[id: ${row.id}]`,
				row.name,
			].join(' ')
		})
		
		if(list.length < 1)
		{
			list.push('~ empty ~')
		}
		
		status.value.resultInfo = `list: ${list.join('; ')}`
	})
	.catch((error: Error|string) => {
		result.addError(error)
		logger.error(error)
	})
	.finally(() => {stopMakeProcess()})
}

/**
 * @deprecated
 */
const makeSelectAccess = async () => {
	return new Promise((resolve) => {
		reInitStatus()
		status.value.isProcess = true
		status.value.title = 'test B24.dialog.selectAccess'
		status.value.messages.push('using B24.dialog.selectAccess displays the standard access permission selection dialog')
		
		status.value.progress.animation = true
		status.value.progress.indicator = false
		status.value.progress.value = null
		status.value.time.start = new Date()
		
		return resolve(null)
	})
	.then(async () => {
		
		status.value.messages.push('blocked CR, AU')
		
		const blockedAccessPermissions: string[] = [
			'CR', 'AU'
		]
		const selectedAccess = await B24.dialog.selectAccess(
			blockedAccessPermissions
		)
		
		logger.info(selectedAccess)
		
		const list = selectedAccess.map((row: SelectedAccess): string => {
			return [
				`[id: ${row.id}]`,
				row.name,
			].join(' ')
		})
		
		if(list.length < 1)
		{
			list.push('~ empty ~')
		}
		
		status.value.resultInfo = `list: ${list.join('; ')}`
	})
	.catch((error: Error|string) => {
		result.addError(error)
		logger.error(error)
	})
	.finally(() => {stopMakeProcess()})
}

/**
 * @deprecated
 */
const makeSelectCRM = async () => {
	return new Promise((resolve) => {
		reInitStatus()
		status.value.isProcess = true
		status.value.title = 'test B24.dialog.selectCRM'
		status.value.messages.push('using B24.dialog.selectCRM invokes a system dialog to select a CRM entity')
		
		status.value.progress.animation = true
		status.value.progress.indicator = false
		status.value.progress.value = null
		status.value.time.start = new Date()
		
		return resolve(null)
	})
	.then(async () => {
		
		status.value.messages.push('select company, lead, contact, deal, quote')
		status.value.messages.push('Pre-init companyId 1')
		
		const params: SelectCRMParams = {
			entityType: ['company', 'lead', 'contact', 'deal', 'quote'],
			multiple: true,
			value: {
				company: [1]
			}
		}
		
		const selectedCRMEntity = await B24.dialog.selectCRM(
			params
		)
		
		logger.info(selectedCRMEntity)
		
		const list = []
		
		for(const entity in selectedCRMEntity.company)
		{
			let selectedEntity = selectedCRMEntity.company[Number(entity)] as unknown as SelectedCRMEntity
			list.push([
				`[id: ${selectedEntity.id}]`,
				`${selectedEntity.type} ${selectedEntity.title}`,
			].join(' '))
		}
		
		for(const entity in selectedCRMEntity.lead)
		{
			let selectedEntity = selectedCRMEntity.lead[Number(entity)] as unknown as SelectedCRMEntity
			list.push([
				`[id: ${selectedEntity.id}]`,
				`${selectedEntity.type} ${selectedEntity.title}`,
			].join(' '))
		}
		
		for(const entity in selectedCRMEntity.contact)
		{
			let selectedEntity = selectedCRMEntity.contact[Number(entity)] as unknown as SelectedCRMEntity
			list.push([
				`[id: ${selectedEntity.id}]`,
				`${selectedEntity.type} ${selectedEntity.title}`,
			].join(' '))
		}
		
		for(const entity in selectedCRMEntity.deal)
		{
			let selectedEntity = selectedCRMEntity.deal[Number(entity)] as unknown as SelectedCRMEntity
			list.push([
				`[id: ${selectedEntity.id}]`,
				`${selectedEntity.type} ${selectedEntity.title}`,
			].join(' '))
		}
		
		for(const entity in selectedCRMEntity.deal)
		{
			let selectedEntity = selectedCRMEntity.deal[Number(entity)] as unknown as SelectedCRMEntity
			list.push([
				`[id: ${selectedEntity.id}]`,
				`${selectedEntity.type} ${selectedEntity.title}`,
			].join(' '))
		}
		
		for(const entity in selectedCRMEntity.quote)
		{
			let selectedEntity = selectedCRMEntity.quote[Number(entity)] as unknown as SelectedCRMEntity
			list.push([
				`[id: ${selectedEntity.id}]`,
				`${selectedEntity.type} ${selectedEntity.title}`,
			].join(' '))
		}
		
		if(list.length < 1)
		{
			list.push('~ empty ~')
		}
		
		status.value.resultInfo = `list: ${list.join('; ')}`
	})
	.catch((error: Error|string) => {
		result.addError(error)
		logger.error(error)
	})
	.finally(() => {stopMakeProcess()})
}

/**
 * @deprecated
 */
const makeShowAppForm = async () => {
	return new Promise((resolve) => {
		reInitStatus()
		status.value.isProcess = true
		status.value.title = 'test B24.slider.showAppForm'
		status.value.messages.push('using B24.slider.showAppForm @todo')
		
		status.value.progress.animation = true
		status.value.progress.indicator = false
		status.value.progress.value = null
		status.value.time.start = new Date()
		
		return resolve(null)
	})
	.then(async () => {
		return B24.slider.showAppForm({
			data: '123'
		})
	})
	.catch((error: Error|string) => {
		result.addError(error)
		logger.error(error)
	})
	.finally(() => {stopMakeProcess()})
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

watch(defTabIndex, async () => {
	await nextTick()
	
	await B24.parent.fitWindow()
})

</script>

<template>
	<div
		v-if="is404"
		class="absolute top-0 bottom-0 left-0 right-0 flex flex-col justify-center items-center"
	>
		<div class="absolute z-10 text-info w-full h-screen">
			<LetCatInIcon class="w-full h-screen" />
		</div>
	</div>
	<div v-else>
		<div
			v-if="!isInit || !b24Characteristics"
			class="absolute top-0 bottom-0 left-0 right-0 flex flex-col justify-center items-center"
		>
			<div class="absolute z-10 text-info">
				<SpinnerIcon class="animate-spin stroke-2 size-44" />
			</div>
		</div>
		<div v-else>
			<ClientOnly>
				<div class="p-4 flex items-center justify-start">
					<div class="flex items-center">
						<div
							v-if="b24Characteristics"
							class="mt-2 px-lg2 py-sm2 border border-base-100 rounded-lg hover:shadow-md hover:-translate-y-px col-auto md:col-span-2 lg:col-span-1 bg-white cursor-pointer"
							@click.stop="makeOpenSliderForUser(b24Characteristics.profileInfo.data.id || 0)"
						>
							<div class="flex items-center gap-4">
								<Avatar
									:src="b24Characteristics.profileInfo.data.photo || ''"
									:alt="b24Characteristics.profileInfo.data.lastName || 'user' "
								/>
								<div class="font-medium dark:text-white" >
									<div class="text-nowrap text-xs text-base-500 dark:text-base-400">
										{{ b24Characteristics.hostName.replace('https://', '') }}
									</div>
									<div class="text-nowrap hover:underline hover:text-info-link">
										{{ [
										b24Characteristics.profileInfo.data.lastName,
										b24Characteristics.profileInfo.data.name,
									].join(' ') }}
									</div>
									<div class="text-xs text-base-800 dark:text-base-400 flex flex-row gap-x-2">
										<span>{{ b24Characteristics.profileInfo.data.isAdmin ? 'Administrator' : '' }}</span>
										<span
											class="text-nowrap hover:underline hover:text-info-link"
											@click.stop="makeImOpenMessengerWithYourself()"
										>My notes</span>
									</div>
								</div>
							</div>
						</div>
					</div>
					<div class="ml-4 w-0 flex-1">
						<Info>
							Scopes: <code>user_brief</code>, <code>crm</code><br><br>
							To view query results, open the developer console.
						</Info>
					</div>
				</div>
				<div class="mt-2" v-if="b24Characteristics">
					<Tabs
						:items="tabsItems"
						v-model="defTabIndex"
					>
						<template #item="{ item }">
							<div class="p-4">
								<div>
									<h3 class="text-h3 font-semibold leading-7 text-base-900">{{ item.label }}</h3>
									<p class="mt-1 max-w-2xl text-sm leading-6 text-base-500">{{ item.content }}</p>
								</div>
								<div class="mt-3 text-md text-base-900">
									<div v-if="item.key === 'lang'">
										<dl class="divide-y divide-base-100">
											<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
												<dt class="text-sm font-medium leading-6">message 1</dt>
												<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">{{ t('message1') }}</dd>
											</div>
											<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
												<dt class="text-sm font-medium leading-6">message 2</dt>
												<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">{{ t('message2') }}</dd>
											</div>
										</dl>
										
										<div class="pt-6">
											<b class="text-alert">@todo if-not slider mode</b>
											<Info>Try changing the language at the bottom of the page</Info>
										</div>
									</div>
									<div v-else-if="item.key === 'appInfo'" class="space-y-3">
										<dl class="divide-y divide-base-100">
											<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
												<dt class="text-sm font-medium leading-6">local identifier of the application on the account</dt>
												<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">{{ b24Characteristics.appInfo.data.id }}</dd>
											</div>
											<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
												<dt class="text-sm font-medium leading-6">application code</dt>
												<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">{{ b24Characteristics.appInfo.data.code }}</dd>
											</div>
											<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
												<dt class="text-sm font-medium leading-6">installed version of the application</dt>
												<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">{{ b24Characteristics.appInfo.data.version }}</dd>
											</div>
											<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
												<dt class="text-sm font-medium leading-6">status of the application</dt>
												<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">{{ b24Characteristics.appInfo.statusCode }} [{{ b24Characteristics.appInfo.data.status }}]</dd>
											</div>
											<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
												<dt class="text-sm font-medium leading-6">status of the application's installation</dt>
												<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">{{ b24Characteristics.appInfo.data.isInstalled ? 'Y' : 'N' }}</dd>
											</div>
										</dl>
									</div>
									<div v-else-if="item.key === 'licenseInfo'" class="space-y-3">
										<dl class="divide-y divide-base-100">
											<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
												<dt class="text-sm font-medium leading-6">language code designation</dt>
												<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">{{ b24Characteristics.licenseInfo.data.languageId }}</dd>
											</div>
											<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
												<dt class="text-sm font-medium leading-6">tariff designation with indication of the region as a prefix</dt>
												<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">{{ b24Characteristics.licenseInfo.data.license }}</dd>
											</div>
											<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
												<dt class="text-sm font-medium leading-6">internal tariff designation without indication of region</dt>
												<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">{{ b24Characteristics.licenseInfo.data.licenseType }}</dd>
											</div>
											<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
												<dt class="text-sm font-medium leading-6">past meaning of license</dt>
												<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">{{ b24Characteristics.licenseInfo.data.licensePrevious }}</dd>
											</div>
											<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
												<dt class="text-sm font-medium leading-6">tariff designation without specifying the region</dt>
												<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">{{ b24Characteristics.licenseInfo.data.licenseFamily }}</dd>
											</div>
											<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
												<dt class="text-sm font-medium leading-6">flag indicating whether it is a box or a cloud</dt>
												<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">{{ b24Characteristics.licenseInfo.data.isSelfHosted ? 'Y' : 'N' }}</dd>
											</div>
											<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
												<dt class="text-sm font-medium leading-6">flag indicating whether the paid period or trial period has expired</dt>
												<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">{{ b24Characteristics.paymentInfo.data.isExpired ? 'Y' : 'N' }}</dd>
											</div>
											<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
												<dt class="text-sm font-medium leading-6">number of days remaining until the end of the paid period or trial period</dt>
												<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">{{ b24Characteristics.paymentInfo.data.days }}</dd>
											</div>
										</dl>
									</div>
									<div v-else-if="item.key === 'specific'" class="space-y-3">
										<dl class="divide-y divide-base-100">
											<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
												<dt class="text-sm font-medium leading-6">flag indicating whether it is a box or a cloud</dt>
												<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">{{ b24Characteristics.isSelfHosted ? 'Y' : 'N' }}</dd>
											</div>
											<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
												<dt class="text-sm font-medium leading-6">the increment step of fields of type ID</dt>
												<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">{{ b24Characteristics.primaryKeyIncrementValue }}</dd>
											</div>
											<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
												<dt class="text-sm font-medium leading-6">specific URLs for a box or cloud</dt>
												<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">
													<ul role="list" class="divide-y divide-base-100">
														<li class="flex items-center justify-start pb-4 pl-0 pr-5 text-sm leading-1">
															<div class="flex items-center">
																<div class="truncate font-medium">MainSettings</div>
															</div>
															<div class="ml-4 flex-shrink-0">
																<div class="cursor-pointer underline hover:text-info-link" @click.stop="makeOpenPage(b24Characteristics.b24SpecificUrl.MainSettings)">{{ b24Characteristics.b24SpecificUrl.MainSettings }}</div>
															</div>
														</li>
														<li class="flex items-center justify-start py-4 pl-0 pr-5 text-sm leading-1">
															<div class="flex items-center">
																<div class="truncate font-medium">UfList</div>
															</div>
															<div class="ml-4 flex-shrink-0">
																<div class="cursor-pointer underline hover:text-info-link" @click.stop="makeOpenUfList(b24Characteristics.b24SpecificUrl.UfList)">{{ b24Characteristics.b24SpecificUrl.UfList }}</div>
															</div>
														</li>
														<li class="flex items-center justify-start py-4 pl-0 pr-5 text-sm leading-1">
															<div class="flex items-center">
																<div class="truncate font-medium">UfPage</div>
															</div>
															<div class="ml-4 flex-shrink-0">
																{{ b24Characteristics.b24SpecificUrl.UfPage }}
															</div>
														</li>
													</ul>
												</dd>
											</div>
										</dl>
									</div>
									<div v-else-if="item.key === 'forB24Form'" class="space-y-3">
										<dl class="divide-y divide-base-100">
											<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
												<dt class="text-sm font-medium leading-6">app_code</dt>
												<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">{{ b24Characteristics.forB24Form.app_code }}</dd>
											</div>
											<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
												<dt class="text-sm font-medium leading-6">app_status</dt>
												<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">{{ b24Characteristics.forB24Form.app_status }}</dd>
											</div>
											<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
												<dt class="text-sm font-medium leading-6">payment_expired</dt>
												<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">{{ b24Characteristics.forB24Form.payment_expired }}</dd>
											</div>
											<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
												<dt class="text-sm font-medium leading-6">days</dt>
												<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">{{ b24Characteristics.forB24Form.days }}</dd>
											</div>
											<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
												<dt class="text-sm font-medium leading-6">b24_plan</dt>
												<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">{{ b24Characteristics.forB24Form.b24_plan }}</dd>
											</div>
											<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
												<dt class="text-sm font-medium leading-6">c_name</dt>
												<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">{{ b24Characteristics.forB24Form.c_name }}</dd>
											</div>
											<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
												<dt class="text-sm font-medium leading-6">c_last_name</dt>
												<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">{{ b24Characteristics.forB24Form.c_last_name }}</dd>
											</div>
											<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
												<dt class="text-sm font-medium leading-6">hostname</dt>
												<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">{{ b24Characteristics.forB24Form.hostname }}</dd>
											</div>
										</dl>
									</div>
									<div v-else-if="item.key === 'currency'" class="space-y-3">
										<dl class="divide-y divide-base-100">
											<div class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0">
												<dt class="pt-2 text-sm font-medium leading-6 flex flex-row gap-2 items-start justify-start">
													<button
														class="text-base-400 hover:text-base-master hover:bg-base-100 rounded"
														@click.stop="makeOpenSliderAddCurrency()"
													>
														<PlusIcon class="size-6" />
													</button>
													
													<div class="flex-1">Symbolic Identifier of the Base Currency</div>
												</dt>
												<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">
													<div class="text-sm font-medium flex flex-row gap-2 items-center justify-start">
														<div>
															<input
																type="number"
																v-model.number="valueForCurrency"
																class="border border-base-300 text-base-900 rounded block w-full p-2.5"
															>
														</div>
														<div class="flex-1">{{ b24Characteristics.currency.baseCurrency }}</div>
													</div>
												</dd>
											</div>
											<div
												v-for="(currencyCode) in b24Characteristics.currency.currencyList"
												class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-0"
												:key="currencyCode"
											>
												<dt class="text-sm font-medium leading-6 flex flex-row gap-2 items-start justify-start">
													<button
														class="text-base-400 hover:text-base-master hover:bg-base-100 rounded"
														@click.stop="makeOpenSliderEditCurrency(currencyCode)"
													>
														<EditIcon class="size-6" />
													</button>
													<div class="flex-1">{{ currencyCode }} • <span v-html="b24Characteristics.currency.getCurrencyFullName(currencyCode, b24CurrentLang)"></span> • <span v-html="b24Characteristics.currency.getCurrencyLiteral(currencyCode)"></span></div>
												</dt>
												<dd class="mt-1 text-sm leading-6 text-base-700 sm:col-span-2 sm:mt-0">
													<span v-html="b24Characteristics.currency.format(valueForCurrency, currencyCode, b24CurrentLang)"></span>
												</dd>
											</div>
										</dl>
									</div>
									<div v-else-if="item.key === 'test'" class="space-y-3">
										<div class="mt-6 flex flex-col sm:flex-row gap-10">
											<div class="basis-1/6 flex flex-col gap-y-2">
												<button
													type="button"
													class="flex relative flex-row flex-nowrap gap-1.5 justify-start items-center rounded-lg border border-base-100 bg-base-20 pl-2 pr-3 py-2 text-sm font-medium text-base-900 hover:shadow-md hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-base-200 disabled:shadow-none disabled:translate-y-0 disabled:text-base-900 disabled:opacity-75"
													@click="makeSelectUsers"
													:disabled="status.isProcess"
												>
													<div class="rounded-full text-base-900 bg-base-100 p-1">
														<UserGroupIcon class="size-5"/>
													</div>
													<div class="text-nowrap truncate">Select users</div>
												</button>
												<!--button
													type="button"
													class="flex relative flex-row flex-nowrap gap-1.5 justify-start items-center rounded-lg border border-base-100 bg-base-20 pl-2 pr-3 py-2 text-sm font-medium text-base-900 hover:shadow-md hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-base-200 disabled:shadow-none disabled:translate-y-0 disabled:text-base-900 disabled:opacity-75"
													@click="makeSelectAccess"
													:disabled="status.isProcess"
												>
													<div class="rounded-full text-base-900 bg-base-100 p-1">
														<Refresh7Icon class="size-5"/>
													</div>
													<div class="text-nowrap truncate">@problem Select access</div>
												</button-->
												<!--button
													type="button"
													class="flex relative flex-row flex-nowrap gap-1.5 justify-start items-center rounded-lg border border-base-100 bg-base-20 pl-2 pr-3 py-2 text-sm font-medium text-base-900 hover:shadow-md hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-base-200 disabled:shadow-none disabled:translate-y-0 disabled:text-base-900 disabled:opacity-75"
													@click="makeSelectCRM"
													:disabled="status.isProcess"
												>
													<div class="rounded-full text-base-900 bg-base-100 p-1">
														<Refresh7Icon class="size-5"/>
													</div>
													<div class="text-nowrap truncate">@problem Select CRM</div>
												</button-->
												<!--button
													type="button"
													class="flex relative flex-row flex-nowrap gap-1.5 justify-start items-center rounded-lg border border-base-100 bg-base-20 pl-2 pr-3 py-2 text-sm font-medium text-base-900 hover:shadow-md hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-base-200 disabled:shadow-none disabled:translate-y-0 disabled:text-base-900 disabled:opacity-75"
													@click="makeShowAppForm"
													:disabled="status.isProcess"
												>
													<div class="rounded-full text-base-900 bg-base-100 p-1">
														<Refresh7Icon class="size-5"/>
													</div>
													<div class="text-nowrap truncate">@problem makeShowAppForm</div>
												</button-->
												<button
													type="button"
													class="flex relative flex-row flex-nowrap gap-1.5 justify-start items-center rounded-lg border border-base-100 bg-base-20 pl-2 pr-3 py-2 text-sm font-medium text-base-900 hover:shadow-md hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-base-200 disabled:shadow-none disabled:translate-y-0 disabled:text-base-900 disabled:opacity-75"
													@click="makeReloadWindow"
													:disabled="status.isProcess"
												>
													<div class="rounded-full text-base-900 bg-base-100 p-1">
														<Refresh7Icon class="size-5"/>
													</div>
													<div class="text-nowrap truncate">Reload window</div>
												</button>
												<button
													type="button"
													class="flex relative flex-row flex-nowrap gap-1.5 justify-start items-center rounded-lg border border-base-100 bg-base-20 pl-2 pr-3 py-2 text-sm font-medium text-base-900 hover:shadow-md hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-base-200 disabled:shadow-none disabled:translate-y-0 disabled:text-base-900 disabled:opacity-75"
													@click="makeImCallTo(true)"
													:disabled="status.isProcess"
												>
													<div class="rounded-full text-base-900 bg-base-100 p-1">
														<VideoAndChatIcon class="size-5"/>
													</div>
													<div class="text-nowrap truncate">Video call</div>
												</button>
												<button
													type="button"
													class="flex relative flex-row flex-nowrap gap-1.5 justify-start items-center rounded-lg border border-base-100 bg-base-20 pl-2 pr-3 py-2 text-sm font-medium text-base-900 hover:shadow-md hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-base-200 disabled:shadow-none disabled:translate-y-0 disabled:text-base-900 disabled:opacity-75"
													@click="makeImCallTo(false)"
													:disabled="status.isProcess"
												>
													<div class="rounded-full text-base-900 bg-base-100 p-1">
														<CallChatIcon class="size-5"/>
													</div>
													<div class="text-nowrap truncate">Voice call</div>
												</button>
												<button
													type="button"
													class="flex relative flex-row flex-nowrap gap-1.5 justify-start items-center rounded-lg border border-base-100 bg-base-20 pl-2 pr-3 py-2 text-sm font-medium text-base-900 hover:shadow-md hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-base-200 disabled:shadow-none disabled:translate-y-0 disabled:text-base-900 disabled:opacity-75"
													@click="makeImOpenMessenger"
													:disabled="status.isProcess"
												>
													<div class="rounded-full text-base-900 bg-base-100 p-1">
														<MessengerIcon class="size-5"/>
													</div>
													<div class="text-nowrap truncate">Open Messenger</div>
												</button>
												<button
													type="button"
													class="flex relative flex-row flex-nowrap gap-1.5 justify-start items-center rounded-lg border border-base-100 bg-base-20 pl-2 pr-3 py-2 text-sm font-medium text-base-900 hover:shadow-md hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-base-200 disabled:shadow-none disabled:translate-y-0 disabled:text-base-900 disabled:opacity-75"
													@click="makeImOpenHistory"
													:disabled="status.isProcess"
												>
													<div class="rounded-full text-base-900 bg-base-100 p-1">
														<DialogueIcon class="size-5"/>
													</div>
													<div class="text-nowrap truncate">Open History</div>
												</button>
												<button
													type="button"
													class="flex relative flex-row flex-nowrap gap-1.5 justify-start items-center rounded-lg border border-base-100 bg-base-20 pl-2 pr-3 py-2 text-sm font-medium text-base-900 hover:shadow-md hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-base-200 disabled:shadow-none disabled:translate-y-0 disabled:text-base-900 disabled:opacity-75"
													@click="makeImPhoneTo"
													:disabled="status.isProcess"
												>
													<div class="rounded-full text-base-900 bg-base-100 p-1">
														<TelephonyHandset6Icon class="size-5"/>
													</div>
													<div class="text-nowrap truncate">Telephony</div>
												</button>
											</div>
											<div class="flex-1">
												<div class="px-lg2 py-sm2 border border-base-100 rounded-lg col-auto md:col-span-2 lg:col-span-1 bg-white">
													<div class="w-full flex items-center justify-between">
														<h3 class="text-h5 font-semibold">{{ status.title }}</h3>
														<button
															type="button"
															class="flex relative flex-row flex-nowrap gap-1.5 justify-center items-center uppercase rounded pl-1 pr-3 py-1.5 leading-none text-3xs font-medium text-base-700 hover:text-base-900 hover:bg-base-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-base-200 disabled:text-base-900 disabled:opacity-75"
															@click="clearConsole"
														>
															<TrashBinIcon class="size-4"/>
															<div class="text-nowrap truncate">Clear console</div>
														</button>
													</div>
													
													<ul class="text-xs mt-sm2" v-show="status.messages.length > 0">
														<li v-for="(message, index) in status.messages" :key="index">{{ message }}</li>
														<li class="mt-2 pl-2 text-base-600" v-show="null !== status.time.start">start: {{ formatterDateTime.formatDate(status.time?.start || new Date, 'H:i:s') }}</li>
														<li class="pl-2 text-base-600" v-show="null !== status.time.stop">stop: {{ formatterDateTime.formatDate(status.time?.stop || new Date, 'H:i:s') }}</li>
														<li class="pl-2 text-base-600" v-show="null !== status.time.diff">diff: {{ formatterNumber.format(status.time?.diff || 0) }} ms</li>
														<li class="mt-2 pl-2 text-base-800 font-bold" v-show="null !== status.resultInfo">{{ status.resultInfo }}</li>
													</ul>
													
													<div class="mt-2" v-show="status.isProcess">
														<div class="mt-2 pl-0.5 text-4xs text-blue-500" v-show="status.processInfo">{{ status.processInfo }}</div>
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
																	<span class="text-blue-500">{{ status.progress.value }} / {{ status.progress.max }}</span>
																</div>
															</template>
														</ProgressBar>
													</div>
												</div>
												<div
													class="mt-4 text-alert-text px-lg2 py-sm2 border border-base-30 rounded-md shadow-sm hover:shadow-md sm:rounded-md col-auto md:col-span-2 lg:col-span-1 bg-white"
													v-if="!result.isSuccess"
												>
													<h3 class="text-h5 font-semibold">Error</h3>
													<ul class="text-txt-md mt-sm2">
														<li v-for="(problem, index) in problemMessageList(result)" :key="index">{{ problem }}</li>
													</ul>
												</div>
											</div>
										</div>
									</div>
								</div>
							</div>
						</template>
					</Tabs>
				</div>
			</ClientOnly>
		</div>
	</div>
</template>