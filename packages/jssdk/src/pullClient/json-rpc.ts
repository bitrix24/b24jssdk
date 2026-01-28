import type { RpcCommand, RpcCommandResult, TypeRpcResponseAwaiters, JsonRpcRequest, RpcRequest, TypeConnector, TypeJsonRpcConfig, TypePullClientMessageBatch } from '../types/pull'
import type { LoggerInterface } from '../logger'
import { LoggerFactory } from '../logger'
import { ErrorNotConnected, ErrorTimeout } from './errors'
import { Type } from '../tools/type'
import { Text } from '../tools/text'
import { ListRpcError } from '../types/pull'

const JSON_RPC_VERSION = '2.0'

export class JsonRpc {
  private _logger: LoggerInterface

  private _connector: TypeConnector
  private _idCounter: number = 0

  private _handlers: Record<string, (params: any) => RpcCommandResult> = {}

  private _rpcResponseAwaiters: Map<number, TypeRpcResponseAwaiters> = new Map()

  constructor(options: TypeJsonRpcConfig) {
    this._logger = LoggerFactory.createNullLogger()
    this._connector = options.connector

    if (Type.isPlainObject(options.handlers)) {
      for (const method in options.handlers) {
        this.handle(method, options.handlers[method]!)
      }
    }
  }

  setLogger(logger: LoggerInterface): void {
    this._logger = logger
  }

  getLogger(): LoggerInterface {
    return this._logger
  }

  /**
   * @param {string} method
   * @param {function} handler
   */
  handle(method: string, handler: (params: any) => RpcCommandResult) {
    this._handlers[method] = handler
  }

  /**
   * Sends RPC command to the server.
   *
   * @param {string} method Method name
   * @param {object} params
   * @param {int} timeout
   * @returns {Promise}
   */
  async executeOutgoingRpcCommand(
    method: string,
    params: object,
    timeout: number = 5
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const request = this.createRequest(method, params)

      if (!this._connector.send(JSON.stringify(request))) {
        reject(new ErrorNotConnected('websocket is not connected'))
      }

      const timeoutHandler = setTimeout(() => {
        this._rpcResponseAwaiters.delete(request.id)
        reject(new ErrorTimeout('no response'))
      }, timeout * 1_000)

      this._rpcResponseAwaiters.set(request.id, {
        resolve,
        reject,
        timeout: timeoutHandler
      } as unknown as TypeRpcResponseAwaiters)
    })
  }

  /**
   * Executes array or rpc commands.
   * Returns an array of promises, each promise will be resolved individually.
   *
   * @param {JsonRpcRequest[]} batch
   * @returns {Promise[]}
   */
  // @ts-expect-error When we rewrite it to something more modern, then we'll remove this
  private executeOutgoingRpcBatch(batch: JsonRpcRequest[]): Promise<any>[] {
    const requests: RpcRequest[] = []
    const promises: Promise<any>[] = []

    // eslint-disable-next-line
		batch.forEach(({ method, params, id }) => {
      const request = this.createRequest(method, params, id)
      requests.push(request)
      promises.push(
        new Promise((resolve, reject) =>
          this._rpcResponseAwaiters.set(request.id, {
            resolve,
            reject
          } as TypeRpcResponseAwaiters)
        )
      )
    })

    this._connector.send(JSON.stringify(requests))
    return promises
  }

  private processRpcResponse(response: RpcCommandResult): void {
    if (
      'id' in response
      && this._rpcResponseAwaiters.has(Number(response.id))
    ) {
      const awaiter = this._rpcResponseAwaiters.get(Number(response.id))
      if (awaiter) {
        if ('result' in response) {
          awaiter.resolve(response.result)
        } else if ('error' in response) {
          awaiter.reject(response?.error || 'error')
        } else {
          awaiter.reject('wrong response structure')
        }

        clearTimeout(awaiter.timeout)
        this._rpcResponseAwaiters.delete(Number(response.id))
      }

      return
    }

    this.getLogger().error(`${Text.getDateForLog()}: Pull: Received rpc response with unknown id`, { response })
  }

  parseJsonRpcMessage(
    message: string
  ): RpcCommandResult[] | RpcCommandResult {
    let decoded
    try {
      decoded = JSON.parse(message)
    } catch (error) {
      this.getLogger().error(
        `${Text.getDateForLog()}: Pull: Could not decode json rpc message`,
        { error }
      )

      return []
    }

    if (Type.isArray(decoded)) {
      return this.executeIncomingRpcBatch(decoded)
    } else if (Type.isJsonRpcRequest(decoded)) {
      return this.executeIncomingRpcCommand(decoded)
    } else if (Type.isJsonRpcResponse(decoded)) {
      this.processRpcResponse(decoded)
      return []
    } else {
      this.getLogger().error(
        `${Text.getDateForLog()}: Pull: unknown rpc packet`,
        { decoded }
      )
    }

    return []
  }

  /**
   * Executes RPC command, received from the server
   *
   * @param {string} method
   * @param {object} params
   * @returns {object} RpcCommandResult
   */
  private executeIncomingRpcCommand({
    method,
    params
  }: RpcCommand): RpcCommandResult {
    if (method in this._handlers) {
      return this._handlers[method]!.call(this, params || {})
    }

    return {
      jsonrpc: JSON_RPC_VERSION,
      error: ListRpcError.MethodNotFound
    } as RpcCommandResult
  }

  private executeIncomingRpcBatch(batch: RpcCommand[]): RpcCommandResult[] {
    const result: RpcCommandResult[] = []

    for (const command of batch) {
      if ('jsonrpc' in command) {
        if ('method' in command) {
          const commandResult = this.executeIncomingRpcCommand(command)
          if (commandResult) {
            commandResult['jsonrpc'] = JSON_RPC_VERSION
            commandResult['id'] = command['id']

            result.push(commandResult)
          }
        } else {
          this.processRpcResponse(command)
        }
      } else {
        this.getLogger().error(
          `${Text.getDateForLog()}: Pull: unknown rpc command in batch`,
          { command }
        )

        result.push({
          jsonrpc: JSON_RPC_VERSION,
          error: ListRpcError.InvalidRequest
        } as RpcCommandResult)
      }
    }

    return result
  }

  private nextId(): number {
    return ++this._idCounter
  }

  public createPublishRequest(
    messageBatch: TypePullClientMessageBatch[]
  ): RpcRequest[] {
    return messageBatch.map(message => this.createRequest('publish', message))
  }

  private createRequest(method: string, params: any, id?: number): RpcRequest {
    if (!id) {
      id = this.nextId()
    }

    return {
      jsonrpc: JSON_RPC_VERSION,
      method,
      params,
      id
    } as RpcRequest
  }
}
