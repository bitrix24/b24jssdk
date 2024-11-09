export * from './logger/browser'

export * from './types/common'
export { default as Type } from './tools/type'
export { default as Text } from './tools/text'
export { default as Browser } from './tools/browser'

export * from './types/http'
export * from './types/b24'
export * from './types/auth'
export * from './types/payloads'
export * from './types/user'
export * from './types/slider'
export * from './types/crm/index'
export * from './types/placement/index'

export * from './types/b24Helper'
export * from './types/pull'

export * from './core/result'
export * from './core/http/ajaxError'
export * from './core/http/ajaxResult'
export * from './core/http/restrictionManager'
export * from './core/http/controller'
export * from './core/abstract-b24'
export * from './core/language/list'

export * from './tools/scrollSize'
export * from './tools/useFormatters'

export * from './hook/index'
export * from './frame/index'
export * from './helper/useB24Helper'
export * from './pullClient/index'

import { B24Frame } from './frame'
import type { B24FrameQueryParams } from './types/auth'

async function initializeB24Frame()
{
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
	
	return b24Frame
}

export { initializeB24Frame }