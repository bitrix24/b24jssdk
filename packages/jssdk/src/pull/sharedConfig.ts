import { Utils } from "./utils";

export class SharedConfig
{
	constructor(params)
	{
		params = params || {};
		this.storage = params.storage || new StorageManager();
		
		this.ttl = 24 * 60 * 60;
		
		this.lsKeys = {
			websocketBlocked: 'bx-pull-websocket-blocked',
			longPollingBlocked: 'bx-pull-longpolling-blocked',
			loggingEnabled: 'bx-pull-logging-enabled'
		};
		
		this.callbacks = {
			onWebSocketBlockChanged: (Utils.isFunction(params.onWebSocketBlockChanged) ? params.onWebSocketBlockChanged : function () {})
		};
		
		if (this.storage)
		{
			window.addEventListener('storage', this.onLocalStorageSet.bind(this));
		}
	}
	
	onLocalStorageSet(params)
	{
		if (
			this.storage.compareKey(params.key, this.lsKeys.websocketBlocked)
			&& params.newValue != params.oldValue
		)
		{
			this.callbacks.onWebSocketBlockChanged({
				isWebSocketBlocked: this.isWebSocketBlocked()
			})
		}
	}
	
	isWebSocketBlocked()
	{
		if (!this.storage)
		{
			return false;
		}
		
		return this.storage.get(this.lsKeys.websocketBlocked, 0) > Utils.getTimestamp();
	}
	
	setWebSocketBlocked(isWebSocketBlocked)
	{
		if (!this.storage)
		{
			return false;
		}
		
		try
		{
			this.storage.set(this.lsKeys.websocketBlocked, (isWebSocketBlocked ? Utils.getTimestamp() + this.ttl : 0));
		} catch (e)
		{
			console.error(Utils.getDateForLog() + " Pull: Could not save WS_blocked flag in local storage. Error: ", e);
		}
	}
	
	isLongPollingBlocked()
	{
		if (!this.storage)
		{
			return false;
		}
		
		return this.storage.get(this.lsKeys.longPollingBlocked, 0) > Utils.getTimestamp();
	}
	
	setLongPollingBlocked(isLongPollingBlocked)
	{
		if (!this.storage)
		{
			return false;
		}
		
		try
		{
			this.storage.set(this.lsKeys.longPollingBlocked, (isLongPollingBlocked ? Utils.getTimestamp() + this.ttl : 0));
		} catch (e)
		{
			console.error(Utils.getDateForLog() + " Pull: Could not save LP_blocked flag in local storage. Error: ", e);
		}
	}
	
	isLoggingEnabled()
	{
		if (!this.storage)
		{
			return false;
		}
		
		return this.storage.get(this.lsKeys.loggingEnabled, 0) > Utils.getTimestamp();
	}
	
	setLoggingEnabled(isLoggingEnabled)
	{
		if (!this.storage)
		{
			return false;
		}
		
		try
		{
			this.storage.set(this.lsKeys.loggingEnabled, (isLoggingEnabled ? Utils.getTimestamp() + this.ttl : 0));
		} catch (e)
		{
			console.error("LocalStorage error: ", e);
			return false;
		}
	}
}