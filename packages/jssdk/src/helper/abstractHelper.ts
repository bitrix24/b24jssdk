import { LoggerBrowser, LoggerType } from '../logger/browser'
import type { IB24 } from '../core/abstractB24'

export class UnhandledMatchError
	extends Error
{
	constructor(value: string, ...args: any[])
	{
		super(...args);
		this.name = 'UnhandledMatchError';
		this.message = `Unhandled match value of type ${value}`;
		this.stack = new Error().stack;
	}
}

export abstract class AbstractHelper
{
	protected _b24: IB24
	protected _logger: null|LoggerBrowser = null
	protected _data: any = null
	
	// region Init ////
	constructor(b24: IB24)
	{
		this._b24 = b24
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
	// endregion ////
	
	/**
	 * Initializes the data received
	 * @param data
	 */
	abstract initData(data: any): void
	
	abstract get data(): any
}