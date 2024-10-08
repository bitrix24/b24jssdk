export default class FormatterDateTime
{
	private static isInternalConstructing: boolean = false
	private static instance: FormatterDateTime|null = null
	private formatter: Intl.DateTimeFormat
	private readonly locale: string
	
	private constructor(
		locale: string = 'en-US'
	)
	{
		if(!FormatterDateTime.isInternalConstructing)
		{
			throw new TypeError('FormatterDateTime is not constructable')
		}
		FormatterDateTime.isInternalConstructing = false
		this.locale = locale
		
		this.formatter = new Intl.DateTimeFormat(this.locale)
	}
	
	/**
	 * @param locale
	 * @return FormatterDateTime
	 */
	static getInstance(
		locale: string = 'en-US'
	): FormatterDateTime
	{
		if(!FormatterDateTime.instance)
		{
			FormatterDateTime.isInternalConstructing = true;
			FormatterDateTime.instance = new FormatterDateTime(locale);
		}
		
		return FormatterDateTime.instance;
	}
	
	format(value: Date): string
	{
		return this.formatter.format(value);
	}
	
	/**
	 * Convert Date to string
	 *
	 * @param {Date|null} date
	 * @param {string} template
	 * @returns {string}
	 */
	formatDate(
		date?: Date,
		template?: string
	): string
	{
		if(!date)
		{
			date = new Date()
		}
		
		if(!template)
		{
			template = 'Y-m-d H:i:s'
		}
		
		const padZero = (num: number): string => num.toString().padStart(2, '0')
		
		const year = date.getFullYear()
		const month = padZero(date.getMonth() + 1)
		const day = padZero(date.getDate())
		const hours = padZero(date.getHours())
		const minutes = padZero(date.getMinutes())
		const seconds = padZero(date.getSeconds())
		
		return template
			.replace('Y', year.toString())
			.replace('m', month)
			.replace('d', day)
			.replace('H', hours)
			.replace('i', minutes)
			.replace('s', seconds)
	}
	
	/**
	 * Convert string to Date
	 *
	 * @param {string} dateString
	 * @param {string} template
	 * @returns {Date}
	 *
	 * console.log(formatterDateTime.restoreDate('2023-10-04', 'Y-m-d')); // Wed Oct 04 2023 00:00:00 GMT+0000
	 * console.log(formatterDateTime.restoreDate('04.10.2023', 'd.m.Y')); // Wed Oct 04 2023 00:00:00 GMT+0000
	 * console.log(formatterDateTime.restoreDate('2023-10-04 14:05:56', 'Y-m-d H:i:s')); // Wed Oct 04 2023 14:05:56 GMT+0000
	 * console.log(formatterDateTime.restoreDate('2023-10-04T14:05:56+03:00', 'Y-m-dTH:i:s+ZZ')); // Wed Oct 04 2023 11:05:56 GMT+0000
	 */
	restoreDate(
		dateString: string,
		template: string
	): Date
	{
		const formatTokens: Record<string, string> = {
			Y: '(\\d{4})',
			m: '(\\d{2})',
			d: '(\\d{2})',
			H: '(\\d{2})',
			i: '(\\d{2})',
			s: '(\\d{2})',
			T: 'T',
			Z: '([+-]\\d{2}:\\d{2})'
		}
		
		const escapedFormat = template.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
		const regexPattern = Object.keys(formatTokens).reduce((pattern, token) =>
		{
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
}