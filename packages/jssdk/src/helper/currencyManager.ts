import { AbstractHelper, UnhandledMatchError } from './abstractHelper'
import type { BoolString, ISODate, NumberString } from "../types/common"
import type { Currency, CurrencyFormat } from '../types/characteristics'
import { restoreDate } from '../tools/useFormatters'
import Type from '../tools/type'
import Text from '../tools/text'

type CurrencyFormatInit = {
	DECIMALS: NumberString
	DEC_POINT: string
	FORMAT_STRING: string
	FULL_NAME: string
	HIDE_ZERO: BoolString
	THOUSANDS_SEP?: string
	THOUSANDS_VARIANT: string
}

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
	THOUSANDS_SEP?: string,
	LANG?: Record<string, CurrencyFormatInit>
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
	override async initData(data: CurrencyInitData): Promise<void>
	{
		this._data = {
			currencyBase: '?',
			currencyList: new Map(),
		} as CurrencyData
		
		this.setBaseCurrency(data.currencyBase)
		this.setCurrencyList(data.currencyList)
		
		try
		{
			await this.loadData()
		}
		catch(error)
		{
			console.error(error)
			throw new Error('Failed to load data')
		}
	}
	
	chunkArray<T>(array: T[], chunkSize: number = 50): T[][]
	{
		const result: T[][] = [];
		for(let i = 0; i < array.length; i += chunkSize)
		{
			const chunk = array.slice(i, i + chunkSize);
			result.push(chunk);
		}
		return result;
	}

	async loadData(): Promise<void>
	{
		const batchRequest: {
			method: string,
			params: {id: string}
		}[] = this.currencyList.map((currencyCode) => {
			return {
				method: 'crm.currency.get',
				params: {
					id: currencyCode
				}
			}
		})
		
		if(batchRequest.length < 1)
		{
			return Promise.resolve()
		}
		
		try
		{
			const data = []
			const chunks = this.chunkArray(batchRequest)
			for(const chunkRequest of chunks)
			{
				const response = await this._b24.callBatch(chunkRequest)
				data.push(...response.getData())
			}
			
			data.forEach((row: CurrencyInit) => {
				if(typeof row.LANG === 'undefined')
				{
					return
				}
				
				const currencyCode = row.CURRENCY
				const currency = this.data.currencyList.get(currencyCode)
				if(typeof currency === 'undefined')
				{
					return
				}
				
				Object.entries(row.LANG).forEach(([langCode, formatData]) => {
					currency.lang[langCode] = {
						decimals: parseInt(formatData.DECIMALS),
						decPoint: formatData.DEC_POINT,
						formatString: formatData.FORMAT_STRING,
						fullName: formatData.FULL_NAME,
						isHideZero: formatData.HIDE_ZERO === 'Y',
						thousandsSep: formatData.THOUSANDS_SEP,
						thousandsVariant: formatData.THOUSANDS_VARIANT,
					} as CurrencyFormat
					
					switch(currency.lang[langCode].thousandsVariant)
					{
						case 'N':
							currency.lang[langCode].thousandsSep = ''
							break
						case 'D':
							currency.lang[langCode].thousandsSep = '.'
							break
						case 'C':
							currency.lang[langCode].thousandsSep = ','
							break
						case 'S':
							currency.lang[langCode].thousandsSep = ' '
							break
						case 'B':
							currency.lang[langCode].thousandsSep = '&nbsp;'
							break
						case 'OWN':
						default:
							if(!Type.isStringFilled(currency.lang[langCode].thousandsSep))
							{
								currency.lang[langCode].thousandsSep = ' '
							}
						break
					}
				});
			})
		}
		catch(error)
		{
			console.error(error)
		}
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
		this._data.currencyBase = currencyBase
	}
	
	get baseCurrency(): string
	{
		return this.data.currencyBase
	}
	// endregion ////
	
	// region CurrencyList ////
	setCurrencyList(list: CurrencyInit[] = [])
	{
		this.data.currencyList.clear()
		
		list.forEach((row) => {
			this.data.currencyList.set(
				row.CURRENCY,
				{
					amount: parseFloat(row.CURRENCY),
					amountCnt: parseInt(row.AMOUNT_CNT),
					isBase: row.BASE === 'Y',
					currencyCode: row.CURRENCY,
					dateUpdate: restoreDate(row.DATE_UPDATE),
					decimals: parseInt(row.DECIMALS),
					decPoint: row.DEC_POINT,
					formatString: row.FORMAT_STRING,
					fullName: row.FULL_NAME,
					lid: row.LID,
					sort: parseInt(row.SORT),
					thousandsSep: row?.THOUSANDS_SEP || null,
					lang: {}
				} as Currency
			)
		})
	}
	// endregion ////
	
	// region Info ////
	getCurrencyFullName(
		currencyCode: string,
		langCode: string
	): string
	{
		const currency = this.data.currencyList.get(currencyCode)
		if(typeof currency === 'undefined')
		{
			throw new UnhandledMatchError(currencyCode)
		}
		
		let fullName = currency.fullName
		
		if(!(typeof langCode === 'undefined'))
		{
			const langFormatter = currency.lang[langCode]
			if(!Type.isUndefined(langFormatter))
			{
				fullName = langFormatter.fullName
			}
		}
		
		return fullName
	}
	
	getCurrencyLiteral(
		currencyCode: string,
		langCode?: string
	): string
	{
		const currency = this.data.currencyList.get(currencyCode)
		if(typeof currency === 'undefined')
		{
			throw new UnhandledMatchError(currencyCode)
		}
		
		let formatString = currency.formatString
		
		if(!(typeof langCode === 'undefined'))
		{
			const langFormatter = currency.lang[langCode]
			if(!Type.isUndefined(langFormatter))
			{
				formatString = langFormatter.formatString
			}
		}
		
		return formatString
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
		currencyCode: string,
		langCode: string
	): string
	{
		const currency = this.data.currencyList.get(currencyCode)
		if(typeof currency === 'undefined')
		{
			throw new UnhandledMatchError(currencyCode)
		}
		
		const options = {
			formatString: currency.formatString,
			decimals: currency.decimals,
			decPoint: currency.decPoint,
			thousandsSep: currency.thousandsSep,
		}
		if(!Type.isStringFilled(options.thousandsSep))
		{
			options.thousandsSep = ''
		}
		
		const langFormatter = currency.lang[langCode]
		if(!Type.isUndefined(langFormatter))
		{
			options.formatString = langFormatter.formatString
			options.decimals = langFormatter.decimals
			options.decPoint = langFormatter.decPoint
			options.thousandsSep = langFormatter.thousandsSep
		}
		
		return options.formatString
			.replaceAll('&#', '&%')
			.replace(
				'#',
				Text.numberFormat(
					value,
					options.decimals,
					options.decPoint,
					options.thousandsSep
				)
			)
			.replaceAll('&%', '&#')
		|| ''
	}
	// endregion ////
}