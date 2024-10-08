export default class FormatterNumbers
{
	private static isInternalConstructing: boolean = false
	private static instance: FormatterNumbers|null = null
	private readonly locale: string
	
	private constructor(
		locale: string = 'en-US'
	)
	{
		if(!FormatterNumbers.isInternalConstructing)
		{
			throw new TypeError('FormatterNumber is not constructable')
		}
		FormatterNumbers.isInternalConstructing = false
		this.locale = locale
	}
	
	/**
	 * @param locale
	 * @return Numbers
	 */
	static getInstance(
		locale: string = 'en-US'
	): FormatterNumbers
	{
		if(!FormatterNumbers.instance)
		{
			FormatterNumbers.isInternalConstructing = true
			FormatterNumbers.instance = new FormatterNumbers(locale)
		}
		return FormatterNumbers.instance
	}
	
	format(
		value: number
	): string
	{
		let formatter = null
		
		if(Number.isInteger(value))
		{
			formatter = new Intl.NumberFormat(
				this.locale,
				{
					minimumFractionDigits: 0,
					maximumFractionDigits: 0
				}
			)
		}
		else
		{
			formatter = new Intl.NumberFormat(
				this.locale,
				{
					minimumFractionDigits: 2,
					maximumFractionDigits: 2
				}
			)
		}
		
		let result = formatter.format(value)
		if(this.locale.includes('ru'))
		{
			result = result.replace(',', '.')
		}
		
		return result
	}
}