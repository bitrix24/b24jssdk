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
	
	private logger: LoggerBrowser;
	
	constructor()
	{
		this.logger = LoggerBrowser.build('b24frame:restriction');
		this.logger.disable(LoggerType.log);
		this.logger.disable(LoggerType.info);
		
		this.#param = {
			sleep: 1_000,
			speed: 0.001,
			amount: 30
		};
		
		this.#currentAmount = 0;
		this.#lastDecrement = 0;
	}
	
	check(
		hash: string = ''
	): Promise<null>
	{
		return new Promise(resolve => {
			this.#decrementStorage();
			
			if(this.#checkStorage())
			{
				this.logger.log(`>> no sleep >>> ${hash}`, this.#getStorageStatus());
				this.#incrementStorage();
				
				return resolve(null);
			}
			else
			{
				const sleep = (callback: Function) => {
					this.logger.info(`>> go sleep >>> ${hash}`, this.#getStorageStatus());
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
						this.logger.info(`<< stop sleep <<< ${hash}`, this.#getStorageStatus());
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
