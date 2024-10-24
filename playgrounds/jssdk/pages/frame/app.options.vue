<script setup lang="ts">
import { ref, type Ref, onMounted, onUnmounted } from 'vue'
import { computedAsync } from '@vueuse/core'
import {
	LoggerBrowser,
	Result,
	B24LangList,
	B24Frame,
	B24HelperManager,
	LoadDataType,
	type AjaxError
} from '@bitrix24/b24jssdk'
import type {
	IResult,
	B24FrameQueryParams,
} from '@bitrix24/b24jssdk'

import SpinnerIcon from '@bitrix24/b24icons-vue/specialized/SpinnerIcon'
import LetCatInIcon from '@bitrix24/b24icons-vue/specialized/LetCatInIcon'

import { useI18n } from '#imports'

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

const is404: Ref<boolean> = ref(false)
const isInit: Ref<boolean> = ref(false)
const isReload: Ref<boolean> = ref(false)
const appDataRevision: Ref<number> = ref(0)
let result: IResult = reactive(new Result())
const { t, locales, setLocale } = useI18n()
const b24CurrentLang: Ref<string> = ref(B24LangList.en)

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
		isReload.value = false
		
		window.setTimeout(async () => {
			await makeRestore()
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
	if(isInit.value)
	{
		$b24.destroy()
		$b24Helper?.destroy()
	}
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
		is404.value = true
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
		
		if(isReload.value)
		{
			isReload.value = false
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
	
	$logger.info(b24Helper.value)
	
	await makeFitWindow()
	
	return Promise.resolve()
}

const makeClosePage = async (): Promise<void> => {
	return $b24.parent.closeApplication()
}

const makeSave = async (): Promise<void> => {
	try
	{
		await makeSendPullCommand(
			'reloadOptions',
			{
				type: 'appOptions'
			}
		)
		
		await makeClosePage()
	}
	catch(error: any) {
		
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
				v-if="!isInit || isReload || !b24Helper"
				class="absolute top-0 bottom-0 left-0 right-0 flex flex-col justify-center items-center"
			>
				<div class="absolute z-10 text-info">
					<SpinnerIcon class="animate-spin stroke-2 size-44" />
				</div>
			</div>
			<div v-else>
				<h1 class="text-h1">@todo</h1>
				<div
					class="text-red-500"
					v-if="result.isSuccess"
				>
					@todo
					
					<button
						@click="makeSave"
						class="mt-4 text-md font-semibold text-white bg-blue px-4 py-2 rounded hover:bg-blue-400 active:bg-blue-600"
					>Save</button>
				</div>
				
				<div
					class="mt-4 text-alert-text px-lg2 py-sm2 border border-base-30 rounded-md shadow-sm hover:shadow-md sm:rounded-md col-auto md:col-span-2 lg:col-span-1 bg-white"
					v-else
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