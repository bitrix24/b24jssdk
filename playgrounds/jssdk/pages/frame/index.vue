<script setup lang="ts">
import { ref, reactive, type Ref, onMounted } from 'vue'
import { LoggerBrowser, Result, type IResult } from '@bitrix24/b24jssdk'
import { B24Frame } from '@bitrix24/b24jssdk/frame'
import type {B24FrameQueryParams} from "@bitrix24/b24jssdk/types/auth";
import Info from "../../components/Info.vue";
import Avatar from "../../components/Avatar.vue";
import BtnSpinnerIcon from '@bitrix24/b24icons-vue/button-specialized/BtnSpinnerIcon'
import ProgressBar from "~/components/ProgressBar.vue";
import TrashBinIcon from "@bitrix24/b24icons-vue/main/TrashBinIcon";
import Refresh7Icon from '@bitrix24/b24icons-vue/actions/Refresh7Icon'
import Forward3Icon from '@bitrix24/b24icons-vue/actions/Forward3Icon'

import useFormatter from "@bitrix24/b24jssdk/tools/useFormatters";

definePageMeta({
	layout: "app"
})

// region Init ////
const logger = LoggerBrowser.build(
	'Demo: Frame',
	true
)

let B24: B24Frame;
const isInit: Ref<boolean> = ref(false)

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
} as IStatus);

let result: IResult = reactive(new Result())
const { formatterDateTime, formatterNumber } = useFormatter('en-US')
const { t, locales, setLocale } = useI18n()

onMounted(async (): Promise<void> => {
	return (():Promise<B24Frame> => new Promise((resolve, reject) => {
		let b24Frame: null|B24Frame = null;
		
		let queryParams: B24FrameQueryParams = {
			DOMAIN: null,
			PROTOCOL: false,
			APP_SID: null,
			LANG: null
		}
		
		logger.log('init', {
			windowName: window.name || '?'
		})
		
		if(!!window.name)
		{
			let q = window.name.split('|');
			queryParams.DOMAIN = q[0];
			queryParams.PROTOCOL = (parseInt(q[1]) || 0) === 1;
			queryParams.APP_SID = q[2];
			queryParams.LANG = null;
		}
		
		if(!queryParams.DOMAIN || !queryParams.APP_SID)
		{
			reject(new Error('Unable to initialize Bitrix24Frame library!'));
		}
		b24Frame = new B24Frame(
			queryParams
		);
		
		b24Frame.init()
		.then(() => {
			logger.log(`b24Frame:mounted`)
			resolve(b24Frame as B24Frame)
		})
		.catch((error) => {
			reject(error);
		})
	}))()
	.then((b24Frame: B24Frame): void => {
		B24 = b24Frame
		B24.setLogger(LoggerBrowser.build('Core', true))
		const appB24Lang = B24.getLang();
		
		if(locales.value.filter(i => i.code === appB24Lang).length > 0)
		{
			setLocale(appB24Lang);
			
			logger.log('setLocale >>>', appB24Lang);
		}
		else
		{
			logger.warn('not support locale >>>', appB24Lang);
		}
		
		isInit.value = true
	})
	.then(() => {
		 B24.parent.setTitle('[playgrounds] Testing Frame')
	 })
	.catch((error: Error|string) => {
		result.addError(error);
		logger.error(error);
	})
})
// endregion ////

// region Actions ////
const stopMakeProcess = () => {
	status.value.isProcess = false
	status.value.time.stop = new Date()
	if(
		status.value.time.stop
		&& status.value.time.start
	)
	{
		status.value.time.diff = Math.abs(status.value.time.stop.getTime() - status.value.time.start.getTime())
	}
	status.value.processInfo = null
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
	if(!isInit.value)
	{
		logger.warn('B24 not initiated')
		return
	}
	
	return B24.parent.reloadWindow()
	.catch((error: Error|string) => {
		result.addError(error);
		logger.error(error);
	})
}

const makeOpenSliderForUser = async(userId: number) => {
	return B24.slider.openPath(
		B24.slider.getUrl(`/company/personal/user/${userId}/`),
		950
	)
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
		v-if="!isInit"
		class="absolute top-0 bottom-0 left-0 right-0 flex flex-col justify-center items-center"
	>
		<div class="absolute z-10 text-info">
			<BtnSpinnerIcon class="size-44 stroke-1" />
		</div>
	</div>
	<div v-else>
		<ClientOnly>
			<div class="mt-2 flex flex-col sm:flex-row gap-10">
				<div class="basis-1/4 flex flex-col gap-y-6">
					<button
						type="button"
						class="flex relative flex-row flex-nowrap gap-1.5 justify-center items-center uppercase rounded border border-base-500 pl-1 pr-3 py-2 text-sm font-medium text-base-700 hover:text-base-900 hover:bg-base-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-base-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-base-200 disabled:text-base-900 disabled:opacity-75"
						@click="makeReloadWindow"
						:disabled="status.isProcess"
					>
						<Refresh7Icon class="size-6"/>
						<div class="text-nowrap truncate">Reload window</div>
					</button>
					
					<Info class="mt-6">
						Scopes: <code>user_brief</code>, <code>crm</code><br><br>
						To view query results, open the developer console.
					</Info>
				</div>
				<div class="flex-1">
					<div class="px-lg2 py-sm2 border border-base-100 rounded-md shadow-sm hover:shadow-md sm:rounded-md col-auto md:col-span-2 lg:col-span-1 bg-white">
						<div class="flex items-center gap-4">
							<Avatar
								:src="B24.properties.userInfo?.photo || ''"
								:alt="B24.properties.userInfo.lastName || 'user' "
							/>
							<div class="font-medium dark:text-white" >
								<div class="hover:underline hover:text-info-link cursor-pointer" @click="makeOpenSliderForUser(B24.properties.userInfo.id || 0)">{{ [
									B24.properties.userInfo.lastName,
									B24.properties.userInfo.name,
								].join(' ') }}</div>
								<div class="text-sm text-gray-500 dark:text-gray-400">{{
									B24.properties.userInfo.isAdmin ? 'Admin' : 'NotAdmin'
								}} at {{ B24.properties.hostName.replace('https://', '') }}</div>
							</div>
						</div>
					</div>
					<div class="mt-6 px-lg2 py-sm2 border border-base-30 rounded-md shadow-sm hover:shadow-md sm:rounded-md col-auto md:col-span-2 lg:col-span-1 bg-white">
						<h3 class="text-h5 font-semibold">{{ B24.properties.hostName }}</h3>
						<div>
							some message <br>
							{{ $t('alert_title') }} <br>
							{{ $t('error') }}
						</div>
						<ul class="text-xs mt-sm2">
							<li class="mt-2 pl-2 text-base-600" >user: {{ [
								B24.properties.userInfo.lastName,
								B24.properties.userInfo.name,
								B24.properties.userInfo.isAdmin ? 'Admin' : 'NotAdmin',
							].join(' ') }}</li>
							<!-- li><img
								class="rounded-full w-auto h-10"
								v-if="(B24.properties.userInfo?.photo || '').length > 0"
								:src="B24.properties.userInfo?.photo || ''"
							></li -->
							<li class="mt-2 pl-2 text-base-600" >lang: {{ B24.properties.licenseInfo.languageId }}</li>
							<li class="mt-2 pl-2 text-base-600" >license: {{ B24.properties.licenseInfo.license }}</li>
							<li class="mt-2 pl-2 text-base-600" >licensePrevious: {{ B24.properties.licenseInfo.licensePrevious }}</li>
							<li class="mt-2 pl-2 text-base-600" >licenseType: {{ B24.properties.licenseInfo.licenseType }}</li>
							<li class="mt-2 pl-2 text-base-600" >licenseFamily: {{ B24.properties.licenseInfo.licenseFamily }}</li>
							<li class="mt-2 pl-2 text-base-600" >isSelfHosted: {{ B24.properties.licenseInfo.isSelfHosted ? 'Y' : 'N' }}</li>
							<li class="mt-2 pl-2 text-base-600" >isExpired: {{ B24.properties.paymentInfo.isExpired ? 'Y' : 'N' }}</li>
							<li class="mt-2 pl-2 text-base-600" >days: {{ B24.properties.paymentInfo.days }}</li>
							<li class="pl-2 text-base-600" v-show="null !== status.time.stop">stop: {{ formatterDateTime.formatDate(status.time?.stop || new Date, 'H:i:s') }}</li>
							<li class="pl-2 text-base-600" v-show="null !== status.time.diff">diff: {{ formatterNumber.format(status.time?.diff || 0) }} ms</li>
							<li class="mt-2 pl-2 text-base-800 font-bold" v-show="null !== status.resultInfo">{{ status.resultInfo }}</li>
						</ul>
					</div>
					<div class="mt-6 px-lg2 py-sm2 border border-base-30 rounded-md shadow-sm hover:shadow-md sm:rounded-md col-auto md:col-span-2 lg:col-span-1 bg-white">
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
								:value="status.progress?.value || 0"
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
			<div class="absolute bottom-0 flex flex-row items-center justify-between text-blue-500">
				<div>Try change lang</div>
				<div><Forward3Icon class="mt-4 size-6 rotate-90" /></div>
			</div>
		</ClientOnly>
		
	</div>
</template>