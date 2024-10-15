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
}