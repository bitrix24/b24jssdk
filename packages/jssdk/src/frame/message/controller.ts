import type { MessageCommands } from './commands'
import type { AppFrame } from '../frame'
import type { LoggerInterface } from '../../logger'
import { LoggerFactory } from '../../logger'
import { Type } from '../../tools/type'
import { Text } from '../../tools/text'
import { omit } from '../../tools'

interface PromiseHandlers {
  resolve: (value: any) => void
  reject: (reason?: any) => void
  timeoutId: any
}

/**
 * Parent Window Request Parameters
 * - `isRawValue?: boolean` if true then JSON.stringify will not be executed
 * - `isSafely?: boolean` auto completion mode Promise.resolve()
 * - `safelyTime?: number` after what time (900 ms) should it be automatically resolved Promise
 * - `callBack?: () => void` for placement event
 * - `requestId?: string` Unique request identifier for tracking. Used for query deduplication and debugging.
 */
export interface SendParams {
  isRawValue?: boolean
  isSafely?: boolean
  safelyTime?: number
  callBack?: (...args: any[]) => void
  requestId?: string
  // @todo add this
  // singleOption: any
  [index: string]: any
}

/**
 * Parent Window Communication Manager at B24
 */
export class MessageManager {
  #appFrame: AppFrame
  #callbackPromises: Map<string, PromiseHandlers>
  #callbackSingletone: Map<string, (...args: any[]) => void>

  protected _logger: LoggerInterface

  private readonly runCallbackHandler: OmitThisParameter<(event: MessageEvent) => void>

  constructor(appFrame: AppFrame) {
    this._logger = LoggerFactory.createNullLogger()
    this.#appFrame = appFrame

    this.#callbackPromises = new Map()
    this.#callbackSingletone = new Map()

    this.runCallbackHandler = this._runCallback.bind(this)
  }

  setLogger(logger: LoggerInterface): void {
    this._logger = logger
  }

  getLogger(): LoggerInterface {
    return this._logger
  }

  // region Events ////
  /**
   * Subscribe to the onMessage event of the parent window
   */
  subscribe() {
    window.addEventListener('message', this.runCallbackHandler)
  }

  /**
   * Unsubscribe from the onMessage event of the parent window
   */
  unsubscribe(): void {
    window.removeEventListener('message', this.runCallbackHandler)
  }

  // endregion ////

  /**
   * Send message to parent window
   * The answer (if) we will get in _runCallback
   *
   * @param command
   * @param params
   */
  async send(
    command: string | MessageCommands,
    params: null | SendParams = null
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      let cmd: string | object
      const promiseHandler: PromiseHandlers = {
        resolve,
        reject,
        timeoutId: null
      }

      const keyPromise = this.#setCallbackPromise(promiseHandler)
      let paramsSend: null | string | Record<string, any> = null

      const optionsSend = omit(params || {}, ['singleOption', 'callBack', 'isSafely', 'safelyTime', 'requestId'])
      const { callBack, singleOption, requestId } = params || {}
      if (callBack) {
        this.#callbackSingletone.set(keyPromise, callBack)
      }

      if (singleOption) {
        paramsSend = singleOption
      } else if (Object.keys(optionsSend).length > 0) {
        paramsSend = { ...optionsSend }
      }

      if (command.toString().includes(':')) {
        cmd = {
          method: command.toString(),
          params: paramsSend || '',
          callback: keyPromise,
          appSid: this.#appFrame.getAppSid(),
          requestId
        }
      } else {
        cmd = command.toString()

        if (
          params?.isRawValue !== true
          && paramsSend
        ) {
          paramsSend = JSON.stringify(paramsSend)
        } else if (
          params?.isRawValue === true
          && paramsSend
          && Type.isPlainObject(paramsSend)
          && paramsSend['value']
        ) {
          paramsSend = paramsSend['value']
        }

        const listParams = [
          paramsSend || '',
          keyPromise,
          this.#appFrame.getAppSid()
        ]

        cmd += ':' + listParams.filter(Boolean).join(':')
      }

      this.getLogger().debug(`send to ${this.#appFrame.getTargetOrigin()}`, {
        cmd,
        origin: this.#appFrame.getTargetOrigin()
      })

      parent.postMessage(cmd, this.#appFrame.getTargetOrigin())

      if (params?.isSafely) {
        const safelyTime = Number.parseInt(String(params?.safelyTime || 900))
        this.#callbackPromises.get(keyPromise)!.timeoutId = window.setTimeout(
          () => {
            if (this.#callbackPromises.has(keyPromise)) {
              this.getLogger().warning(`action ${command.toString()} stop by timeout`, {
                command: command.toString(),
                safelyTime
              })

              this.#callbackPromises.delete(keyPromise)
              resolve({ isSafely: true })
            }
          },
          safelyTime
        )
      }
    })
  }

  /**
   * Fulfilling a promise based on messages from the parent window
   *
   * @param event
   * @private
   */
  public _runCallback(event: MessageEvent): void {
    if (event.origin !== this.#appFrame.getTargetOrigin()) {
      return
    }

    if (event.data) {
      this.getLogger().debug(`get from ${event.origin}`, {
        data: event.data,
        origin: event.origin
      })

      const tmp = event.data.split(':')

      const cmd: { id: string, args: any } = {
        id: tmp[0],
        args: tmp.slice(1).join(':')
      }

      if (cmd.args) {
        cmd.args = JSON.parse(cmd.args)
      }

      if (this.#callbackPromises.has(cmd.id)) {
        const promise = this.#callbackPromises.get(cmd.id) as PromiseHandlers
        if (promise.timeoutId) {
          clearTimeout(promise.timeoutId)
        }

        this.#callbackPromises.delete(cmd.id)

        promise.resolve(cmd.args)
        // promise.reject(cmd.args) ////
      } else if (this.#callbackSingletone.has(cmd.id)) {
        const callBack = this.#callbackSingletone.get(cmd.id) as (...args: any[]) => void
        if (callBack) {
          callBack.apply(globalThis, [cmd.args])
        }
      }
    }
  }

  /**
   * Storing a promise for a message from the parent window
   *
   * @param promiseHandler
   * @private
   *
   * @memo We don't use Symbol here, because we need to pass it to the parent and then find and restore it.
   */
  #setCallbackPromise(promiseHandler: PromiseHandlers): string {
    const key = Text.getUniqId()
    this.#callbackPromises.set(key, promiseHandler)
    return key
  }
}
