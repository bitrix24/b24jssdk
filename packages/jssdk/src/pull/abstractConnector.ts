import {Utils} from "./utils";

export class AbstractConnector
{
	_connected = false;
	connectionType = "";
	
	disconnectCode = '';
	disconnectReason = '';
	
	constructor(config)
	{
		this.parent = config.parent;
		this.callbacks = {
			onOpen: Utils.isFunction(config.onOpen) ? config.onOpen : function () {},
			onDisconnect: Utils.isFunction(config.onDisconnect) ? config.onDisconnect : function () {},
			onError: Utils.isFunction(config.onError) ? config.onError : function () {},
			onMessage: Utils.isFunction(config.onMessage) ? config.onMessage : function () {}
		};
	}
	
	get connected()
	{
		return this._connected
	}
	
	set connected(value)
	{
		if (value == this._connected)
		{
			return;
		}
		
		this._connected = value;
		
		if (this._connected)
		{
			this.callbacks.onOpen();
		}
		else
		{
			this.callbacks.onDisconnect({
				code: this.disconnectCode,
				reason: this.disconnectReason
			});
		}
	}
	
	get path()
	{
		return this.parent.getConnectionPath(this.connectionType);
	}
}