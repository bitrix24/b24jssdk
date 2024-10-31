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
		const { $initializeB24Frame } = useNuxtApp()
		const $b24 = await $initializeB24Frame()
		
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