import Type from './type'

const reEscape = /[&<>'"]/g
const reUnescape = /&(?:amp|#38|lt|#60|gt|#62|apos|#39|quot|#34)/g

const escapeEntities: Record<string, string> = {
	'&': '&amp',
	'<': '&lt',
	'>': '&gt',
	"'": '&#39',
	'"': '&quot',
}

const unescapeEntities: Record<string, string> = {
	'&amp': '&',
	'&#38': '&',
	'&lt': '<',
	'&#60': '<',
	'&gt': '>',
	'&#62': '>',
	'&apos': "'",
	'&#39': "'",
	'&quot': '"',
	'&#34': '"',
}

/**
 * The `Text` class provides a set of utility methods for working with text data.
 * It includes functions for encoding and decoding HTML entities, generating random strings,
 * converting values to different data types, and changing the case and format of strings
 *
 * @see bitrix/js/main/core/src/lib/text.js
 */
export default class Text
{
	/**
	 * Encodes all unsafe entities
	 * @param {string} value
	 * @return {string}
	 */
	static encode(value: string): string
	{
		if (Type.isString(value))
		{
			return value.replace(reEscape, item => escapeEntities[item])
		}

		return value
	}

	/**
	 * Decodes all encoded entities
	 * @param {string} value
	 * @return {string}
	 */
	static decode(value: string): string
	{
		if (Type.isString(value))
		{
			return value.replace(reUnescape, item => unescapeEntities[item])
		}

		return value
	}

	static getRandom(length = 8): string
	{
		// eslint-disable-next-line
		return [...Array(length)].map(() => (~~(Math.random() * 36)).toString(36)).join('')
	}
	
	/**
	 * Generates UUID
	 */
	static getUniqId(): string
	{
		return 'xxxxxxxx-xlsx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
			const r = Math.random() * 16 | 0
			const v = c === 'x' ? r : (r & 0x3 | 0x8)
			return v.toString(16)
		})
	}

	static toNumber(value: any): number
	{
		const parsedValue = Number.parseFloat(value)

		if (Type.isNumber(parsedValue))
		{
			return parsedValue
		}

		return 0
	}

	static toInteger(value: any): number
	{
		return Text.toNumber(Number.parseInt(value, 10))
	}

	static toBoolean(value: any, trueValues = []): boolean
	{
		const transformedValue = Type.isString(value) ? value.toLowerCase() : value
		return ['true', 'y', '1', 1, true, ...trueValues].includes(transformedValue)
	}
	
	static toCamelCase(str: string): string
	{
		if (!Type.isStringFilled(str))
		{
			return str
		}

		const regex = /[-_\s]+(.)?/g
		if (!regex.test(str))
		{
			return str.match(/^[A-Z]+$/) ? str.toLowerCase() : str[0].toLowerCase() + str.slice(1)
		}

		str = str.toLowerCase()
		str = str.replace(regex, (_match: string, letter) => letter ? letter.toUpperCase() : '')

		return str[0].toLowerCase() + str.substring(1)
	}

	static toPascalCase(str: string): string
	{
		if (!Type.isStringFilled(str))
		{
			return str
		}

		return this.capitalize(this.toCamelCase(str))
	}

	static toKebabCase(str: string): string
	{
		if (!Type.isStringFilled(str))
		{
			return str
		}

		const matches = str.match(/[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g)
		if (!matches)
		{
			return str
		}

		return matches.map(x => x.toLowerCase()).join('-')
	}

	static capitalize(str: string): string
	{
		if (!Type.isStringFilled(str))
		{
			return str
		}

		return str[0].toUpperCase() + str.substring(1)
	}
	
	static numberFormat(
		number: number,
		decimals: number = 0,
		decPoint: string = '.',
		thousandsSep: string = ','
	): string
	{
		const n = !Number.isFinite(number) ? 0 : number
		const fractionDigits = !Number.isFinite(decimals) ? 0 : Math.abs(decimals)
		
		const toFixedFix = (n: number, fractionDigits: number): number => {
			const k = Math.pow(10, fractionDigits)
			return Math.round(n * k) / k
		}
		
		let s = (fractionDigits ? toFixedFix(n, fractionDigits) : Math.round(n)).toString().split('.')
		
		if (s[0].length > 3) {
			s[0] = s[0].replace(/\B(?=(?:\d{3})+(?!\d))/g, thousandsSep)
		}
		
		if ((s[1] || '').length < fractionDigits) {
			s[1] = s[1] || ''
			s[1] += new Array(fractionDigits - s[1].length + 1).join('0')
		}
		
		return s.join(decPoint)
	}
	
	/**
	 * Convert string to Date
	 *
	 * @param {string} dateString
	 * @param {string} template
	 * @returns {Date}
	 *
	 * console.log(Text.toDate('2023-10-04', 'Y-m-d')); // Wed Oct 04 2023 00:00:00 GMT+0000
	 * console.log(Text.toDate('04.10.2023', 'd.m.Y')); // Wed Oct 04 2023 00:00:00 GMT+0000
	 * console.log(Text.toDate('2023-10-04 14:05:56', 'Y-m-d H:i:s')); // Wed Oct 04 2023 14:05:56 GMT+0000
	 * console.log(Text.toDate('2023-10-04T14:05:56+03:00', 'Y-m-dTH:i:sZ')); // Wed Oct 04 2023 11:05:56 GMT+0000
	 */
	static toDate (
		dateString: string,
		template: string = 'Y-m-dTH:i:sZ'
	): Date
	{
		const formatTokens: Record<string, string> = {
			d: '(\\d{2})',
			Y: '(\\d{4})',
			m: '(\\d{2})',
			H: '(\\d{2})',
			i: '(\\d{2})',
			s: '(\\d{2})',
			T: 'T',
			Z: '([+-]\\d{2}:\\d{2})'
		}
		
		const escapedFormat = template.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
		const regexPattern = Object.keys(formatTokens).reduce((pattern, token) => {
			return pattern.replace(token, formatTokens[token])
		}, escapedFormat)
		
		const regex = new RegExp(`^${regexPattern}$`)
		const match = dateString.match(regex)
		
		if(!match)
		{
			throw new Error('Date string does not match the format')
		}
		
		const dateComponents: Record<string, number> = {
			Y: 0,
			m: 1,
			d: 1,
			H: 0,
			i: 0,
			s: 0
		}
		
		// Start from 1 because match[0] is the full match
		let index = 1
		for(const token of template)
		{
			if(formatTokens[token])
			{
				dateComponents[token] = parseInt(match[index++], 10)
			}
		}
		
		// Adjust month index for JavaScript Date (0-based)
		dateComponents['m'] -= 1
		
		// Handle timezone offset if present
		if(template.includes('Z') && match[index])
		{
			const timezoneOffset = match[index]
			const [hoursOffset, minutesOffset] = timezoneOffset.split(':').map(Number)
			const totalOffsetMinutes = hoursOffset * 60 + minutesOffset
			const offsetSign = timezoneOffset.startsWith('+') ? -1 : 1
			const offsetInMilliseconds = offsetSign * totalOffsetMinutes * 60 * 1000
			
			return new Date(Date.UTC(
				dateComponents['Y'],
				dateComponents['m'],
				dateComponents['d'],
				dateComponents['H'],
				dateComponents['i'],
				dateComponents['s']
			) + offsetInMilliseconds)
		}
		
		return new Date(Date.UTC(
			dateComponents['Y'],
			dateComponents['m'],
			dateComponents['d'],
			dateComponents['H'],
			dateComponents['i'],
			dateComponents['s']
		))
	}
	
	static getDateForLog(): string
	{
		const d = new Date()
		
		return `${d.getFullYear()}-${Text.lpad(d.getMonth().toString(), 2, '0')}-${Text.lpad(d.getDate().toString(), 2, '0')} ${Text.lpad(d.getHours().toString(), 2, '0')}:${Text.lpad(d.getMinutes().toString(), 2, '0')}`
	}
	
	static lpad(
		str: string,
		length: number,
		chr: string = ' '
	): string
	{
		if(str.length > length)
		{
			return str
		}
	
		let result = ''
		for (let i = 0; i < (length - str.length); i++)
		{
			result += chr
		}
		
		return result + str
	}
	
	static buildQueryString(params: any): string
	{
		let result = ''
		for(let key in params)
		{
			if(!params.hasOwnProperty(key))
			{
				continue
			}
			
			const value = params[key]
			if(Type.isArray(value))
			{
				value.forEach((valueElement: any, index: any) => {
					result += encodeURIComponent(key + "[" + index + "]") + "=" + encodeURIComponent(valueElement) + "&"
				})
			}
			else
			{
				result += encodeURIComponent(key) + "=" + encodeURIComponent(value) + "&"
			}
		}
		
		if (result.length > 0)
		{
			result = result.substring(0, result.length - 1)
		}
		
		return result
	}
}