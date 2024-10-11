import { LoggerBrowser, LoggerType } from '../../index';

import { MessageCommands } from './commands';
import { AppFrame } from '../frame';

import useUniqId from "../../tools/uniqId";

interface PromiseHandlers
{
	resolve: (value: any) => void;
	reject: (reason?: any) => void;
	timeoutId: any;
}

/**
 * Parent Window Request Parameters
 * @prop isSafely auto completion mode Promise.resolve()
 * @prop safelyTime after what time (900 ms) should it be automatically resolved Promise
 */
export interface SendParams {
	[index: string]: any,

	isSafely?: boolean,
	safelyTime?: number,
}

/**
 * Parent Window Communication Manager at B24
 */
export class MessageManager
{
	#appFrame: AppFrame;
	#callbackPromises: Map<string, PromiseHandlers>;
	protected _logger: null|LoggerBrowser = null;
	
	constructor(
		appFrame: AppFrame
	)
	{
		this.#appFrame = appFrame;
		
		this.#callbackPromises = new Map();
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
		
		return this._logger;
	}
	
	// region Events ////
	/**
	 * Subscribe to the onMessage event of the parent window
	 */
	subscribe()
	{
		window.addEventListener(
			'message',
			this.#runCallback.bind(this)
		);
	}
	
	/**
	 * Unsubscribe from the onMessage event of the parent window
	 */
	unsubscribe(): void
	{
		window.removeEventListener(
			'message',
			this.#runCallback.bind(this)
		);
	}
	// endregion ////
	
	/**
	 * Send message to parent window
	 * The answer (if) we will get in #runCallback
	 *
	 * @param command
	 * @param params
	 */
	async send(
		command: string|MessageCommands,
		params: null|SendParams = null
	): Promise<any>
	{
		return new Promise((resolve, reject) => {
			
			let cmd: string|{};
			const promiseHandler: PromiseHandlers = { resolve, reject, timeoutId: null };
			
			const keyPromise = this.#setCallbackPromise(promiseHandler);
			
			if(command.toString().indexOf(':') >= 0)
			{
				cmd = {
					method: command.toString(),
					params: !!params ? params : '',
					callback: keyPromise,
					appSid: this.#appFrame.getAppSid()
				};
			}
			else
			{
				/**
				 * @memo: delete after rest 22.0.0
				 */
				cmd = command.toString();
				let listParams = [
					!!params ? JSON.stringify(params) : null,
					keyPromise,
					this.#appFrame.getAppSid()
				];
				
				cmd += ':' + listParams.filter(Boolean).join(':');
			}
			
			this.getLogger().log(`send to ${this.#appFrame.getTargetOrigin()}`, {cmd});
			
			parent.postMessage(
				cmd,
				this.#appFrame.getTargetOrigin()
			);
			
			if(params?.isSafely)
			{
				// @ts-ignore
				this.#callbackPromises.get(keyPromise).timeoutId = window.setTimeout(
					() => {
						
						if(this.#callbackPromises.has(keyPromise))
						{
							this.getLogger().warn(
								`Action ${command.toString()} stop by timeout`
							);
							
							this.#callbackPromises.delete(keyPromise);
							resolve({isSafely: true});
						}
					},
					parseInt(String(params?.safelyTime || 900))
				);
			}
		});
	}
	
	/**
	 * Fulfilling a promise based on messages from the parent window
	 *
	 * @param event
	 * @private
	 */
	#runCallback(event: MessageEvent): void
	{
		if(event.origin !== this.#appFrame.getTargetOrigin())
		{
			return;
		}
		
		if(!!event.data)
		{
			this.getLogger().log(`get from ${event.origin}`, {
				data: event.data
			});
			
			let tmp = event.data.split(':');
			
			const cmd: { id: string, args: any } = {
				id: tmp[0],
				args: tmp.slice(1).join(':')
			}
			
			if(!!cmd.args)
			{
				cmd.args = JSON.parse(cmd.args);
			}
			
			if(this.#callbackPromises.has(cmd.id))
			{
				const promise = this.#callbackPromises.get(cmd.id) as PromiseHandlers;
				if(!!promise.timeoutId)
				{
					clearTimeout(promise.timeoutId);
				}
				
				this.#callbackPromises.delete(cmd.id);
				
				
				
				promise.resolve(cmd.args);
				// promise.reject(cmd.args); ////
			}
		}
	}
	
	/**
	 * Storing a promise for a message from the parent window
	 *
	 * @param promiseHandler
	 * @private
	 *
	 * @memo We don't use Symbol here, because we need to pass it to the parent and then find and restore it.
	 */
	#setCallbackPromise(promiseHandler: PromiseHandlers): string
	{
		let key = useUniqId();
		
		this.#callbackPromises.set(
			key,
			promiseHandler
		);
		
		return key;
	}
}