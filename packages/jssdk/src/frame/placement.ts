import type { MessageManager } from './message'
import type { MessageInitData } from '../types/auth'
import { MessageCommands } from './message'
import { Type } from '../tools/type'

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
   *
   * @link https://apidocs.bitrix24.com/api-reference/widgets/ui-interaction/bx24-placement-call.html
   *
   * @memo The `setValue` command is special: the parent window calls `JSON.parse(value)`
   *       on the received payload, so `value` MUST be a JSON-serialized string
   *       (e.g. `JSON.stringify('test')` or `JSON.stringify({ a: 1 })`).
   *       Prefer {@link PlacementManager.setValue} which serializes for you.
   *
   * @throws {TypeError} when `command === 'setValue'` and `parameters.value` is not a string.
   */
  async call(command: 'setValue', parameters: { value: string }): Promise<any>
  async call(command: string, parameters?: Record<string, any>): Promise<any>
  async call(command: string, parameters: Record<string, any> = {}): Promise<any> {
    if (command === 'setValue' && !Type.isString(parameters?.['value'])) {
      throw new TypeError(
        'placement.call(\'setValue\', { value }) expects `value` to be a JSON-serialized string. '
        + 'Use placement.setValue(value) to serialize automatically, or call JSON.stringify yourself.'
      )
    }

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
   * Set Value for the Current Embedding Location
   *
   * Convenience wrapper around `placement.call('setValue', ...)` that handles
   * JSON serialization. Pass any value (string, number, boolean, object, array)
   * — it will be serialized via `JSON.stringify` before being sent to the
   * parent window, which performs `JSON.parse` on receipt.
   *
   * @param { unknown } value Any JSON-serializable value
   * @return { Promise<any> }
   *
   * @link https://apidocs.bitrix24.com/api-reference/widgets/ui-interaction/bx24-placement-call.html
   *
   * @example
   * await b24.placement.setValue('test')
   * await b24.placement.setValue({ id: 1, title: 'demo' })
   */
  async setValue(value: unknown): Promise<any> {
    return this.#messageManager.send(
      'setValue',
      {
        value: JSON.stringify(value),
        isSafely: true,
        isRawValue: true
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
