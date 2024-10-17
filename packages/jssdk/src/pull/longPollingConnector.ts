import { Utils } from './utils'
import { AbstractConnector } from './abstractConnector'

class LongPollingConnector extends AbstractConnector
{
	constructor(config)
	{
		super(config);
		
		this.active = false;
		this.connectionType = ConnectionType.LongPolling;
		this.requestTimeout = null;
		this.failureTimeout = null;
		this.xhr = this.createXhr();
		this.requestAborted = false;
	}
	
	createXhr()
	{
		const result = new XMLHttpRequest();
		if (this.parent.isProtobufSupported() && !this.parent.isJsonRpc())
		{
			result.responseType = "arraybuffer";
		}
		result.addEventListener("readystatechange", this.onXhrReadyStateChange.bind(this));
		return result;
	}
	
	connect()
	{
		this.active = true;
		this.performRequest();
	}
	
	disconnect(code, reason)
	{
		this.active = false;
		
		if (this.failureTimeout)
		{
			clearTimeout(this.failureTimeout);
			this.failureTimeout = null;
		}
		if (this.requestTimeout)
		{
			clearTimeout(this.requestTimeout);
			this.requestTimeout = null;
		}
		
		if (this.xhr)
		{
			this.requestAborted = true;
			this.xhr.abort();
		}
		
		this.disconnectCode = code;
		this.disconnectReason = reason;
		this.connected = false;
	}
	
	performRequest()
	{
		if (!this.active)
		{
			return;
		}
		
		if (!this.path)
		{
			throw new Error("Long polling connection path is not defined");
		}
		if (this.xhr.readyState !== 0 && this.xhr.readyState !== 4)
		{
			return;
		}
		
		clearTimeout(this.failureTimeout);
		clearTimeout(this.requestTimeout);
		
		this.failureTimeout = setTimeout(() => { this.connected = true }, 5000);
		this.requestTimeout = setTimeout(this.onRequestTimeout.bind(this), LONG_POLLING_TIMEOUT * 1000);
		
		this.xhr.open("GET", this.path);
		this.xhr.send();
	}
	
	onRequestTimeout()
	{
		this.requestAborted = true;
		this.xhr.abort();
		this.performRequest();
	}
	
	onXhrReadyStateChange()
	{
		if (this.xhr.readyState === 4)
		{
			if (!this.requestAborted || this.xhr.status == 200)
			{
				this.onResponse(this.xhr.response);
			}
			this.requestAborted = false;
		}
	}
	
	/**
	 * Sends some data to the server via http request.
	 * @param {ArrayBuffer} buffer Data to send.
	 * @return {bool}
	 */
	send(buffer)
	{
		const path = this.parent.getPublicationPath();
		if (!path)
		{
			console.error(Utils.getDateForLog() + ": Pull: publication path is empty");
			return false;
		}
		
		let xhr = new XMLHttpRequest();
		xhr.open("POST", path);
		xhr.send(buffer);
	}
	
	onResponse(response)
	{
		if (this.failureTimeout)
		{
			clearTimeout(this.failureTimeout);
			this.failureTimeout = 0;
		}
		if (this.requestTimeout)
		{
			clearTimeout(this.requestTimeout);
			this.requestTimeout = 0;
		}
		
		if (this.xhr.status == 200)
		{
			this.connected = true;
			if (Utils.isNotEmptyString(response) || (response instanceof ArrayBuffer))
			{
				this.callbacks.onMessage(response);
			}
			else
			{
				this.parent.session.mid = null;
			}
			this.performRequest();
		}
		else if (this.xhr.status == 304)
		{
			this.connected = true;
			if (this.xhr.getResponseHeader("Expires") === "Thu, 01 Jan 1973 11:11:01 GMT")
			{
				const lastMessageId = this.xhr.getResponseHeader("Last-Message-Id");
				if (Utils.isNotEmptyString(lastMessageId))
				{
					this.parent.setLastMessageId(lastMessageId);
				}
			}
			this.performRequest();
		}
		else
		{
			this.callbacks.onError('Could not connect to the server');
			this.connected = false;
		}
	}
}