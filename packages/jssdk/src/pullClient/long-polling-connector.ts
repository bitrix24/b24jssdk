import type { ConnectorConfig } from '../types/pull'
import { Type } from '../tools/type'
import { Text } from '../tools/text'
import { AbstractConnector } from './abstract-connector'
import { ConnectionType } from '../types/pull'

const LONG_POLLING_TIMEOUT = 60

export class LongPollingConnector extends AbstractConnector {
  private _active: boolean

  private _requestTimeout: ReturnType<typeof setTimeout> | null
  private _failureTimeout: ReturnType<typeof setTimeout> | null
  // Created lazily on the first connect() rather than in the constructor: the
  // connector is built eagerly by PullClient.init() (which runs inside start())
  // regardless of the chosen transport, and `new XMLHttpRequest()` throws a
  // ReferenceError under SSR/Node where the global is absent. Deferring it keeps
  // construct + init + start SSR-safe; connect() degrades gracefully instead. (#222)
  private _xhr: XMLHttpRequest | null
  private _requestAborted: boolean

  constructor(config: ConnectorConfig) {
    super(config)

    this._active = false
    this._connectionType = ConnectionType.LongPolling

    this._requestTimeout = null
    this._failureTimeout = null
    this._xhr = null
    this._requestAborted = false
  }

  /**
   * @inheritDoc
   */
  override connect(): void {
    if (!this._xhr) {
      // No XMLHttpRequest under SSR/Node: a long-polling connection needs a
      // browser. Surface a clean error instead of a raw ReferenceError. (#222)
      if (typeof XMLHttpRequest === 'undefined') {
        this._callbacks.onError(
          new Error(
            'LongPollingConnector: XMLHttpRequest is not available in this'
            + ' environment (SSR/Node); a long-polling connection requires a browser'
          )
        )
        return
      }
      this._xhr = this.createXhr()
    }

    this._active = true
    this.performRequest()
  }

  /**
   * @inheritDoc
   * @param code
   * @param reason
   */
  override disconnect(code: number, reason: string): void {
    this._active = false

    this.clearTimeOut()

    if (this._xhr) {
      this._requestAborted = true
      this._xhr.abort()
    }

    this._disconnectCode = code
    this._disconnectReason = reason
    this.connected = false
  }

  private performRequest(): void {
    if (!this._active) {
      return
    }

    if (!this.connectionPath) {
      throw new Error('Long polling connection path is not defined')
    }

    const xhr = this._xhr
    if (!xhr) {
      return
    }

    if (xhr.readyState !== 0 && xhr.readyState !== 4) {
      return
    }

    this.clearTimeOut()

    this._failureTimeout = setTimeout(() => {
      this.connected = true
    }, 5_000)

    this._requestTimeout = setTimeout(
      this.onRequestTimeout.bind(this),
      LONG_POLLING_TIMEOUT * 1_000
    )

    xhr.open('GET', this.connectionPath)
    xhr.send()
  }

  private onRequestTimeout() {
    this._requestAborted = true
    this._xhr?.abort()
    this.performRequest()
  }

  private onXhrReadyStateChange(): void {
    const xhr = this._xhr
    if (!xhr) {
      return
    }

    if (xhr.readyState === 4) {
      if (!this._requestAborted || xhr.status == 200) {
        this.onResponse(xhr.response)
      }

      this._requestAborted = false
    }
  }

  /**
   * Via http request
   * @inheritDoc
   */
  override send(buffer: ArrayBuffer | string): boolean {
    const path = this._parent.getPublicationPath()
    if (!path) {
      this.getLogger().error(`${Text.getDateForLog()}: Pull: publication path is empty`).catch(() => {})
      return false
    }

    if (typeof XMLHttpRequest === 'undefined') {
      this.getLogger().error(
        `${Text.getDateForLog()}: Pull: XMLHttpRequest is not available; cannot publish`
      ).catch(() => {})
      return false
    }

    const xhr = new XMLHttpRequest()
    xhr.open('POST', path)
    xhr.send(buffer)

    return true
  }

  private onResponse(response: any): void {
    this.clearTimeOut()

    const xhr = this._xhr
    if (!xhr) {
      return
    }

    if (xhr.status === 200) {
      this.connected = true
      if (Type.isStringFilled(response) || response instanceof ArrayBuffer) {
        this._callbacks.onMessage(response)
      } else {
        this._parent.session.mid = null
      }
      this.performRequest()
    } else if (xhr.status === 304) {
      this.connected = true
      if (
        xhr.getResponseHeader('Expires')
        === 'Thu, 01 Jan 1973 11:11:01 GMT'
      ) {
        const lastMessageId = xhr.getResponseHeader('Last-Message-Id')
        if (Type.isStringFilled(lastMessageId)) {
          this._parent.setLastMessageId(lastMessageId || '')
        }
      }
      this.performRequest()
    } else {
      this._callbacks.onError(new Error('Could not connect to the server'))

      this.connected = false
    }
  }

  // region Tools ////
  private clearTimeOut(): void {
    if (this._failureTimeout) {
      clearTimeout(this._failureTimeout)
      this._failureTimeout = null
    }

    if (this._requestTimeout) {
      clearTimeout(this._requestTimeout)
      this._requestTimeout = null
    }
  }

  private createXhr(): XMLHttpRequest {
    const result = new XMLHttpRequest()

    if (this._parent.isProtobufSupported() && !this._parent.isJsonRpc()) {
      result.responseType = 'arraybuffer'
    }

    result.addEventListener(
      'readystatechange',
      this.onXhrReadyStateChange.bind(this)
    )

    return result
  }
  // endregion ////
}
