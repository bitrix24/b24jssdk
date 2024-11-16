import { B24Frame } from './frame'
import type { B24FrameQueryParams } from './types/auth'

type whileB24InitCallback = {
	resolve: (b24Frame: B24Frame) => void
	reject: (error: any) => void
}

const delay = 50

let $b24Frame: null | B24Frame = null
let isInit = false
let connectError: null | Error = null
let isMakeFirstCall = false

let listCallBack: whileB24InitCallback[] = []
let isStartWatch = false

// region Watch ////
function startWatch() {
	window.setTimeout(() => {
		if (!isInit || $b24Frame === null) {
			startWatch()
			return
		}

		processResult()
		listCallBack = []
	}, delay)
}

function processResult(): void {
	if (null !== connectError) {
		for (const callBack of listCallBack) {
			callBack.reject(connectError)
		}
	}

	if (!isInit || $b24Frame === null) {
		return
	}

	for (const callBack of listCallBack) {
		callBack.resolve($b24Frame as B24Frame)
	}
}
// endregion ////

export async function initializeB24Frame(): Promise<B24Frame> {
	// region isInit ////
	if (isInit && null !== $b24Frame) {
		return Promise.resolve($b24Frame)
	}
	// endregion ////

	// region Not First Call ///
	if (isMakeFirstCall) {
		// region startWatch ///
		if (!isStartWatch) {
			isStartWatch = true
			startWatch()
		}
		// endregion ////

		return new Promise((resolve, reject) => {
			listCallBack.push({
				resolve: resolve,
				reject: reject,
			})
		})
	}
	// endregion ////

	// region First Call ///
	isMakeFirstCall = true

	return new Promise((resolve, reject) => {
		const queryParams: B24FrameQueryParams = {
			DOMAIN: null,
			PROTOCOL: false,
			APP_SID: null,
			LANG: null,
		}

		if (window.name) {
			const [domain, protocol, appSid] = window.name.split('|')
			queryParams.DOMAIN = domain
			queryParams.PROTOCOL = Number.parseInt(protocol) === 1
			queryParams.APP_SID = appSid
			queryParams.LANG = null
		}

		if (!queryParams.DOMAIN || !queryParams.APP_SID) {
			connectError = new Error('Unable to initialize Bitrix24Frame library!')
			reject(connectError)
		}

		$b24Frame = new B24Frame(queryParams)

		$b24Frame
			.init()
			.then(() => {
				isInit = true
				resolve($b24Frame as B24Frame)
			})
			.catch((error) => {
				connectError = error
				reject(connectError)
			})
	})
	// endregion ////
}
