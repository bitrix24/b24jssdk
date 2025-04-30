import { MessageManager, MessageCommands } from './message'
import type { MessageInitData } from '../types/auth'
import Type from '../tools/type'

/**
 * Placement Manager
 *
 * @see https://apidocs.bitrix24.com/api-reference/widgets/ui-interaction/index.html
 * @see https://dev.1c-bitrix.ru/learning/course/index.php?COURSE_ID=99&CHAPTER_ID=02535&LESSON_PATH=8771.5380.2535
 */
export class PlacementManager {
  #messageManager: MessageManager
  #title: string = ''
  #options: object = {}

  constructor(messageManager: MessageManager) {
    this.#messageManager = messageManager
  }

  /**
   * Initializes the data received from the parent window message.
   * @param data
   */
  initData(data: MessageInitData): PlacementManager {
    this.#title = data.PLACEMENT || 'DEFAULT'
    const options = data.PLACEMENT_OPTIONS

    this.#options = Object.freeze(options)

    return this
  }

  get title(): string {
    return this.#title
  }

  get isDefault(): boolean {
    return this.title === 'DEFAULT'
  }

  get options(): any {
    return this.#options
  }

  get isSliderMode(): boolean {
    return this.options?.IFRAME === 'Y'
  }

  /**
   * Get Information About the JS Interface of the Current Embedding Location
   *
   * @return {Promise<any>}
   *
   * @link https://apidocs.bitrix24.com/api-reference/widgets/ui-interaction/bx24-placement-get-interface.html
   */
  async getInterface(): Promise<any> {
    return this.#messageManager.send(
      MessageCommands.getInterface,
      {
        isSafely: true
      }
    )
  }

  /**
   * Set Up the Interface Event Handler
   * @param {string} eventName
   * @param {(...args: any[]) => void} callBack
   * @return {Promise<any>}
   *
   * @link https://apidocs.bitrix24.com/api-reference/widgets/ui-interaction/bx24-placement-bind-event.html
   */
  async bindEvent(
    eventName: string,
    callBack: (...args: any[]) => void
  ): Promise<any> {
    return this.#messageManager.send(
      MessageCommands.placementBindEvent,
      {
        event: eventName,
        callBack,
        isSafely: true
      }
    )
  }

  /**
   * Call the Registered Interface Command
   * @param {string} command
   * @param {Record<string, any>} parameters
   * @return {Promise<any>}
   *
   * @link https://apidocs.bitrix24.com/api-reference/widgets/ui-interaction/bx24-placement-call.html
   */
  async call(command: string, parameters: Record<string, any> = {}): Promise<any> {
    return this.#messageManager.send(
      command,
      {
        ...parameters,
        isSafely: true
      }
    )
  }

  /**
   * Set Up the Interface Event Handler
   * @param {string} command
   * @param {null | string | Record<string, any>} parameters
   * @param {(...args: any[]) => void} callBack
   *
   * @return {Promise<any>}
   */
  async callCustomBind(
    command: string,
    parameters: null | string | Record<string, any> = null,
    callBack: (...args: any[]) => void
  ): Promise<any> {
    let options: Record<string, any> = {}
    if (Type.isString(parameters)) {
      options['singleOption'] = parameters
    } else if (Type.isObjectLike(parameters)) {
      options = { ...(parameters as object) }
    }

    return this.#messageManager.send(
      command,
      {
        ...options,
        callBack,
        isSafely: true
      }
    )
  }
}
