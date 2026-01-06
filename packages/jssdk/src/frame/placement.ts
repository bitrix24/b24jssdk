import type { MessageManager } from './message'
import { MessageCommands } from './message'
import type { MessageInitData } from '../types/auth'
import Type from '../tools/type'

/**
 * Placement Manager
 *
 * @see https://apidocs.bitrix24.com/api-reference/widgets/ui-interaction/index.html
 */
export class PlacementManager {
  #messageManager: MessageManager
  #placement: string = ''
  #options: object = {}

  constructor(messageManager: MessageManager) {
    this.#messageManager = messageManager
  }

  /**
   * Initializes the data received from the parent window message.
   * @param data
   */
  initData(data: MessageInitData): PlacementManager {
    this.#placement = data.PLACEMENT || 'DEFAULT'
    this.#options = Object.freeze(data.PLACEMENT_OPTIONS)

    return this
  }

  /**
   * Symlink on `placement`
   * For backward compatibility
   */
  get title(): string {
    return this.#placement
  }

  get placement(): string {
    return this.#placement
  }

  get isDefault(): boolean {
    return this.placement === 'DEFAULT'
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
   * @param { string } command
   * @param { Record<string, any> } parameters
   * @return { Promise<any> }
   *
   * @link https://apidocs.bitrix24.com/api-reference/widgets/ui-interaction/bx24-placement-call.html
   * @memo For the `setValue` command, use the following parameters { value: string }
   */
  async call(command: string, parameters: Record<string, any> = {}): Promise<any> {
    return this.#messageManager.send(
      command,
      {
        ...parameters,
        isSafely: true,
        isRawValue: ['setValue'].includes(command)
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
