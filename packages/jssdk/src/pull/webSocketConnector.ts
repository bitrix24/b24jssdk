import { Utils } from './utils'
import { AbstractConnector } from './abstractConnector'

export class WebSocketConnector
	extends AbstractConnector
{
	constructor(config)
	{
		super(config)
		this.connectionType = ConnectionType.WebSocket;
		this.socket = null;
		
		this.onSocketOpenHandler = this.onSocketOpen.bind(this);
		this.onSocketCloseHandler = this.onSocketClose.bind(this);
		this.onSocketErrorHandler = this.onSocketError.bind(this);
		this.onSocketMessageHandler = this.onSocketMessage.bind(this);
	}
	
	connect()
	{
		if (this.socket)
		{
			if (this.socket.readyState === 1)
			{
				// already connected
				return true;
			}
			else
			{
				this.socket.removeEventListener('open', this.onSocketOpenHandler);
				this.socket.removeEventListener('close', this.onSocketCloseHandler);
				this.socket.removeEventListener('error', this.onSocketErrorHandler);
				this.socket.removeEventListener('message', this.onSocketMessageHandler);
				
				this.socket.close();
				this.socket = null;
			}
		}
		
		this.createSocket();
	}
	
	disconnect(code, message)
	{
		if (this.socket !== null)
		{
			this.socket.removeEventListener('open', this.onSocketOpenHandler);
			this.socket.removeEventListener('close', this.onSocketCloseHandler);
			this.socket.removeEventListener('error', this.onSocketErrorHandler);
			this.socket.removeEventListener('message', this.onSocketMessageHandler);
			
			this.socket.close(code, message);
		}
		this.socket = null;
		this.disconnectCode = code;
		this.disconnectReason = message;
		this.connected = false;
	}
	
	createSocket()
	{
		if (this.socket)
		{
			throw new Error("Socket already exists");
		}
		
		if (!this.path)
		{
			throw new Error("Websocket connection path is not defined");
		}
		
		this.socket = new WebSocket(this.path);
		this.socket.binaryType = 'arraybuffer';
		
		this.socket.addEventListener('open', this.onSocketOpenHandler);
		this.socket.addEventListener('close', this.onSocketCloseHandler);
		this.socket.addEventListener('error', this.onSocketErrorHandler);
		this.socket.addEventListener('message', this.onSocketMessageHandler);
	}
	
	/**
	 * Sends some data to the server via websocket connection.
	 * @param {ArrayBuffer} buffer Data to send.
	 * @return {boolean}
	 */
	send(buffer)
	{
		if (!this.socket || this.socket.readyState !== 1)
		{
			console.error(Utils.getDateForLog() + ": Pull: WebSocket is not connected");
			return false;
		}
		
		this.socket.send(buffer);
		return true;
	}
	
	onSocketOpen()
	{
		this.connected = true;
	}
	
	onSocketClose(e)
	{
		this.socket = null;
		this.disconnectCode = e.code;
		this.disconnectReason = e.reason;
		this.connected = false;
	}
	
	onSocketError(e)
	{
		this.callbacks.onError(e);
	}
	
	onSocketMessage(e)
	{
		this.callbacks.onMessage(e.data);
	}
	
	destroy()
	{
		if (this.socket)
		{
			this.socket.close();
			this.socket = null;
		}
	}
}