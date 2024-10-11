import { defineNuxtPlugin } from '#app'
import { ref, watchEffect } from 'vue'
import { LoggerBrowser, LoggerType } from '@bitrix24/b24jssdk'

import type {B24FrameQueryParams} from "@bitrix24/b24jssdk/types/auth";
import { B24Frame } from '@bitrix24/b24jssdk/frame'

export type whileB24InitCallback = (b24Frame: B24Frame) => void;

/**
 * Connecting api.bitrix24
 * singleton
 * - need call at app -> $initB24Frame()
 * - others -> $whileB24Init(callBack)
 */
export default defineNuxtPlugin((_nuxtApp) =>
{
	// skip Plugin on server ////
	if(import.meta.server)
	{
		return;
	}
	
	const logger = LoggerBrowser.build('plugin/bootstrap');
	logger.disable(LoggerType.desktop);
	// logger.disable(LoggerType.log); ////
	// logger.disable(LoggerType.info); ////
	// logger.disable(LoggerType.warn); ////
	
	let b24: null|B24Frame = null;
	let isInit = ref<boolean>(false);
	
	const listCallBack: whileB24InitCallback[] = [];
	let unwatch: any = null;
	
	const clearWatchEffect = () => {
		if(unwatch !== null)
		{
			unwatch();
			unwatch = null;
			logger.log('watchEffect >> clear');
		}
	};
	
	/**
	 * @memo it mast not run at server side
	 */
	unwatch = watchEffect(() => {
		
		logger.log('watchEffect >> start');
		
		if(b24 === null)
		{
			return;
		}
		
		if(isInit.value)
		{
			listCallBack.forEach((callBack) => {
				callBack(b24 as B24Frame);
			});
			
			clearWatchEffect();
			return;
		}
	});
	
	return {
		provide: {
			/**
			 * @memo Need call at app
			 */
			initB24Frame: ():Promise<B24Frame> => {
				if(
					isInit.value === true
					&& b24 instanceof B24Frame
				)
				{
					logger.log('return instance');
					return Promise.resolve(b24);
				}
				
				return new Promise((resolve, reject) => {
					//const config = useRuntimeConfig();
					//const route = useRoute();
					//const queryParamsServer = route.query as B24FrameQueryParams;
					
					let queryParams: B24FrameQueryParams = {
						DOMAIN: null,
						PROTOCOL: false,
						APP_SID: null,
						LANG: null
					};
					
					logger.log('init', {
						windowName: window.name || '?'
					});
					
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
					else
					{
						b24 = new B24Frame(
							queryParams
						);
						
						b24.init()
							.then(() => {
								logger.log(`b24Frame:mounted`);
								isInit.value = true;
								resolve(b24 as B24Frame);
								
							})
							.catch((error) => {
								reject(error);
							});
					}
				});
			},
			
			/**
			 * @memo Need to be called on pages, in components ...
			 * @param callBack
			 */
			whileB24Init: (callBack: whileB24InitCallback):void => {
				if(
					isInit.value === true
					&& b24 instanceof B24Frame
				)
				{
					callBack(b24);
					return;
				}
				
				/**
				 * @memo use at watchEffect
				 */
				listCallBack.push(callBack);
			}
		}
	}
})