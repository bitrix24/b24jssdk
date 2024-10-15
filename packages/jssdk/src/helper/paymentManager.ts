import { AbstractHelper } from './abstractHelper'
import type { TypePayment } from '../types/characteristics'

export class PaymentManager
	extends AbstractHelper
{
	protected override _data: null|TypePayment = null
	
	/**
	 * @inheritDoc
	 */
	initData(data: TypePayment): void
	{
		this._data = data
	}
	
	get data(): TypePayment
	{
		if(null === this._data)
		{
			throw new Error('PaymentManager.data not initialized')
		}
		
		return this._data
	}
}