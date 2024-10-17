import { ErrorNotConnected, ErrorTimeout } from './errors'
import { Utils } from './utils'

export class JsonRpc
{
	idCounter = 0;
	
	handlers = {};
	rpcResponseAwaiters = new Map();
	
	constructor(options)
	{
		this.connector = options.connector;
		if (Utils.isPlainObject(options.handlers))
		{
			for (let method in options.handlers)
			{
				this.handle(method, options.handlers[method]);
			}
		}
	}
	
	/**
	 * @param {string} method
	 * @param {function} handler
	 */
	handle(method, handler)
	{
		this.handlers[method] = handler;
	}
	
	/**
	 * Sends RPC command to the server.
	 *
	 * @param {string} method Method name
	 * @param {object} params
	 * @param {int} timeout
	 * @returns {Promise}
	 */
	executeOutgoingRpcCommand(method, params, timeout)
	{
		if (!timeout)
		{
			timeout = 5;
		}
		return new Promise((resolve, reject) => {
			const request = this.createRequest(method, params);
			
			if (!this.connector.send(JSON.stringify(request)))
			{
				reject(new ErrorNotConnected('websocket is not connected'));
			}
			
			const t = setTimeout(() => {
				this.rpcResponseAwaiters.delete(request.id);
				reject(new ErrorTimeout('no response'));
			}, timeout * 1000);
			this.rpcResponseAwaiters.set(request.id, {resolve, reject, timeout: t});
		})
	}
	
	/**
	 * Executes array or rpc commands. Returns array of promises, each promise will be resolved individually.
	 *
	 * @param {JsonRpcRequest[]} batch
	 * @returns {Promise[]}
	 */
	executeOutgoingRpcBatch(batch)
	{
		let requests = [];
		let promises = [];
		batch.forEach(({method, params, id}) => {
			const request = this.createRequest(method, params, id);
			requests.push(request);
			promises.push(new Promise((resolve, reject) => this.rpcResponseAwaiters.set(request.id, {
				resolve,
				reject
			})));
		});
		
		this.connector.send(JSON.stringify(requests));
		return promises;
	}
	
	processRpcResponse(response)
	{
		if ("id" in response && this.rpcResponseAwaiters.has(response.id))
		{
			const awaiter = this.rpcResponseAwaiters.get(response.id)
			if ("result" in response)
			{
				awaiter.resolve(response.result)
			}
			else if ("error" in response)
			{
				awaiter.reject(response.error)
			}
			else
			{
				awaiter.reject(new Error("wrong response structure"))
			}
			
			clearTimeout(awaiter.timeout)
			this.rpcResponseAwaiters.delete(response.id)
		}
		else
		{
			console.error("Received rpc response with unknown id", response)
		}
	}
	
	parseJsonRpcMessage(message)
	{
		let decoded
		try
		{
			decoded = JSON.parse(message);
		} catch (e)
		{
			console.error(Utils.getDateForLog() + ": Pull: Could not decode json rpc message", e);
		}
		
		if (Utils.isArray(decoded))
		{
			return this.executeIncomingRpcBatch(decoded);
		}
		else if (Utils.isJsonRpcRequest(decoded))
		{
			return this.executeIncomingRpcCommand(decoded);
		}
		else if (Utils.isJsonRpcResponse(decoded))
		{
			return this.processRpcResponse(decoded);
		}
		else
		{
			console.error(Utils.getDateForLog() + ": Pull: unknown rpc packet", decoded);
		}
	}
	
	/**
	 * Executes RPC command, received from the server
	 *
	 * @param {string} method
	 * @param {object} params
	 * @returns {object}
	 */
	executeIncomingRpcCommand({method, params})
	{
		if (method in this.handlers)
		{
			return this.handlers[method].call(this, params)
		}
		
		return {
			"error": RpcError.MethodNotFound
		}
	}
	
	executeIncomingRpcBatch(batch)
	{
		let result = [];
		for (let command of batch)
		{
			if ("jsonrpc" in command)
			{
				if ("method" in command)
				{
					let commandResult = this.executeIncomingRpcCommand(command)
					if (commandResult)
					{
						commandResult["jsonrpc"] = JSON_RPC_VERSION;
						commandResult["id"] = command["id"];
						
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
				console.error(Utils.getDateForLog() + ": Pull: unknown rpc command in batch", command);
				result.push({
					"jsonrpc": "2.0",
					"error": RpcError.InvalidRequest,
				})
			}
		}
		
		return result;
	}
	
	nextId()
	{
		return ++this.idCounter;
	}
	
	createPublishRequest(messageBatch)
	{
		let result = messageBatch.map(message => this.createRequest('publish', message));
		
		if (result.length === 0)
		{
			return result[0]
		}
		
		return result;
	}
	
	createRequest(method, params, id)
	{
		if (!id)
		{
			id = this.nextId()
		}
		
		return {
			jsonrpc: JSON_RPC_VERSION,
			method: method,
			params: params,
			id: id
		}
	}
}