import {AbstractHelper, UnhandledMatchError} from './abstractHelper'
import type {BoolString, ISODate, NumberString} from "../types/common";
import type {Currency} from "../types/characteristics";
import { restoreDate } from "../tools/useFormatters";
import type FormatterNumbers from "../tools/formatters/numbers";

type CurrencyInit = {
	AMOUNT: NumberString
	AMOUNT_CNT: NumberString
	BASE: BoolString
	CURRENCY: string
	DATE_UPDATE: ISODate
	DECIMALS: NumberString
	DEC_POINT: string
	FORMAT_STRING: string
	FULL_NAME: string
	LID: string
	SORT: NumberString
	THOUSANDS_SEP?: string
}

type CurrencyInitData = {
	currencyBase: string,
	currencyList: CurrencyInit[],
}

type CurrencyData = {
	currencyBase: string,
	currencyList: Map<string, Currency>,
}

export class CurrencyManager
	extends AbstractHelper
{
	/**
	 * @inheritDoc
	 */
	initData(data: CurrencyInitData): void
	{
		this._data = {
			currencyBase: '?',
			currencyList: new Map(),
		} as CurrencyData
		
		this.setBaseCurrency(data.currencyBase)
		this.setCurrencyList(data.currencyList)

		console.log(data)
	}
	
	get data(): CurrencyData
	{
		if(null === this._data)
		{
			throw new Error('CurrencyManager.data not initialized')
		}
		
		return this._data
	}
	
	// region BaseCurrency ////
	setBaseCurrency(currencyBase: string)
	{
		this._data.currencyBase = currencyBase;
	}
	
	get baseCurrency(): string
	{
		return this.data.currencyBase
	}
	// endregion ////
	
	// region CurrencyList ////
	setCurrencyList(list: CurrencyInit[] = [])
	{
		this.data.currencyList.clear();
		
		list.forEach((row) => {
			this.data.currencyList.set(
				row.CURRENCY,
				{
					amount: parseFloat(row.CURRENCY),
					amountCnt: parseInt(row.AMOUNT_CNT),
					isBase: row.BASE === 'Y',
					currency: row.CURRENCY,
					dateUpdate: restoreDate(row.DATE_UPDATE),
					decimals: parseInt(row.DECIMALS),
					decPoint: row.DEC_POINT,
					formatString: row.FORMAT_STRING,
					fullName: row.FULL_NAME,
					lid: row.LID,
					sort: parseInt(row.SORT),
					thousandsSep: row?.THOUSANDS_SEP || null
				} as Currency
			)
		})
	}
	// endregion ////
	
	// region Info ////
	getCurrencyFullName(currency: string): string
	{
		if(!this.data.currencyList.has(currency))
		{
			throw new UnhandledMatchError(currency)
		}
		
		return this.data.currencyList.get(currency)?.fullName || ''
	}
	
	getCurrencyLiteral(currency: string): string
	{
		if(!this.data.currencyList.has(currency))
		{
			throw new UnhandledMatchError(currency)
		}
		
		return this.data.currencyList.get(currency)?.formatString
			.replaceAll('&#', '&%')
			.replaceAll('#', '')
			.replaceAll('&%', '&#')
			.trim()
		|| ''
	}
	
	get currencyList(): string[]
	{
		return Array.from(this.data.currencyList.keys())
	}
	// endregion ////
	
	// region Format ////
	format(
		value: number,
		currency: string,
		formatterNumber: FormatterNumbers,
		isClearSpace: boolean = false
	): string
	{
		if(!this.data.currencyList.has(currency))
		{
			throw new UnhandledMatchError(currency)
		}
		
		let result = this.data.currencyList.get(currency)?.formatString
			.replaceAll('&#', '&%')
			.replace(
				'#', formatterNumber.format(value)
			)
			.replaceAll('&%', '&#')
		|| ''
		
		if(isClearSpace)
		{
			result = result.replaceAll(' ', '');
		}
		
		return result;
	}
	// endregion ////
}