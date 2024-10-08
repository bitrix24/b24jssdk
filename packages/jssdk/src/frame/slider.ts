import { AppFrame } from "./frame"
import { MessageManager, MessageCommands } from "./message"
import type { StatusClose } from "../types/slider"

/**
 * Sliders Manager
 */
export class SliderManager
{
	#appFrame: AppFrame;
	#messageManager: MessageManager;
	
	constructor(
		appFrame: AppFrame,
		messageManager: MessageManager
	)
	{
		this.#appFrame = appFrame;
		this.#messageManager = messageManager;
	}
	
	getUrl(path: string = '/'): URL
	{
		return new URL(path, this.#appFrame.getTargetOrigin());
	}
	
	getTargetOrigin(): string
	{
		return this.#appFrame.getTargetOrigin();
	}
	
	/**
	 * When the method is called, a pop-up window with the application frame will be opened.
	 *
	 * @link https://dev.1c-bitrix.ru/rest_help/js_library/additional/openApplication.php
	 */
	async openSliderAppPage(params: any = {}): Promise<any>
	{
		return this.#messageManager.send(
			MessageCommands.openApplication,
			params
		);
	}
	
	/**
	 * Defines the base path for width sampling.
	 *
	 * @param width
	 * @private
	 */
	#getBaseUrlByWidth(width: number = 1640): string
	{
		if(width > 0)
		{
			// region Init baseUrl by Width ////
			if(width > 1200 && width <= 1640)
			{
				return '/crm/type/0/details/0/../../../../..'
			}
			else if(width > 950 && width <= 1200)
			{
				return '/company/personal/user/0/groups/create/../../../../../..'
			}
			else if(width > 900 && width <= 950)
			{
				return '/crm/company/requisite/0/../../../..'
			}
			else if(width <= 900)
			{
				return '/workgroups/group/0/card/../../../..'
			}
			else
			{
				// 1640 /////
				return '/crm/deal/../..';
			}
			// endregion ////
		}
		else
		{
			return '/crm/deal/../..';
		}
	}
	
	/**
	 * Opens the specified path inside the portal in the slider.
	 *
	 * @link https://dev.1c-bitrix.ru/rest_help/js_library/additional/openPath.php
	 * @memo /^\/(crm\/(deal|lead|contact|company|type)|marketplace|company\/personal\/user\/[0-9]+|workgroups\/group\/[0-9]+)\//
	 */
	async openPath(
		url: URL,
		width: number = 1640
	): Promise<StatusClose>
	{
		const openSliderUrl = new URL(url);
		openSliderUrl.searchParams.set('IFRAME', 'Y');
		openSliderUrl.searchParams.set('IFRAME_TYPE', 'SIDE_SLIDER');
		
		/**
		 * We are trying to open the slider
		 */
		return this.#messageManager.send(
			MessageCommands.openPath,
			{
				path: [this.#getBaseUrlByWidth(width), openSliderUrl.pathname, openSliderUrl.search].join('')
			}
		)
		.then((response) => {
			/**
			 * Error handling
			 */
			if(response?.result === 'error')
			{
				/**
				 * If the error is related to using a mobile device, we will open it in a new tab
				 * Let's wait 5 minutes - and return the promise to open and not close
				 */
				if(response?.errorCode === 'METHOD_NOT_SUPPORTED_ON_DEVICE')
				{
					return new Promise((resolve, reject) => {
						const windowObjectReference = window.open(url, '_blank');
						if(!windowObjectReference)
						{
							reject(new Error('Error open window'));
							return;
						}
						
						let iterator = 0;
						// 5 min ////
						let iteratorMax = 1_000 * 60 * 5;
						let waitCloseWindow = window.setInterval(() => {
							iterator = iterator + 1;
							
							if(windowObjectReference.closed)
							{
								clearInterval(waitCloseWindow);
								resolve({
									isOpenAtNewWindow: true,
									isClose: true,
								});
							}
							else if(iterator > iteratorMax)
							{
								clearInterval(waitCloseWindow);
								resolve({
									isOpenAtNewWindow: true,
									isClose: false,
								});
							}
						}, 1_000);
					});
				}
				else
				{
					/**
					 * If the error is different, we will return it.
					 */
					return Promise.reject(new Error(
						response?.errorCode
					))
				}
			}
			/**
			 * Processing a successful close
			 */
			else if(response?.result === 'close')
			{
				return Promise.resolve({
					isOpenAtNewWindow: false,
					isClose: true,
				});
			}
			
			return Promise.resolve({
				isOpenAtNewWindow: false,
				isClose: false,
			});
		});
	}
}