import { defineNuxtPlugin } from '#app'

import {
	LoggerBrowser,
	B24Frame,
	type B24FrameQueryParams
} from '@bitrix24/b24jssdk'

type whileB24InitCallback = {
	resolve: (b24Frame: B24Frame) => void,
	reject: (error: any) => void
}

/**
 * Connecting api.bitrix24 (singleton)
 * - need call at app -> $initB24Frame()
 * - others -> $whileB24Init(callBack)
 */
export default defineNuxtPlugin((_nuxtApp) =>
{
	/**
	 * @memo skip Plugin on server ////
	 */
	if(import.meta.server)
	{
		return;
	}
	
	const $logger = LoggerBrowser.build(
		'plugin/bootstrap',
		import.meta.env?.DEV === true
	)
	
	let $b24Frame: null|B24Frame = null
	let isInit = false
	let connectError: null|Error = null
	let isMakeFirstCall = false
	
	let listCallBack: whileB24InitCallback[] = []
	let isStartWatch = false
	
	function startWatch()
	{
		const delay = 100
		window.setTimeout(() => {
			if(
				!isInit
				|| $b24Frame === null
			)
			{
				startWatch()
				return
			}
			
			processResult()
			listCallBack = []
		}, delay)
	}
	
	function processResult(): void
	{
		if(
			!isInit
			|| $b24Frame === null
		)
		{
			return
		}
		
		if(null !== connectError)
		{
			listCallBack.forEach((callBack) => {
				callBack.reject(connectError)
			})
		}
		else
		{
			listCallBack.forEach((callBack) => {
				callBack.resolve($b24Frame as B24Frame)
			})
		}
	}
	
	return {
		provide: {
			initializeB24Frame: (): Promise<B24Frame> =>
			{
				if(
					isInit
					&& null !== $b24Frame
				)
				{
					$logger.log('b24Frame >> return instance')
					return Promise.resolve($b24Frame)
				}
				
				if(isMakeFirstCall)
				{
					if(!isStartWatch)
					{
						isStartWatch = true
						startWatch()
					}
					
					return new Promise((resolve, reject) =>
					{
						listCallBack.push({
							resolve: resolve,
							reject: reject,
						})
					})
				}
				
				isMakeFirstCall = true
				
				return new Promise((resolve, reject) =>
				{
					const queryParams: B24FrameQueryParams = {
						DOMAIN: null,
						PROTOCOL: false,
						APP_SID: null,
						LANG: null
					}
					
					if(!!window.name)
					{
						const [domain, protocol, appSid] = window.name.split('|')
						queryParams.DOMAIN = domain
						queryParams.PROTOCOL = parseInt(protocol) === 1
						queryParams.APP_SID = appSid
						queryParams.LANG = null
					}
					
					if(!queryParams.DOMAIN || !queryParams.APP_SID)
					{
						connectError = new Error('Unable to initialize Bitrix24Frame library!')
						reject(connectError)
					}
					
					$b24Frame = new B24Frame(queryParams)
					
					$b24Frame.init()
					.then(() =>
					{
						$logger.log(`b24Frame:mounted`)
						isInit = true
						
						resolve($b24Frame as B24Frame)
					})
					.catch((error) => {
						connectError = error
						reject(connectError)
					})
				})
			},
		}
	}
})

