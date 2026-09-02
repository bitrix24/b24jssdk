import type { MessageManager } from './message'
import { MessageCommands } from './message'
import useScrollSize from '../tools/scroll-size'

/**
 * Parent window manager
 *
 * @link https://apidocs.bitrix24.com/sdk/bx24-js-sdk/additional-functions/
 */
export class ParentManager {
  #messageManager: MessageManager

  constructor(messageManager: MessageManager) {
    this.#messageManager = messageManager
  }

  get message(): MessageManager {
    return this.#messageManager
  }

  /**
   * Asks the portal to close the modal window holding the application.
   *
   * Sent with `isSafely: false`, so only the portal's answer settles the
   * promise — and on some builds that answer never arrives (#328). Do the
   * cleanup first, then close without awaiting; `.catch()` because
   * `destroy()` rejects commands still in flight.
   *
   * @example
   * await $b24.options.appSet('draft', 'value')
   *
   * $b24.parent.closeApplication().catch(() => {})
   *
   * @return {Promise<void>}
   *
   * @link https://apidocs.bitrix24.com/sdk/bx24-js-sdk/additional-functions/bx24-close-application.html
   */
  async closeApplication(): Promise<void> {
    return this.#messageManager.send(MessageCommands.closeApplication, {
      // `false` deliberately: the frame is going away, so a timer has nothing
      // useful left to do. See the note above for what that costs (#328).
      isSafely: false
    })
  }

  /**
   * Sets the size of the frame containing the application to the size of the frame's content.
   *
   * @return {Promise<void>}
   *
   * @link https://apidocs.bitrix24.com/sdk/bx24-js-sdk/additional-functions/bx24-fit-window.html
   *
   * @memo in certain situations it may not be executed (placement of the main window after installing the application), in this case isSafely mode will work
   */
  async fitWindow(): Promise<any> {
    const width = '100%'
    const height = this.getScrollSize().scrollHeight

    return this.#messageManager.send(MessageCommands.resizeWindow, {
      width,
      height,
      isSafely: true
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
   * @link https://apidocs.bitrix24.com/sdk/bx24-js-sdk/additional-functions/bx24-resize-window.html
   *
   * @memo in certain situations it may not be executed, in this case isSafely mode will be triggered
   */
  async resizeWindow(width: number, height: number): Promise<void> {
    if (width > 0 && height > 0) {
      return this.#messageManager.send(MessageCommands.resizeWindow, {
        width,
        height,
        isSafely: true
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
    // const html = document.documentElement

    let width = Math.max(
      body.scrollWidth,
      body.offsetWidth

      // html.clientWidth,
      // html.scrollWidth,
      // html.offsetWidth
    )

    if (minWidth > 0) {
      width = Math.max(minWidth, width)
    }

    let height = Math.max(
      body.scrollHeight,
      body.offsetHeight

      // html.clientHeight,
      // html.scrollHeight,
      // html.offsetHeight
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
   * @link https://apidocs.bitrix24.com/sdk/bx24-js-sdk/additional-functions/bx24-get-scroll-size.html
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
   * @link https://apidocs.bitrix24.com/sdk/bx24-js-sdk/additional-functions/bx24-scroll-parent-window.html
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
      isSafely: true
    })
  }

  /**
   * Reload the page with the application (the whole page, not just the frame).
   *
   * @return {Promise<void>}
   *
   * @link https://apidocs.bitrix24.com/sdk/bx24-js-sdk/additional-functions/bx24-reload-window.html
   */
  async reloadWindow(): Promise<void> {
    return this.#messageManager.send(MessageCommands.reloadWindow, {
      isSafely: true
    })
  }

  /**
   * Sets the in-layout page title (the `#pagetitle` element the portal renders around the app).
   *
   * Does NOT change the browser tab title (`document.title`): the portal applies this command to
   * `#pagetitle`, never to the tab. To set the browser tab title, open the view as a slider via
   * `SliderManager.openSliderAppPage` with a `bx24_title` option.
   *
   * @param {string} title
   *
   * @return {Promise<void>}
   *
   * @link https://apidocs.bitrix24.com/sdk/bx24-js-sdk/additional-functions/bx24-set-title.html
   */
  async setTitle(title: string): Promise<void> {
    return this.#messageManager.send(MessageCommands.setTitle, {
      title: title.toString(),
      isSafely: true
    })
  }

  /**
   * Initiates a call via internal communication.
   *
   * **Fire-and-forget.** The portal's bridge handler is declared as
   * `function(params)` — it does not accept the callback argument the message
   * layer offers, so it never reports back. The returned promise means "the
   * command was posted", not "the call started"; it resolves on the SDK's own
   * `isSafely` timer, and the accompanying `stop by timeout` log line is the
   * normal outcome rather than a fault. See {@link ParentManager} — the same
   * holds for every `im*` method here. (#331)
   *
   * The portal reaches the current API underneath: `BXIM.callTo` →
   * `Messenger.Public.startVideoCall`. The deprecation warning in the portal
   * console is emitted by the portal's own compatibility layer, not by this
   * call, and an application cannot avoid it — the newer names are not part of
   * the placement's command vocabulary.
   *
   * @param {number} userId The identifier of the account user
   * @param {boolean} isVideo true - video call, false - audio call. Optional parameter.
   *
   * @return {Promise<void>} resolves once the command has been posted.
   *
   * @link https://apidocs.bitrix24.com/sdk/bx24-js-sdk/additional-functions/bx24-im-call-to.html
   */
  async imCallTo(userId: number, isVideo: boolean = true): Promise<void> {
    return this.#messageManager.send(MessageCommands.imCallTo, {
      userId,
      video: isVideo,
      isSafely: true
    })
  }

  /**
   * Makes a call to the phone number.
   *
   * **Fire-and-forget** — see {@link imCallTo} for what the returned promise
   * does and does not mean.
   *
   * `params` is forwarded for the phone manager, matching the second argument of
   * the portal's `Messenger.startPhoneCall(number, params)`. The portal's bridge
   * handler currently enumerates fields by hand and reads only `phone`, so this
   * is dropped on the way today; sending it costs nothing (an unknown field is
   * ignored) and starts working without an application change once the portal
   * forwards it. (#331)
   *
   * @param {string} phone Phone number. The number can be in the format: `+44 20 1234 5678` or `x (xxx) xxx-xx-xx`
   * @param {Record<string, unknown>} [params] Extra call parameters for the phone manager.
   *
   * @return {Promise<void>} resolves once the command has been posted.
   *
   * @link https://apidocs.bitrix24.com/sdk/bx24-js-sdk/additional-functions/bx24-im-phone-to.html
   */
  async imPhoneTo(phone: string, params?: Record<string, unknown>): Promise<void> {
    return this.#messageManager.send(MessageCommands.imPhoneTo, {
      phone,
      ...(params === undefined ? {} : { params }),
      isSafely: true
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
   * **Fire-and-forget** — see {@link imCallTo} for what the returned promise
   * does and does not mean.
   *
   * `messageId` matches the second argument of the portal's
   * `Messenger.openChat(dialogId, messageId)`, which focuses a specific message.
   * The portal's bridge handler reads only `dialogId` today, so it is dropped on
   * the way; sending it is free and starts working without an application change
   * once the portal forwards it. (#331)
   *
   * @param {number|`chat${number}`|`sg${number}`|`imol|${number}`|undefined} dialogId
   * @param {number} [messageId] Message to focus once the chat opens.
   *
   * @return {Promise<void>} resolves once the command has been posted.
   *
   * @link https://apidocs.bitrix24.com/sdk/bx24-js-sdk/additional-functions/bx24-im-open-messenger.html
   * @link https://dev.1c-bitrix.ru/learning/course/index.php?COURSE_ID=93&LESSON_ID=20152&LESSON_PATH=7657.7883.8025.20150.20152
   *
   */
  async imOpenMessenger(
    dialogId:
      | number
      | `chat${number}`
      | `sg${number}`
      | `imol|${number}`
      | undefined,
    messageId?: number
  ): Promise<void> {
    return this.#messageManager.send(MessageCommands.imOpenMessenger, {
      dialogId: dialogId,
      ...(messageId === undefined ? {} : { messageId }),
      isSafely: true
    })
  }

  /**
   * Opens the history window
   * Identifier of the dialog:
   *
   * userId or chatXXX - chat, where XXX is the chat identifier, which can simply be a number.
   * imol|XXXX - open line, where XXX is the session number of the open line.
   *
   * **Fire-and-forget** — see {@link imCallTo} for what the returned promise
   * does and does not mean.
   *
   * Note the portal routes this differently from the other three: its
   * compatibility layer calls the opener directly, bypassing
   * `Messenger.Public`. For an ordinary `dialogId` it lands in `openChat`, which
   * is what the deprecation notice recommends; for an open-line id
   * (`imol|…`) it takes a separate branch whose public equivalent is
   * `openLinesHistory`, not `openChat`. (#331)
   *
   * @param {number|`chat${number}`|`imol|${number}`} dialogId
   *
   * @return {Promise<void>} resolves once the command has been posted.
   *
   * @link https://apidocs.bitrix24.com/sdk/bx24-js-sdk/additional-functions/bx24-im-open-history.html
   */
  async imOpenHistory(
    dialogId: number | `chat${number}` | `imol|${number}`
  ): Promise<void> {
    return this.#messageManager.send(MessageCommands.imOpenHistory, {
      dialogId: dialogId,
      isSafely: true
    })
  }
}
