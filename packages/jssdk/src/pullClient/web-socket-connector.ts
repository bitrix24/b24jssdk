import Text from '../tools/text'
import { AbstractConnector } from './abstract-connector'
import { ConnectionType } from '../types/pull'
import type { ConnectorConfig } from '../types/pull'

export class WebSocketConnector extends AbstractConnector {
  private _socket: null | WebSocket

  private readonly _onSocketOpenHandler: () => void
  private readonly _onSocketCloseHandler: (event: CloseEvent) => void
  private readonly _onSocketErrorHandler: (event: Event) => void
  private readonly _onSocketMessageHandler: (event: MessageEvent) => void

  constructor(config: ConnectorConfig) {
    super(config)

    this._connectionType = ConnectionType.WebSocket
    this._socket = null

    this._onSocketOpenHandler = this._onSocketOpen.bind(this)
    this._onSocketCloseHandler = this._onSocketClose.bind(this)
    this._onSocketErrorHandler = this._onSocketError.bind(this)
    this._onSocketMessageHandler = this._onSocketMessage.bind(this)
  }

  override destroy() {
    super.destroy()

    if (this._socket) {
      this._socket.close()
      this._socket = null
    }
  }

  /**
   * @inheritDoc
   */
  override connect(): void {
    if (this._socket) {
      if (this._socket.readyState === 1) {
        /**
         * @memo already connected
         */
        return
      } else {
        this.clearEventListener()

        this._socket.close()
        this._socket = null
      }
    }

    this._createSocket()
  }

  get socket(): null | WebSocket {
    return this._socket
  }

  /**
   * @inheritDoc
   * @param code
   * @param reason
   */
  override disconnect(code: number, reason: string): void {
    if (this._socket !== null) {
      this.clearEventListener()

      this._socket.close(code, reason)
    }
    this._socket = null
    this._disconnectCode = code
    this._disconnectReason = reason
    this.connected = false
  }

  /**
   * Via websocket connection
   * @inheritDoc
   */
  override send(buffer: ArrayBuffer | string): boolean {
    if (!this._socket || this._socket.readyState !== 1) {
      this.getLogger().error(
        new Error(`${Text.getDateForLog()}: Pull: WebSocket is not connected`)
      )

      return false
    }

    this._socket.send(buffer)
    return true
  }

  // region Event Handlers ////
  private _onSocketOpen(): void {
    this.connected = true
  }

  private _onSocketClose(event: CloseEvent) {
    this._socket = null
    this._disconnectCode = Number(event.code)
    this._disconnectReason = event.reason
    this.connected = false
  }

  private _onSocketError(event: Event): void {
    this._callbacks.onError(new Error(`Socket error: ${event}`))
  }

  private _onSocketMessage(event: MessageEvent): void {
    this._callbacks.onMessage(event.data)
  }
  // endregion ////

  // region Tools ////
  private clearEventListener(): void {
    if (this._socket) {
      this._socket.removeEventListener('open', this._onSocketOpenHandler)

      this._socket.removeEventListener('close', this._onSocketCloseHandler)

      this._socket.removeEventListener('error', this._onSocketErrorHandler)

      this._socket.removeEventListener('message', this._onSocketMessageHandler)
    }
  }

  private _createSocket(): void {
    if (this._socket) {
      throw new Error('Socket already exists')
    }

    if (!this.connectionPath) {
      throw new Error('Websocket connection path is not defined')
    }

    this._socket = new WebSocket(this.connectionPath)
    this._socket.binaryType = 'arraybuffer'

    this._socket.addEventListener('open', this._onSocketOpenHandler)

    this._socket.addEventListener('close', this._onSocketCloseHandler)

    this._socket.addEventListener('error', this._onSocketErrorHandler)

    this._socket.addEventListener('message', this._onSocketMessageHandler)
  }
  // endregion ////
}
