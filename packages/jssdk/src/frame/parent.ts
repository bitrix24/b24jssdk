import { MessageManager, MessageCommands } from "./message";
import useScrollSize from "../tools/scrollSize";


/**
 * Parent window manager
 *
 * @link https://dev.1c-bitrix.ru/rest_help/js_library/additional/index.php
 */
export class ParentManager
{
	#messageManager: MessageManager;
	
	constructor(
		messageManager: MessageManager
	)
	{
		this.#messageManager = messageManager;
	}
	
	/**
	 * The method closes the open modal window with the application
	 *
	 * @link https://dev.1c-bitrix.ru/rest_help/js_library/additional/closeapplication.php
	 */
	async closeApplication(): Promise<any>
	{
		return this.#messageManager.send(
			MessageCommands.closeApplication,
			{
				/**
				 * @memo Нет cмысла - будет закрыто все и таймаут не сможет ничего сделать
				 */
				isSafely: false
			}
		);
	}
	
	/**
	 * Sets the size of the frame containing the application to the size of the frame's content.
	 * @link https://dev.1c-bitrix.ru/rest_help/js_library/additional/fitWindow.php
	 *
	 * @memo in certain situations it may not be executed (placement of the main window after installing the application), in this case isSafely mode will work
	 */
	fitWindow(): Promise<any>
	{
		let width = '100%';
		let height = useScrollSize().scrollHeight;
		
		return this.#messageManager.send(
			MessageCommands.resizeWindow,
			{
				width,
				height,
				isSafely: true
			}
		);
	}
	
	/**
	 * Sets the size of the frame containing the application to the size of the frame's content.
	 * @link https://dev.1c-bitrix.ru/rest_help/js_library/additional/resizeWindow.php
	 *
	 * @memo in certain situations it may not be executed, in this case isSafely mode will be triggered
	 */
	resizeWindow(
		width: number,
		height: number
	): Promise<any>
	{
		if(width > 0 && height > 0)
		{
			return this.#messageManager.send(
				MessageCommands.resizeWindow,
				{
					width,
					height,
					isSafely: true
				}
			);
		}
		
		return Promise.reject(new Error(
			`Wrong width:number = ${width} or height:number = ${height}`
		));
	}
	
	/**
	 * Automatically resize document.body of frame with application according to frame content dimensions
	 * If you pass appNode, the height will be calculated relative to it
	 *
	 * @param {HTMLElement|null} appNode
	 * @param {Number|null} minHeight
	 * @param {Number|null} minWidth
	 * @return {Promise<any>}
	 */
	async resizeWindowAuto(
		appNode: null|HTMLElement = null,
		minHeight: number = 0,
		minWidth: number = 0
	): Promise<any>
	{
		const body = document.body;
		//const html = document.documentElement;
		
		let width = Math.max(
			body.scrollWidth,
			body.offsetWidth,
			
			//html.clientWidth,
			//html.scrollWidth,
			//html.offsetWidth
		);
		
		if(minWidth > 0)
		{
			width = Math.max(minWidth, width);
		}
		
		let height = Math.max(
			body.scrollHeight,
			body.offsetHeight,
			
			//html.clientHeight,
			//html.scrollHeight,
			//html.offsetHeight
		);
		
		if(!!appNode)
		{
			height = Math.max(
				appNode.scrollHeight,
				appNode.offsetHeight,
			);
		}
		
		if(minHeight > 0)
		{
			height = Math.max(minHeight, height);
		}
		
		/**
		 * @memo something is wrong with the build - I loaded delta - the scroll jumped constantly
		 */
		height = height + 4;
		// console.log({ width, height }); ////
		
		return this.resizeWindow(
			width,
			height,
		);
	}
	
	/**
	 * Set page title.
	 * @param title
	 *
	 * @link https://dev.1c-bitrix.ru/rest_help/js_library/additional/setTitle.php
	 */
	async setTitle(
		title: string
	): Promise<any>
	{
		return this.#messageManager.send(
			MessageCommands.setTitle,
			{
				title: title.toString()
			}
		);
	}
	
	/**
	 * Reload the page with the application (the whole page, not just the frame).
	 *
	 * @link https://dev.1c-bitrix.ru/rest_help/js_library/additional/reloadWindow.php
	 */
	async reloadWindow(): Promise<any>
	{
		return this.#messageManager.send(
			MessageCommands.reloadWindow,
			{}
		);
	}
}