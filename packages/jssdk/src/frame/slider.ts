import { AppFrame } from './frame'
import { MessageManager, MessageCommands } from './message'
import type { StatusClose } from '../types/slider'

/**
 * Sliders Manager
 */
export class SliderManager {
	#appFrame: AppFrame
	#messageManager: MessageManager

	constructor(appFrame: AppFrame, messageManager: MessageManager) {
		this.#appFrame = appFrame
		this.#messageManager = messageManager
	}

	/**
	 * Returns the URL relative to the domain name and path
	 */
	getUrl(path: string = '/'): URL {
		return new URL(path, this.#appFrame.getTargetOrigin())
	}

	/**
	 * Get the account address BX24
	 */
	getTargetOrigin(): string {
		return this.#appFrame.getTargetOrigin()
	}

	/**
	 * When the method is called, a pop-up window with the application frame will be opened.
	 *
	 * @link https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-open-application.html
	 */
	async openSliderAppPage(params: any = {}): Promise<any> {
		return this.#messageManager.send(MessageCommands.openApplication, params)
	}

	/**
	 * The method closes the open modal window with the application
	 *
	 * @return {Promise<void>}
	 *
	 * @link https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-close-application.html
	 */
	async closeSliderAppPage(): Promise<void> {
		return this.#messageManager.send(MessageCommands.closeApplication, {
			/**
			 * @memo There is no point - everything will be closed, and timeout will not be able to do anything
			 */
			isSafely: false,
		})
	}

	/**
	 * Defines the base path for width sampling.
	 *
	 * @param width
	 * @private
	 */
	#getBaseUrlByWidth(width: number = 1640): string {
		if (width > 0) {
			// region Init baseUrl by Width ////
			if (width > 1200 && width <= 1640) {
				return '/crm/type/0/details/0/../../../../..'
			} else if (width > 950 && width <= 1200) {
				return '/company/personal/user/0/groups/create/../../../../../..'
			} else if (width > 900 && width <= 950) {
				return '/crm/company/requisite/0/../../../..'
			} else if (width <= 900) {
				return '/workgroups/group/0/card/../../../..'
			} else {
				// 1640 /////
				return '/crm/deal/../..'
			}
			// endregion ////
		} else {
			return '/crm/deal/../..'
		}
	}

	/**
	 * Opens the specified path inside the portal in the slider.
	 * @param {URL} url
	 * @param {number} width - Number in the range from 1640 to 1200, from 1200 to 950, from 950 to 900, from 900 ...
	 * @return {Promise<StatusClose>}
	 *
	 * @link https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-open-path.html
	 * @memo /^\/(crm\/(deal|lead|contact|company|type)|marketplace|company\/personal\/user\/[0-9]+|workgroups\/group\/[0-9]+)\//
	 */
	async openPath(url: URL, width: number = 1640): Promise<StatusClose> {
		const openSliderUrl = new URL(url)
		openSliderUrl.searchParams.set('IFRAME', 'Y')
		openSliderUrl.searchParams.set('IFRAME_TYPE', 'SIDE_SLIDER')

		/**
		 * We are trying to open the slider
		 */
		return this.#messageManager
			.send(MessageCommands.openPath, {
				path: [
					this.#getBaseUrlByWidth(width),
					openSliderUrl.pathname,
					openSliderUrl.search,
				].join(''),
			})
			.then((response) => {
				/**
				 * Error handling
				 */
				if (response?.result === 'error') {
					/**
					 * If the error is related to using a mobile device, we will open it in a new tab
					 * Let's wait 5 minutes - and return the promise to open and not close
					 */
					if (response?.errorCode === 'METHOD_NOT_SUPPORTED_ON_DEVICE') {
						return new Promise((resolve, reject) => {
							const windowObjectReference = window.open(url, '_blank')
							if (!windowObjectReference) {
								reject(new Error('Error open window'))
								return
							}

							let iterator = 0
							// 5 min ////
							const iteratorMax = 1_000 * 60 * 5
							const waitCloseWindow = window.setInterval(() => {
								iterator = iterator + 1

								if (windowObjectReference.closed) {
									clearInterval(waitCloseWindow)
									resolve({
										isOpenAtNewWindow: true,
										isClose: true,
									})
								} else if (iterator > iteratorMax) {
									clearInterval(waitCloseWindow)
									resolve({
										isOpenAtNewWindow: true,
										isClose: false,
									})
								}
							}, 1_000)
						})
					} else {
						/**
						 * If the error is different, we will return it.
						 */
						return Promise.reject(new Error(response?.errorCode))
					}
				} else if (response?.result === 'close') {
					/**
					 * Processing a successful close
					 */
					return Promise.resolve({
						isOpenAtNewWindow: false,
						isClose: true,
					})
				}

				return Promise.resolve({
					isOpenAtNewWindow: false,
					isClose: false,
				})
			})
	}

	/**
	 * @deprecated
	 * @param params
	 */
	async showAppForm(params: any): Promise<void> {
		console.warn(`@deprecated showAppForm`)
		return this.#messageManager.send(MessageCommands.showAppForm, {
			params: params,
			isSafely: true,
		})
	}
}
