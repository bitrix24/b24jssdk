<script setup lang="ts">
/**
 * @todo show error if open not in iframe
 */
import { ref, type Ref, onMounted, onUnmounted } from 'vue'
import { computedAsync } from '@vueuse/core'
import { LoggerBrowser, Result, type IResult } from '@bitrix24/b24jssdk'
import { type IB24 } from '@bitrix24/b24jssdk/core/abstractB24'
import {B24Frame, type SelectedUser, type SelectCRMParams, type SelectedCRMEntity, type SelectedAccess} from '@bitrix24/b24jssdk/frame'
import { CharacteristicsManager } from '@bitrix24/b24jssdk/helper/characteristicsManager'
import { LoadDataType } from '@bitrix24/b24jssdk/types/characteristics'
import type { B24FrameQueryParams } from '@bitrix24/b24jssdk/types/auth'
import Info from "../../components/Info.vue"
import SpinnerIcon from '@bitrix24/b24icons-vue/specialized/SpinnerIcon'
import LetCatInIcon from '@bitrix24/b24icons-vue/specialized/LetCatInIcon'

import Avatar from "../../components/Avatar.vue"
import ProgressBar from "~/components/ProgressBar.vue"
import TrashBinIcon from "@bitrix24/b24icons-vue/main/TrashBinIcon"
import Refresh7Icon from '@bitrix24/b24icons-vue/actions/Refresh7Icon'
import Forward3Icon from '@bitrix24/b24icons-vue/actions/Forward3Icon'
import CallChatIcon from '@bitrix24/b24icons-vue/main/CallChatIcon'
import VideoAndChatIcon from '@bitrix24/b24icons-vue/main/VideoAndChatIcon'
import TelephonyHandset6Icon from '@bitrix24/b24icons-vue/main/TelephonyHandset6Icon'
import MessengerIcon from '@bitrix24/b24icons-vue/social/MessengerIcon'
import DialogueIcon from '@bitrix24/b24icons-vue/crm/DialogueIcon'

import useFormatter from '@bitrix24/b24jssdk/tools/useFormatters'

definePageMeta({
	layout: "app"
})

// region Init ////
const logger = LoggerBrowser.build(
	'Demo: Frame',
	true
)

let B24: B24Frame

const is404: Ref<boolean> = ref(false)
const isInit: Ref<boolean> = ref(false)
let result: IResult = reactive(new Result())
const { formatterDateTime, formatterNumber } = useFormatter('en-US')
const { locales, setLocale } = useI18n()

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

onMounted(async () => {
	try
	{
		B24 = await initializeB24Frame()
		B24.setLogger(LoggerBrowser.build('Core', true))
		const appB24Lang = B24.getLang()
		
		if(locales.value.filter(i => i.code === appB24Lang).length > 0)
		{
			setLocale(appB24Lang)
			logger.log('setLocale >>>', appB24Lang)
		}
		else
		{
			logger.warn('not support locale >>>', appB24Lang)
		}
		
		await B24.parent.setTitle('[playgrounds] Testing Frame')
		
		
		/**
		 * @memo We call this because we need to preload the data.
		 */
		b24Characteristics.value
		
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

const b24Characteristics = computedAsync (
	async () => {
		const B24Characteristics = new CharacteristicsManager(B24 as unknown as IB24)
		await B24Characteristics.loadData([
			LoadDataType.Profile,
			LoadDataType.App
		])
		
		isInit.value = true
		
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
			if(Number(selectedUser.id) === (b24Characteristics.value?.userInfo.id || 0))
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
			(b24Characteristics.value?.userInfo.id || 0)
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
	
	let dialogId: any = String(promptDialogId)
	if(
		!dialogId.startsWith('chat')
		&& !dialogId.startsWith('imol')
	)
	{
		dialogId = Number(dialogId)
	}
	
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
			let selectedEntity = selectedCRMEntity.company[entity] as SelectedCRMEntity
			list.push([
				`[id: ${selectedEntity.id}]`,
				`${selectedEntity.type} ${selectedEntity.title}`,
			].join(' '))
		}
		
		for(const entity in selectedCRMEntity.lead)
		{
			let selectedEntity = selectedCRMEntity.lead[entity] as SelectedCRMEntity
			list.push([
				`[id: ${selectedEntity.id}]`,
				`${selectedEntity.type} ${selectedEntity.title}`,
			].join(' '))
		}
		
		for(const entity in selectedCRMEntity.contact)
		{
			let selectedEntity = selectedCRMEntity.contact[entity] as SelectedCRMEntity
			list.push([
				`[id: ${selectedEntity.id}]`,
				`${selectedEntity.type} ${selectedEntity.title}`,
			].join(' '))
		}
		
		for(const entity in selectedCRMEntity.deal)
		{
			let selectedEntity = selectedCRMEntity.deal[entity] as SelectedCRMEntity
			list.push([
				`[id: ${selectedEntity.id}]`,
				`${selectedEntity.type} ${selectedEntity.title}`,
			].join(' '))
		}
		
		for(const entity in selectedCRMEntity.deal)
		{
			let selectedEntity = selectedCRMEntity.deal[entity] as SelectedCRMEntity
			list.push([
				`[id: ${selectedEntity.id}]`,
				`${selectedEntity.type} ${selectedEntity.title}`,
			].join(' '))
		}
		
		for(const entity in selectedCRMEntity.quote)
		{
			let selectedEntity = selectedCRMEntity.quote[entity] as SelectedCRMEntity
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
			v-if="!isInit"
			class="absolute top-0 bottom-0 left-0 right-0 flex flex-col justify-center items-center"
		>
			<div class="absolute z-10 text-info">
				<SpinnerIcon class="animate-spin stroke-2 size-44" />
			</div>
		</div>
		<div v-else>
			<Info>
				Scopes: <code>user_brief</code>, <code>crm</code><br><br>
				To view query results, open the developer console.
			</Info>
			<ClientOnly>
				<div class="mt-6 flex flex-col sm:flex-row gap-10">
					<div class="basis-1/6 flex flex-col gap-y-2">
						<div
							v-if="b24Characteristics"
							class="px-lg2 py-sm2 border border-base-100 rounded-lg hover:shadow-md hover:-translate-y-px col-auto md:col-span-2 lg:col-span-1 bg-white cursor-pointer"
							@click.stop="makeOpenSliderForUser(b24Characteristics.userInfo.id || 0)"
						>
							<div class="flex items-center gap-4">
								<Avatar
									:src="b24Characteristics.userInfo.photo || ''"
									:alt="b24Characteristics.userInfo.lastName || 'user' "
								/>
								<div class="font-medium dark:text-white" >
									<div class="text-nowrap text-xs text-gray-500 dark:text-gray-400">
										{{ b24Characteristics.hostName.replace('https://', '') }}
									</div>
									<div class="text-nowrap hover:underline hover:text-info-link">
										{{ [
										b24Characteristics.userInfo.lastName,
										b24Characteristics.userInfo.name,
									].join(' ') }}
									</div>
									<div class="text-xs text-base-800 dark:text-gray-400 flex flex-row gap-x-2">
										<span>{{ b24Characteristics.userInfo.isAdmin ? 'Administrator' : '' }}</span>
										<span
											class="text-nowrap hover:underline hover:text-info-link"
											@click.stop="makeImOpenMessengerWithYourself()"
										>My notes</span>
									</div>
								</div>
							</div>
						</div>
						
						<button
							type="button"
							class="flex relative flex-row flex-nowrap gap-1.5 justify-start items-center rounded-lg border border-base-100 bg-base-20 pl-2 pr-3 py-2 text-sm font-medium text-base-900 hover:shadow-md hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-base-200 disabled:shadow-none disabled:translate-y-0 disabled:text-base-900 disabled:opacity-75"
							@click="makeSelectUsers"
							:disabled="status.isProcess"
						>
							<div class="rounded-full text-base-900 bg-base-100 p-1">
								<Refresh7Icon class="size-5"/>
							</div>
							<div class="text-nowrap truncate">@problem Select users</div>
						</button>
						<button
							type="button"
							class="flex relative flex-row flex-nowrap gap-1.5 justify-start items-center rounded-lg border border-base-100 bg-base-20 pl-2 pr-3 py-2 text-sm font-medium text-base-900 hover:shadow-md hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-base-200 disabled:shadow-none disabled:translate-y-0 disabled:text-base-900 disabled:opacity-75"
							@click="makeSelectAccess"
							:disabled="status.isProcess"
						>
							<div class="rounded-full text-base-900 bg-base-100 p-1">
								<Refresh7Icon class="size-5"/>
							</div>
							<div class="text-nowrap truncate">@problem Select access</div>
						</button>
						<button
							type="button"
							class="flex relative flex-row flex-nowrap gap-1.5 justify-start items-center rounded-lg border border-base-100 bg-base-20 pl-2 pr-3 py-2 text-sm font-medium text-base-900 hover:shadow-md hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-base-200 disabled:shadow-none disabled:translate-y-0 disabled:text-base-900 disabled:opacity-75"
							@click="makeSelectCRM"
							:disabled="status.isProcess"
						>
							<div class="rounded-full text-base-900 bg-base-100 p-1">
								<Refresh7Icon class="size-5"/>
							</div>
							<div class="text-nowrap truncate">@problem Select CRM</div>
						</button>
						<button
							type="button"
							class="flex relative flex-row flex-nowrap gap-1.5 justify-start items-center rounded-lg border border-base-100 bg-base-20 pl-2 pr-3 py-2 text-sm font-medium text-base-900 hover:shadow-md hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-base-200 disabled:shadow-none disabled:translate-y-0 disabled:text-base-900 disabled:opacity-75"
							@click="makeShowAppForm"
							:disabled="status.isProcess"
						>
							<div class="rounded-full text-base-900 bg-base-100 p-1">
								<Refresh7Icon class="size-5"/>
							</div>
							<div class="text-nowrap truncate">@problem makeShowAppForm</div>
						</button>
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
						<div
							class="mt-4 px-lg2 py-sm2 border border-base-100 rounded-lg col-auto md:col-span-2 lg:col-span-1 bg-white"
						>
							<div class="text-xs text-base-600">
								<h3 class="text-h5 font-semibold text-base-900">I18n</h3>
								<p>{{ $t('alert_title') }}</p>
								<p>{{ $t('error') }}</p>
							</div>
						</div>
						<div
							v-if="b24Characteristics"
							class="mt-4 px-lg2 py-sm2 border border-base-100 rounded-lg col-auto md:col-span-2 lg:col-span-1 bg-white"
						>
							<ul class="text-xs mt-sm2 text-base-600">
								<li>lang: {{ b24Characteristics.licenseInfo.languageId }}</li>
								<li>license: {{ b24Characteristics.licenseInfo.license }}</li>
								<li>licensePrevious: {{ b24Characteristics.licenseInfo.licensePrevious }}</li>
								<li>licenseType: {{ b24Characteristics.licenseInfo.licenseType }}</li>
								<li>licenseFamily: {{ b24Characteristics.licenseInfo.licenseFamily }}</li>
								<li>isSelfHosted: {{ b24Characteristics.licenseInfo.isSelfHosted ? 'Y' : 'N' }}</li>
								<li>isExpired: {{ b24Characteristics.paymentInfo.isExpired ? 'Y' : 'N' }}</li>
								<li>days: {{ b24Characteristics.paymentInfo.days }}</li>
							</ul>
						</div>
					</div>
				</div>
				<div class="absolute bottom-0 flex flex-row items-center justify-between text-blue-500">
					<div>Try change lang</div>
					<div><Forward3Icon class="mt-4 size-6 rotate-90" /></div>
				</div>
			</ClientOnly>
		</div>
	</div>
</template>