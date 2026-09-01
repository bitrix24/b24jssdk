import type { AppFrame } from './frame'
import type { MessageManager } from './message'
import { MessageCommands } from './message'
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
   * Settings are passed via `bx24_`-prefixed keys (e.g. `bx24_title`, `bx24_width`).
   * `bx24_title` sets the slider title; the portal also reflects it to the browser tab title
   * (`document.title`) — unlike `ParentManager.setTitle`, which only updates the in-layout `#pagetitle`.
   *
   * @link https://apidocs.bitrix24.com/sdk/bx24-js-sdk/additional-functions/bx24-open-application.html
   */
  async openSliderAppPage(params: any = {}): Promise<any> {
    return this.#messageManager.send(MessageCommands.openApplication, params)
  }

  /**
   * Asks the portal to close the modal window holding the application.
   *
   * **This is a request, not a completion signal.** The SDK posts the command
   * and its part ends there; animating the slider shut, releasing the focus
   * trap and removing the frame are the portal's, and the application can
   * neither observe nor influence them.
   *
   * Sent with `isSafely: false`, so nothing settles the promise except the
   * portal's own answer — and there are portal builds where that answer never
   * arrives, because an exception raised while closing fires before the
   * response `postMessage` (#328). `await`ing this call can therefore wait
   * forever. Callers should treat it as fire-and-forget, put their cleanup
   * before it, and attach `.catch(() => {})` if they also tear the frame down
   * in the same breath — `destroy()` rejects in-flight commands with
   * `JSSDK_FRAME_DISPOSED`.
   *
   * The original reasoning for `isSafely: false` was that everything is about
   * to be closed anyway, so a timer could not help. #328 is the case that
   * reasoning does not cover: when the portal throws, the frame is *not*
   * destroyed, and the promise is simply stranded. Whether to switch to
   * `isSafely: true` is open — it would settle the promise on the SDK's own
   * timer without pretending the close succeeded.
   *
   * @return {Promise<void>}
   *
   * @link https://apidocs.bitrix24.com/sdk/bx24-js-sdk/additional-functions/bx24-close-application.html
   */
  async closeSliderAppPage(): Promise<void> {
    return this.#messageManager.send(MessageCommands.closeApplication, {
      // `false` deliberately, and see the note above: the promise then settles
      // only on the portal's answer, which #328 shows is not guaranteed.
      isSafely: false
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
   * @link https://apidocs.bitrix24.com/sdk/bx24-js-sdk/additional-functions/bx24-open-path.html
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
          openSliderUrl.search
        ].join('')
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
                    isClose: true
                  })
                } else if (iterator > iteratorMax) {
                  clearInterval(waitCloseWindow)
                  resolve({
                    isOpenAtNewWindow: true,
                    isClose: false
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
            isClose: true
          })
        }

        return Promise.resolve({
          isOpenAtNewWindow: false,
          isClose: false
        })
      })
  }

  /**
   * @todo test this and remove
   */
  // async showAppForm(params: any): Promise<void> {
  //   console.warn(`deprecated showAppForm`)
  //   return this.#messageManager.send(MessageCommands.showAppForm, {
  //     params: params,
  //     isSafely: true
  //   })
  // }
}
