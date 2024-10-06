import { LoggerBrowser, LoggerType } from "../../logger/browser";

type RestrictionManagerParams = {
	sleep: number
	speed: number
	amount: number
}

export default class RestrictionManager
{
	#param: RestrictionManagerParams;
	#lastDecrement: number;
	#currentAmount: number;
	
	private _logger: null|LoggerBrowser = null;
	
	constructor()
	{
		this.#param = {
			sleep: 1_000,
			speed: 0.001,
			amount: 30
		};
		
		this.#currentAmount = 0;
		this.#lastDecrement = 0;
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
				[LoggerType.error]: false,
				[LoggerType.trace]: false,
			})
		}
		
		return this._logger;
	}
	
	check(
		hash: string = ''
	): Promise<null>
	{
		return new Promise(resolve => {
			this.#decrementStorage();
			
			if(this.#checkStorage())
			{
				this.getLogger().log(`>> no sleep >>> ${hash}`, this.#getStorageStatus());
				this.#incrementStorage();
				
				return resolve(null);
			}
			else
			{
				const sleep = (callback: Function) => {
					this.getLogger().info(`>> go sleep >>> ${hash}`, this.#getStorageStatus());
					setTimeout(() => {
						callback();
					}, this.#param.sleep);
				};
				
				const wait = () => {
					this.#decrementStorage();
					if(!this.#checkStorage())
					{
						sleep(wait);
					}
					else
					{
						this.getLogger().info(`<< stop sleep <<< ${hash}`, this.#getStorageStatus());
						this.#incrementStorage();
						return resolve(null);
					}
				};
				
				sleep(wait);
			}
		});
	}
	
	#getStorageStatus()
	{
		return `${this.#currentAmount.toFixed(4)} from ${this.#param.amount}`
	}
	
	#decrementStorage(): void
	{
		if(this.#lastDecrement > 0)
		{
			this.#currentAmount -= ((new Date()).valueOf() - this.#lastDecrement) * this.#param.speed;
			
			if(this.#currentAmount < 0)
			{
				this.#currentAmount = 0;
			}
		}
		
		this.#lastDecrement = (new Date()).valueOf();
	}
	
	#incrementStorage(): void
	{
		this.#currentAmount++;
	}
	
	#checkStorage(): boolean
	{
		return this.#currentAmount < this.#param.amount;
	}
}
