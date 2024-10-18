import { LoggerBrowser, LoggerType } from '../logger/browser'
import { ErrorNotConnected, ErrorTimeout } from './errors'
import Type from '../tools/type'
import Text from '../tools/text'
import {
	type JsonRpcRequest,
	ListRpcError,
	type RpcRequest,
	type TypeConnector,
	type TypeJsonRpcConfig
} from '../types/pull'
import type { RpcCommand, RpcCommandResult, TypeRpcResponseAwaiters } from '../types/pull'

const JSON_RPC_VERSION = '2.0'

export class JsonRpc
{
	private _logger: null|LoggerBrowser = null
	
	private _connector: TypeConnector
	private _idCounter: number = 0
	
	private _handlers: Record<string, (params: any) => RpcCommandResult> = {}
	
	private _rpcResponseAwaiters: Map<number, TypeRpcResponseAwaiters> = new Map()
	
	constructor(options: TypeJsonRpcConfig)
	{
		this._connector = options.connector
		
		if(Type.isPlainObject(options.handlers))
		{
			for(let method in options.handlers)
			{
				this.handle(method, options.handlers[method]);
			}
		}
	}
	
	setLogger(logger: LoggerBrowser): void
	{
		this._logger = logger
	}
	
	getLogger(): LoggerBrowser
	{
		if(null === this._logger)
		{
			this._logger = LoggerBrowser.build(
				`NullLogger`
			)
			
			this._logger.setConfig({
				[LoggerType.desktop]: false,
				[LoggerType.log]: false,
				[LoggerType.info]: false,
				[LoggerType.warn]: false,
				[LoggerType.error]: true,
				[LoggerType.trace]: false,
			})
		}
		
		return this._logger
	}
	
	/**
	 * @param {string} method
	 * @param {function} handler
	 */
	handle(
		method: string,
		handler: (params: any) => RpcCommandResult
	)
	{
		this._handlers[method] = handler;
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
	): Promise<void>
	{
		return new Promise((resolve, reject) => {
			const request = this.createRequest(method, params)
			
			if(!this._connector.send(
				JSON.stringify(request)
			))
			{
				reject(new ErrorNotConnected('websocket is not connected'))
			}
			
			const timeoutHandler = setTimeout(
				() => {
					this._rpcResponseAwaiters.delete(request.id)
					reject(new ErrorTimeout('no response'))
				},
				timeout * 1_000
			)
			
			this._rpcResponseAwaiters.set(
				request.id,
				{
					resolve,
					reject,
					timeout: timeoutHandler
				} as TypeRpcResponseAwaiters
			)
		})
	}
	
	/**
	 * Executes array or rpc commands.
	 * Returns array of promises, each promise will be resolved individually.
	 *
	 * @param {JsonRpcRequest[]} batch
	 * @returns {Promise[]}
	 */
	private executeOutgoingRpcBatch(batch: JsonRpcRequest[]): Promise<any>[]
	{
		let requests: RpcRequest[] = []
		let promises: Promise<any>[] = []
		
		batch.forEach(({ method, params, id }) => {
			const request = this.createRequest(method, params, id)
			requests.push(request)
			promises.push(new Promise((resolve, reject) => this._rpcResponseAwaiters.set(
				request.id,
				{
					resolve,
					reject
				} as TypeRpcResponseAwaiters
			)))
		})
		
		this._connector.send(JSON.stringify(requests));
		return promises
	}
	
	private processRpcResponse(response: RpcCommandResult): void
	{
		if (
			'id' in response
			&& this._rpcResponseAwaiters.has(Number(response.id))
		)
		{
			const awaiter = this._rpcResponseAwaiters.get(Number(response.id))
			if(awaiter)
			{
				if('result' in response)
				{
					awaiter.resolve(response.result)
				}
				else if('error' in response)
				{
					awaiter.reject(response?.error || 'error')
				}
				else
				{
					awaiter.reject("wrong response structure")
				}
				
				clearTimeout(awaiter.timeout)
				this._rpcResponseAwaiters.delete(Number(response.id))
			}
			
			return
		}
		
		this.getLogger().error(
			new Error(
				`${Text.getDateForLog()}: Pull: Received rpc response with unknown id`
			),
			response
		)
	}
	
	parseJsonRpcMessage(message: string): RpcCommandResult[]|RpcCommandResult|void
	{
		let decoded
		try
		{
			decoded = JSON.parse(message);
		}
		catch (error)
		{
			this.getLogger().error(
				new Error(
					`${Text.getDateForLog()}: Pull: Could not decode json rpc message`
				),
				error
			)
			
			return
		}
		
		if(Type.isArray(decoded))
		{
			return this.executeIncomingRpcBatch(decoded);
		}
		else if(Type.isJsonRpcRequest(decoded))
		{
			return this.executeIncomingRpcCommand(decoded);
		}
		else if(Type.isJsonRpcResponse(decoded))
		{
			return this.processRpcResponse(decoded);
		}
		else
		{
			this.getLogger().error(
				new Error(
					`${Text.getDateForLog()}: Pull: unknown rpc packet`
				),
				decoded
			)
		}
	}
	
	/**
	 * Executes RPC command, received from the server
	 *
	 * @param {string} method
	 * @param {object} params
	 * @returns {object}
	 */
	private executeIncomingRpcCommand({ method, params }: RpcCommand): RpcCommandResult
	{
		if (method in this._handlers)
		{
			return this._handlers[method].call(this, params || {})
		}
		
		return {
			jsonrpc: JSON_RPC_VERSION,
			error: ListRpcError.MethodNotFound
		} as RpcCommandResult
	}
	
	private executeIncomingRpcBatch(batch: RpcCommand[]): RpcCommandResult[]
	{
		let result: RpcCommandResult[] = []
		
		for (let command of batch)
		{
			if ('jsonrpc' in command)
			{
				if ('method' in command)
				{
					let commandResult = this.executeIncomingRpcCommand(command)
					if (commandResult)
					{
						commandResult['jsonrpc'] = JSON_RPC_VERSION;
						commandResult['id'] = command["id"];
						
						result.push(commandResult)
					}
				}
				else
				{
					this.processRpcResponse(command)
				}
			}
			else
			{
				this.getLogger().error(
					new Error(
						`${Text.getDateForLog()}: Pull: unknown rpc command in batch`
					),
					command
				)
				
				result.push({
					jsonrpc: JSON_RPC_VERSION,
					error: ListRpcError.InvalidRequest,
				} as RpcCommandResult)
			}
		}
		
		return result;
	}
	
	private nextId(): number
	{
		return ++this._idCounter
	}
	
	private createPublishRequest(messageBatch: string[]): RpcRequest[]
	{
		return messageBatch.map(
			message => this.createRequest('publish', message)
		)
	}
	
	private createRequest(
		method: string,
		params: any,
		id?: number
	): RpcRequest
	{
		if(!id)
		{
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