import {
	LoggerBrowser,
	B24Frame,
	type B24FrameQueryParams
} from "@bitrix24/b24jssdk"
import { type RouteLocationNormalized } from 'vue-router'

const $logger = LoggerBrowser.build(
	'middleware:app.page.or.slider.global',
	import.meta.env?.DEV === true
)

const baseDir = '/frame/'

function isSkipB24(fullPath: string): boolean
{
	if(
		!fullPath.includes(`${baseDir}`)
		|| fullPath.includes(`${baseDir}eula`)
	)
	{
		return true
	}
	
	return false
}

async function initializeB24Frame(): Promise<B24Frame> {
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

export default defineNuxtRouteMiddleware(async (
	to: RouteLocationNormalized,
	from: RouteLocationNormalized
) => {
	
	/**
	 * @memo skip middleware on server
	 */
	if(import.meta.server)
	{
		return
	}
	
	$logger.log('>> start')
	$logger.info({
		to: to.path,
		from: from.path
	})
	
	if(isSkipB24(to.path))
	{
		$logger.log('middleware >> Skip')
		return Promise.resolve()
	}
	
	try
	{
		const $b24 = await initializeB24Frame()
		
		$logger.log('>> placement.options', $b24.placement.options)
		
		if($b24.placement.options?.place)
		{
			const optionsPlace: string = $b24.placement.options.place
			let goTo: null|string = null
			
			if(optionsPlace === 'app.options')
			{
				goTo = `${baseDir}app.options`
			}
			else if(optionsPlace === 'user.options')
			{
				goTo = `${baseDir}user.options`
			}
			else if(optionsPlace === 'feedback')
			{
				goTo = `${baseDir}feedback`
			}
			
			if(
				null !== goTo
				&& to.path !== goTo
			)
			{
				$logger.log(`middleware >> ${goTo}`);
				return navigateTo(goTo)
			}
		}
		
		$logger.log('>> stop')
	}
	catch(error: any)
	{
		const appError = createError({
			statusCode: 404,
			statusMessage: error?.message || error,
			data: {
				description: 'Problem in middleware',
				homePageIsHide: false
			},
			cause: error,
			fatal: true
		})
		
		$logger.error('', appError)
		
		showError(appError)
		return Promise.reject(appError)
	}
});