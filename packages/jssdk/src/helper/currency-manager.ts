import { AbstractHelper, UnhandledMatchError } from './abstract-helper'
import type { BoolString, ISODate, NumberString } from '../types/common'
import type { Currency, CurrencyFormat } from '../types/b24-helper'
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
  THOUSANDS_SEP?: string
  LANG?: Record<string, CurrencyFormatInit>
}

type CurrencyInitData = {
  currencyBase: string
  currencyList: CurrencyInit[]
}

type CurrencyData = {
  currencyBase: string
  currencyList: Map<string, Currency>
}

export class CurrencyManager extends AbstractHelper {
  /**
   * @inheritDoc
   */
  override async initData(data: CurrencyInitData): Promise<void> {
    this._data = {
      currencyBase: '?',
      currencyList: new Map()
    } as CurrencyData

    this.setBaseCurrency(data.currencyBase)
    this.setCurrencyList(data.currencyList)

    try {
      await this.loadData()
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }

      console.error(error)
      throw new Error('Failed to load data')
    }
  }

  async loadData(): Promise<void> {
    const batchRequest: {
      method: string
      params: { id: string }
    }[] = this.currencyList.map((currencyCode) => {
      return {
        method: 'crm.currency.get',
        params: {
          id: currencyCode
        }
      }
    })

    if (batchRequest.length === 0) {
      return Promise.resolve()
    }

    try {
      const response = await this._b24.callBatchByChunk(batchRequest, true)
      const data = response.getData()

      data.forEach((row: CurrencyInit) => {
        if (typeof row.LANG === 'undefined') {
          return
        }

        const currencyCode = row.CURRENCY
        const currency = this.data.currencyList.get(currencyCode)
        if (typeof currency === 'undefined') {
          return
        }

        for (const [langCode, formatData] of Object.entries(row.LANG)) {
          currency.lang[langCode] = {
            decimals: Number.parseInt(formatData.DECIMALS),
            decPoint: formatData.DEC_POINT,
            formatString: formatData.FORMAT_STRING,
            fullName: formatData.FULL_NAME,
            isHideZero: formatData.HIDE_ZERO === 'Y',
            thousandsSep: formatData.THOUSANDS_SEP,
            thousandsVariant: formatData.THOUSANDS_VARIANT
          } as CurrencyFormat

          switch (currency.lang[langCode].thousandsVariant) {
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
              // case 'OWN': ////
            default:
              if (!Type.isStringFilled(currency.lang[langCode].thousandsSep)) {
                currency.lang[langCode].thousandsSep = ' '
              }
              break
          }
        }
      })
    } catch (error) {
      console.error(error)
    }
  }

  get data(): CurrencyData {
    if (null === this._data) {
      throw new Error('CurrencyManager.data not initialized')
    }

    return this._data
  }

  // region BaseCurrency ////
  setBaseCurrency(currencyBase: string) {
    this._data.currencyBase = currencyBase
  }

  get baseCurrency(): string {
    return this.data.currencyBase
  }
  // endregion ////

  // region CurrencyList ////
  setCurrencyList(list: CurrencyInit[] = []) {
    this.data.currencyList.clear()

    for (const row of list) {
      this.data.currencyList.set(row.CURRENCY, {
        amount: Number.parseFloat(row.CURRENCY),
        amountCnt: Number.parseInt(row.AMOUNT_CNT),
        isBase: row.BASE === 'Y',
        currencyCode: row.CURRENCY,
        dateUpdate: Text.toDateTime(row.DATE_UPDATE),
        decimals: Number.parseInt(row.DECIMALS),
        decPoint: row.DEC_POINT,
        formatString: row.FORMAT_STRING,
        fullName: row.FULL_NAME,
        lid: row.LID,
        sort: Number.parseInt(row.SORT),
        thousandsSep: row?.THOUSANDS_SEP || null,
        lang: {}
      } as Currency)
    }
  }
  // endregion ////

  // region Info ////
  getCurrencyFullName(currencyCode: string, langCode: string): string {
    const currency = this.data.currencyList.get(currencyCode)
    if (typeof currency === 'undefined') {
      throw new UnhandledMatchError(currencyCode)
    }

    let fullName = currency.fullName

    if (!(typeof langCode === 'undefined')) {
      const langFormatter = currency.lang[langCode]
      if (!Type.isUndefined(langFormatter)) {
        fullName = langFormatter.fullName
      }
    }

    return fullName
  }

  getCurrencyLiteral(currencyCode: string, langCode?: string): string {
    const currency = this.data.currencyList.get(currencyCode)
    if (typeof currency === 'undefined') {
      throw new UnhandledMatchError(currencyCode)
    }

    let formatString = currency.formatString

    if (!(typeof langCode === 'undefined')) {
      const langFormatter = currency.lang[langCode]
      if (!Type.isUndefined(langFormatter)) {
        formatString = langFormatter.formatString
      }
    }

    return (
      formatString
        .replaceAll('&#', '&%')
        .replaceAll('#', '')
        .replaceAll('&%', '&#')
        .trim() || ''
    )
  }

  get currencyList(): string[] {
    return [...this.data.currencyList.keys()]
  }
  // endregion ////

  // region Format ////
  format(value: number, currencyCode: string, langCode: string): string {
    const currency = this.data.currencyList.get(currencyCode)
    if (typeof currency === 'undefined') {
      throw new UnhandledMatchError(currencyCode)
    }

    const options = {
      formatString: currency.formatString,
      decimals: currency.decimals,
      decPoint: currency.decPoint,
      thousandsSep: currency.thousandsSep
    }
    if (!Type.isStringFilled(options.thousandsSep)) {
      options.thousandsSep = ''
    }

    const langFormatter = currency.lang[langCode]
    if (!Type.isUndefined(langFormatter)) {
      options.formatString = langFormatter.formatString
      options.decimals = langFormatter.decimals
      options.decPoint = langFormatter.decPoint
      options.thousandsSep = langFormatter.thousandsSep
    }

    return (
      options.formatString
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
        .replaceAll('&%', '&#') || ''
    )
  }
  // endregion ////
}
