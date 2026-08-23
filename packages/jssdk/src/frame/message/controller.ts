import type { MessageCommands } from './commands'
import type { AppFrame } from '../frame'
import type { LoggerInterface } from '../../logger'
import { LoggerFactory } from '../../logger'
import { Type } from '../../tools/type'
import { Text } from '../../tools/text'
import { omit } from '../../tools'
import { SdkError } from '../../core/sdk-error'

/**
 * Ceiling on {@link MessageManager.#rejectedOrigins}. The key is chosen by the
 * sender, so the set is only bounded if we bound it (#146).
 */
const MAX_REJECTED_ORIGINS = 50

/**
 * How much of an inbound callback id may appear in an error message. The id is
 * sender-chosen, and error messages reach logs (#146).
 */
const MAX_CALLBACK_ID_IN_ERROR = 64

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
  // origins already warned about (#244) — dedup so a peer spamming postMessage
  // from a foreign origin can't flood a wired logger sink. Capped, because the
  // dedup key is attacker-chosen: a peer can post from an unbounded supply of
  // distinct origins (`a.evil.test`, `b.evil.test`, …) and every unseen one adds
  // an entry. Past the cap the set stops growing and later origins are simply
  // not warned about — losing a log line is the right trade against unbounded
  // memory in a long-lived frame (#146).
  #rejectedOrigins: Set<string> = new Set()

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
   * Unsubscribe from the onMessage event of the parent window, and tear the
   * manager down.
   *
   * Removing the listener is not enough. Every in-flight `send()` is waiting on
   * a promise that only the listener could settle, so dropping the listener
   * alone strands each of them **forever** — with its `isSafely` timer still
   * armed and its entry still in the callback map. `B24Frame.destroy()` calls
   * this, so an SPA that mounts and unmounts the frame accumulated one such set
   * per cycle (#146; the same class of leak as #222 in `PullClient`).
   *
   * Pending sends are therefore **rejected**, not left hanging, with
   * `JSSDK_FRAME_DISPOSED` — mirroring how a disposed `PullClient` rejects
   * `start()` with `PULL_DISPOSED`. A caller awaiting a command that can no
   * longer be answered should learn that; silence is the one outcome it cannot
   * act on.
   *
   * Note the consequence: a `send()` whose result was discarded without a
   * `.catch()` turns into an unhandled rejection at teardown. Most SDK commands
   * pass `isSafely`, which settles them on their own timer, so they are normally
   * already gone by the time this runs — but **not all of them do**.
   * `ParentManager.closeApplication()` and `SliderManager.closeSliderAppPage()`
   * deliberately pass `isSafely: false` ("everything will be closed, and timeout
   * will not be able to do anything"), and those are exactly the calls made as
   * an app tears itself down — the likeliest race with this method. The awaited
   * commands (`getInitData`, `refreshAuth`, the dialog selectors) send without
   * `isSafely` too, but their callers await them, so the rejection surfaces
   * where it can be handled.
   *
   * A caller that fires `closeApplication()` without awaiting it should attach
   * `.catch(() => {})` if it also tears the frame down in the same breath.
   */
  unsubscribe(): void {
    window.removeEventListener('message', this.runCallbackHandler)

    for (const [key, promise] of this.#callbackPromises) {
      if (promise.timeoutId) {
        clearTimeout(promise.timeoutId)
      }

      this.#callbackPromises.delete(key)
      promise.reject(new SdkError({
        code: 'JSSDK_FRAME_DISPOSED',
        description: 'The B24Frame was destroyed before the parent window answered this command.',
        status: 0
      }))
    }

    // Placement event handlers are registered for the lifetime of the frame and
    // are never fired again once the listener is gone.
    this.#callbackSingletone.clear()
    this.#rejectedOrigins.clear()
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

      // Log only the command + callback key, never the assembled `cmd` string:
      // for setAppOption / setUserOption it carries the serialised option
      // `value`, which an app may use to store a credential (#43).
      this.getLogger().debug(`send to ${this.#appFrame.getTargetOrigin()}`, {
        command: command.toString(),
        callbackKey: keyPromise,
        origin: this.#appFrame.getTargetOrigin()
      }).catch(() => {})

      parent.postMessage(cmd, this.#appFrame.getTargetOrigin())

      if (params?.isSafely) {
        const safelyTime = Number.parseInt(String(params?.safelyTime || 900))
        this.#callbackPromises.get(keyPromise)!.timeoutId = window.setTimeout(
          () => {
            if (this.#callbackPromises.has(keyPromise)) {
              this.getLogger().warning(`action ${command.toString()} stop by timeout`, {
                command: command.toString(),
                safelyTime
              }).catch(() => {})

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
      // Surface a message from an unexpected origin (a probe, or a misconfigured
      // parent) — log the origins only, never event.data, which may carry the
      // AUTH_ID / REFRESH_ID a foreign sender must not have echoed back (#244).
      // Log once per distinct origin so a spamming peer can't flood the sink.
      if (!this.#rejectedOrigins.has(event.origin) && this.#rejectedOrigins.size < MAX_REJECTED_ORIGINS) {
        this.#rejectedOrigins.add(event.origin)
        this.getLogger().warning('message rejected: unexpected origin', {
          origin: event.origin,
          expected: this.#appFrame.getTargetOrigin()
        }).catch(() => {})
      }

      return
    }

    // The wire format is a colon-joined string. Anything else on this origin is
    // not ours: `postMessage` is a shared channel, and a page hosting the frame
    // may carry other libraries (or a browser extension) posting objects on it.
    // `event.data.split` on such a message threw a TypeError out of a window
    // event listener — an uncaught error, on traffic the SDK simply should have
    // ignored (#146).
    if (typeof event.data === 'string' && event.data.length > 0) {
      // Narrowing `event.data` to `string` above also made this indexing
      // checked — it used to sit behind `any`. `split` on a non-empty string
      // always yields at least one element, so the fallback is unreachable, but
      // it keeps the type honest rather than asserting it away.
      const [id = '', ...rest] = event.data.split(':')

      const cmd: { id: string, args: any } = {
        id,
        args: rest.join(':')
      }

      // Log only the callback id and origin — never `event.data` / `cmd.args`.
      // The inbound message carries the auth tokens (AUTH_ID / REFRESH_ID) for
      // refreshAuth / getInitData responses, embedded in the colon-joined
      // payload as an opaque substring a redactor can't see (#43).
      this.getLogger().debug(`get from ${event.origin}`, {
        id: cmd.id,
        origin: event.origin
      }).catch(() => {})

      if (cmd.args) {
        try {
          cmd.args = JSON.parse(cmd.args)
        } catch {
          // A payload we cannot read is not a payload we may guess at. Before
          // this, the throw escaped the listener and left the waiting promise
          // pending forever — the caller was told nothing, and waited for an
          // answer that had in fact already arrived, broken (#146).
          //
          // The caught error is deliberately not logged and not attached as
          // `cause`. V8 quotes the offending input in its message — `Unexpected
          // token 'a', "auth=..." is not valid JSON` — and this payload is the
          // one that carries AUTH_ID / REFRESH_ID (#43). The id and origin below
          // say which command failed, which is what a reader needs.
          this.getLogger().warning('message dropped: payload is not valid JSON', {
            id: cmd.id,
            origin: event.origin
          }).catch(() => {})

          // `cmd.id` is the first colon-segment of an inbound message, so its
          // content and length are chosen by the sender. It is a callback key,
          // not a credential — but unlike the payload it DOES reach logs, via
          // SdkError's enumerable `message`. Truncated so a sender cannot use
          // this description as an amplifier.
          this.#rejectPromise(cmd.id, new SdkError({
            code: 'JSSDK_FRAME_BAD_PAYLOAD',
            description: `The parent window answered command "${cmd.id.slice(0, MAX_CALLBACK_ID_IN_ERROR)}" with a payload that is not valid JSON.`,
            status: 0
          }))

          return
        }
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
   * Settle a waiting promise with a rejection, if one is still waiting.
   *
   * Silent when the key is unknown: a payload can arrive for a command that
   * already timed out under `isSafely`, and there is nothing left to reject.
   */
  #rejectPromise(key: string, error: SdkError): void {
    const promise = this.#callbackPromises.get(key)
    if (!promise) {
      return
    }

    if (promise.timeoutId) {
      clearTimeout(promise.timeoutId)
    }

    this.#callbackPromises.delete(key)
    promise.reject(error)
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
