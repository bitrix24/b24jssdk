import {AbstractHelper} from './abstractHelper'

type OptionsInitData = {

}

export class OptionsManager
	extends AbstractHelper
{
	/**
	 * @inheritDoc
	 */
	initData(data: OptionsInitData): void
	{
		console.log(data)
	}
	
	get data(): OptionsInitData
	{
		if(null === this._data)
		{
			throw new Error('OptionsManager.data not initialized')
		}
		
		return this._data
	}
}