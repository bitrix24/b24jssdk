import { MessageManager, MessageCommands } from './message'
import useScrollSize from '../tools/scroll-size'

/**
 * Parent window manager
 *
 * @link https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/
 */
export class ParentManager {
	#messageManager: MessageManager

	constructor(messageManager: MessageManager) {
		this.#messageManager = messageManager
	}

	/**
	 * The method closes the open modal window with the application
	 *
	 * @return {Promise<void>}
	 *
	 * @link https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-close-application.html
	 */
	async closeApplication(): Promise<void> {
		return this.#messageManager.send(MessageCommands.closeApplication, {
			/**
			 * @memo There is no point - everything will be closed, and timeout will not be able to do anything
			 */
			isSafely: false,
		})
	}

	/**
	 * Sets the size of the frame containing the application to the size of the frame's content.
	 *
	 * @return {Promise<void>}
	 *
	 * @link https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-fit-window.html
	 *
	 * @memo in certain situations it may not be executed (placement of the main window after installing the application), in this case isSafely mode will work
	 */
	async fitWindow(): Promise<any> {
		const width = '100%'
		const height = this.getScrollSize().scrollHeight

		return this.#messageManager.send(MessageCommands.resizeWindow, {
			width,
			height,
			isSafely: true,
		})
	}

	/**
	 * Sets the size of the frame containing the application to the size of the frame's content.
	 *
	 * @param {number} width
	 * @param {number} height
	 *
	 * @return {Promise<void>}
	 *
	 * @link https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-resize-window.html
	 *
	 * @memo in certain situations it may not be executed, in this case isSafely mode will be triggered
	 */
	async resizeWindow(width: number, height: number): Promise<void> {
		if (width > 0 && height > 0) {
			return this.#messageManager.send(MessageCommands.resizeWindow, {
				width,
				height,
				isSafely: true,
			})
		}

		return Promise.reject(
			new Error(`Wrong width:number = ${width} or height:number = ${height}`)
		)
	}

	/**
	 * Automatically resize `document.body` of frame with application according to frame content dimensions
	 * If you pass appNode, the height will be calculated relative to it
	 *
	 * @param {HTMLElement|null} appNode
	 * @param {number} minHeight
	 * @param {number} minWidth
	 *
	 * @return {Promise<void>}
	 */
	async resizeWindowAuto(
		appNode: null | HTMLElement = null,
		minHeight: number = 0,
		minWidth: number = 0
	): Promise<void> {
		const body = document.body
		//const html = document.documentElement

		let width = Math.max(
			body.scrollWidth,
			body.offsetWidth

			//html.clientWidth,
			//html.scrollWidth,
			//html.offsetWidth
		)

		if (minWidth > 0) {
			width = Math.max(minWidth, width)
		}

		let height = Math.max(
			body.scrollHeight,
			body.offsetHeight

			//html.clientHeight,
			//html.scrollHeight,
			//html.offsetHeight
		)

		if (appNode) {
			height = Math.max(appNode.scrollHeight, appNode.offsetHeight)
		}

		if (minHeight > 0) {
			height = Math.max(minHeight, height)
		}

		return this.resizeWindow(width, height)
	}

	/**
	 * This function returns the inner dimensions of the application frame
	 *
	 * @return {Promise<{scrollWidth: number; scrollHeight: number}>}
	 *
	 * @link https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-get-scroll-size.html
	 */
	getScrollSize(): {
		scrollWidth: number
		scrollHeight: number
	} {
		return useScrollSize()
	}

	/**
	 * Scrolls the parent window
	 *
	 * @param {number} scroll should specify the vertical scrollbar position (0 - scroll to the very top)
	 * @return {Promise<void>}
	 *
	 * @link https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-scroll-parent-window.html
	 */
	async scrollParentWindow(scroll: number): Promise<void> {
		if (!Number.isInteger(scroll)) {
			return Promise.reject(new Error('Wrong scroll number'))
		}

		if (scroll < 0) {
			scroll = 0
		}

		return this.#messageManager.send(MessageCommands.setScroll, {
			scroll,
			isSafely: true,
		})
	}

	/**
	 * Reload the page with the application (the whole page, not just the frame).
	 *
	 * @return {Promise<void>}
	 *
	 * @link https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-reload-window.html
	 */
	async reloadWindow(): Promise<void> {
		return this.#messageManager.send(MessageCommands.reloadWindow, {
			isSafely: true,
		})
	}

	/**
	 * Set Page Title
	 *
	 * @param {string} title
	 *
	 * @return {Promise<void>}
	 *
	 * @link https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-set-title.html
	 */
	async setTitle(title: string): Promise<void> {
		return this.#messageManager.send(MessageCommands.setTitle, {
			title: title.toString(),
			isSafely: true,
		})
	}

	/**
	 * Initiates a call via internal communication
	 *
	 * @param {number} userId The identifier of the account user
	 * @param {boolean} isVideo true - video call, false - audio call. Optional parameter.
	 *
	 * @return {Promise<void>}
	 *
	 * @link https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-im-call-to.html
	 */
	async imCallTo(userId: number, isVideo: boolean = true): Promise<void> {
		return this.#messageManager.send(MessageCommands.imCallTo, {
			userId,
			video: isVideo,
			isSafely: true,
		})
	}

	/**
	 * Makes a call to the phone number
	 *
	 * @param {string} phone Phone number. The number can be in the format: `+44 20 1234 5678` or `x (xxx) xxx-xx-xx`
	 *
	 * @return {Promise<void>}
	 *
	 * @link https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-im-phone-to.html
	 */
	async imPhoneTo(phone: string): Promise<void> {
		return this.#messageManager.send(MessageCommands.imPhoneTo, {
			phone,
			isSafely: true,
		})
	}

	/**
	 * Opens the messenger window
	 * userId or chatXXX - chat, where XXX is the chat identifier, which can simply be a number.
	 * sgXXX - group chat, where XXX is the social network group number (the chat must be enabled in this group).
	 *
	 * XXXX** - open line, where XXX is the code obtained via the Rest method imopenlines.network.join.
	 *
	 * If nothing is passed, the chat interface will open with the last opened dialog.
	 *
	 * @param {number|`chat${number}`|`sg${number}`|`imol|${number}`|undefined} dialogId
	 *
	 * @return {Promise<void>}
	 *
	 * @link https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-im-open-messenger.html
	 * @link https://dev.1c-bitrix.ru/learning/course/index.php?COURSE_ID=93&LESSON_ID=20152&LESSON_PATH=7657.7883.8025.20150.20152
	 *
	 */
	async imOpenMessenger(
		dialogId:
			| number
			| `chat${number}`
			| `sg${number}`
			| `imol|${number}`
			| undefined
	): Promise<void> {
		return this.#messageManager.send(MessageCommands.imOpenMessenger, {
			dialogId: dialogId,
			isSafely: true,
		})
	}

	/**
	 * Opens the history window
	 * Identifier of the dialog:
	 *
	 * userId or chatXXX - chat, where XXX is the chat identifier, which can simply be a number.
	 * imol|XXXX - open line, where XXX is the session number of the open line.
	 *
	 * @param {number|`chat${number}`|`imol|${number}`} dialogId
	 *
	 * @return {Promise<void>}
	 *
	 * @link https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-im-open-history.html
	 */
	async imOpenHistory(
		dialogId: number | `chat${number}` | `imol|${number}`
	): Promise<void> {
		return this.#messageManager.send(MessageCommands.imOpenHistory, {
			dialogId: dialogId,
			isSafely: true,
		})
	}
}
