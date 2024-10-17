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
}