export class IbanSpecification
{
	/**
	 * the code of the country
	 */
	readonly countryCode: string;
	
	/**
	 * the length of the IBAN
	 */
	readonly length: number;
	
	/**
	 * the structure of the underlying BBAN (for validation and formatting)
	 */
	readonly structure: string;
	
	/**
	 * an example valid IBAN
	 */
	readonly example: string;
	
	private _cachedRegex: null|RegExp = null;
	
	constructor(
		countryCode: string,
		length: number,
		structure: string,
		example: string
	)
	{
		this.countryCode = countryCode;
		this.length = length;
		this.structure = structure;
		this.example = example;
	}
	
	/**
	 * Check if the passed iban is valid according to this specification.
	 *
	 * @param {String} iban the iban to validate
	 * @returns {boolean} true if valid, false otherwise
	 */
	isValid(iban: string): boolean
	{
		return this.length === iban.length
			&& this.countryCode === iban.slice(0,2)
			&& this._regex().test(iban.slice(4))
			&& this._iso7064Mod9710(this._iso13616Prepare(iban)) == 1
	}
	
	/**
	 * Convert the passed IBAN to a country-specific BBAN.
	 *
	 * @param iban the IBAN to convert
	 * @param separator the separator to use between BBAN blocks
	 * @returns {string} the BBAN
	 */
	toBBAN(
		iban: string,
		separator: string
	): string
	{
		return (this._regex().exec((iban.slice(4) || '')) || []).slice(1).join(separator)
	}
	
	/**
	 * Convert the passed BBAN to an IBAN for this country specification.
	 * Please note that <i>"generation of the IBAN shall be the exclusive responsibility of the bank/branch servicing the account"</i>.
	 * This method implements the preferred algorithm described in http://en.wikipedia.org/wiki/International_Bank_Account_Number#Generating_IBAN_check_digits
	 *
	 * @param bban the BBAN to convert to IBAN
	 * @returns {string} the IBAN
	 */
	fromBBAN(
		bban: string
	): string
	{
		if(!this.isValidBBAN(bban))
		{
			throw new Error('Invalid BBAN')
		}
		
		const remainder = this._iso7064Mod9710(
			this._iso13616Prepare(
				this.countryCode + '00' + bban
			)
		)
		
		const checkDigit = ('0' + (98 - remainder)).slice(-2)
		
		return this.countryCode + checkDigit + bban;
	};
	
	/**
	 * Check of the passed BBAN is valid.
	 * This function only checks the format of the BBAN (length and matching the letetr/number specs) but does not
	 * verify the check digit.
	 *
	 * @param bban the BBAN to validate
	 * @returns {boolean} true if the passed bban is a valid BBAN according to this specification, false otherwise
	 */
	isValidBBAN(
		bban: string
	): boolean
	{
		return this.length - 4 === bban.length
			&& this._regex().test(bban)
	}
	
	/**
	 * Lazy-loaded regex (parse the structure and construct the regular expression the first time we need it for validation)
	 */
	private _regex(): RegExp
	{
		if(null === this._cachedRegex)
		{
			this._cachedRegex = this._parseStructure(this.structure)
		}
		
		return this._cachedRegex
	}
	
	/**
	 * Parse the BBAN structure used to configure each IBAN Specification and returns a matching regular expression.
	 * A structure is composed of blocks of 3 characters (one letter and 2 digits). Each block represents
	 * a logical group in the typical representation of the BBAN. For each group, the letter indicates which characters
	 * are allowed in this group and the following 2-digits number tells the length of the group.
	 *
	 * @param {string} structure the structure to parse
	 * @returns {RegExp}
	 */
	private _parseStructure(
		structure: string
	): RegExp
	{
		// split in blocks of 3 chars
		const regex = (structure.match(/(.{3})/g) || [])
			.map((block: string): string => {
				
				// parse each structure block (1-char + 2-digits)
				let format
				const pattern = block.slice(0, 1)
				const repeats = parseInt(block.slice(1), 10)
				
				switch(pattern)
				{
					case "A": format = "0-9A-Za-z"; break
					case "B": format = "0-9A-Z"; break
					case "C": format = "A-Za-z"; break
					case "F": format = "0-9"; break
					case "L": format = "a-z"; break
					case "U": format = "A-Z"; break
					case "W": format = "0-9a-z"; break
				}
				
				return '([' + format + ']{' + repeats + '})'
			})
		
		return new RegExp('^' + regex.join('') + '$')
	}
	
	/**
	 * Prepare an IBAN for mod 97 computation by moving the first 4 chars to the end and transforming the letters to
	 * numbers (A = 10, B = 11, ..., Z = 35), as specified in ISO13616.
	 *
	 * @param {string} iban the IBAN
	 * @returns {string} the prepared IBAN
	 */
	private _iso13616Prepare(
		iban: string
	): string
	{
		const A = 'A'.charCodeAt(0)
		const Z = 'Z'.charCodeAt(0)
		
		iban = iban.toUpperCase()
		iban = iban.substring(4) + iban.substring(0,4)
		
		return iban.split('').map((n: string): string => {
			const code = n.charCodeAt(0)
			if(code >= A && code <= Z)
			{
				// A = 10, B = 11, ... Z = 35
				return (code - A + 10).toString()
			}
			else
			{
				return n
			}
		}).join('')
	}
	
	/**
	 * Calculates the MOD 97 10 of the passed IBAN as specified in ISO7064.
	 *
	 * @param iban
	 * @returns {number}
	 */
	private _iso7064Mod9710(
		iban: string
	): number
	{
		let remainder = iban
		let block
		
		while(remainder.length > 2)
		{
			block = remainder.slice(0, 9)
			remainder = parseInt(block, 10) % 97 + remainder.slice(block.length)
		}
		
		return parseInt(remainder, 10) % 97
	}
}

export class FormatterIban
{
	private static isInternalConstructing: boolean = false
	private static instance: FormatterIban | null = null
	
	private _countries: Map<string, IbanSpecification>
	
	// region Init ////
	private constructor()
	{
		if(!FormatterIban.isInternalConstructing)
		{
			throw new TypeError('FormatterIban is not constructable')
		}
		FormatterIban.isInternalConstructing = false
		
		this._countries = new Map()
	}
	
	/**
	 * @return FormatterIban
	 */
	static getInstance(): FormatterIban
	{
		if (!FormatterIban.instance)
		{
			FormatterIban.isInternalConstructing = true;
			FormatterIban.instance = new FormatterIban();
		}
		
		return FormatterIban.instance;
	}
	
	addSpecification(IBAN: IbanSpecification): void
	{
		this._countries.set(
			IBAN.countryCode,
			IBAN
		)
	}
	// endregion ////
	
	// region IBAN ////
	/**
	 * Check if an IBAN is valid.
	 *
	 * @param {String} iban the IBAN to validate.
	 * @returns {boolean} true if the passed IBAN is valid, false otherwise
	 */
	isValid(
		iban: string
	): boolean
	{
		if(!this._isString(iban))
		{
			return false;
		}
		
		iban = this.electronicFormat(iban)
		const countryCode = iban.slice(0, 2)
		
		if(!this._countries.has(countryCode))
		{
			throw new Error(`No country with code ${countryCode}`)
		}
		
		let countryStructure = this._countries.get(countryCode)
		
		return !!countryStructure
			&& countryStructure.isValid(iban)
	}
	
	printFormat(
		iban: string,
		separator?: string
	): string
	{
		if(typeof separator == 'undefined')
		{
			separator = ' ';
		}
		
		const EVERY_FOUR_CHARS =/(.{4})(?!$)/g
		
		return this.electronicFormat(iban)
			.replace(EVERY_FOUR_CHARS, "$1" + separator)
	}
	
	electronicFormat(iban: string): string
	{
		const NON_ALPHANUM = /[^a-zA-Z0-9]/g
		
		return iban.replace(NON_ALPHANUM, '')
			.toUpperCase()
	}
	// endregion ////
	
	// region BBAN ////
	/**
	 * Convert an IBAN to a BBAN.
	 *
	 * @param iban
	 * @param {String} [separator] the separator to use between the blocks of the BBAN, defaults to ' '
	 * @returns {string|*}
	 */
	toBBAN(
		iban: string,
		separator?: string
	): string
	{
		if(typeof separator == 'undefined')
		{
			separator = ' '
		}
		
		iban = this.electronicFormat(iban)
		
		const countryCode = iban.slice(0, 2)
		if(!this._countries.has(countryCode))
		{
			throw new Error(`No country with code ${countryCode}`)
		}
		
		let countryStructure = this._countries.get(countryCode)
		
		if(!countryStructure)
		{
			throw new Error(`No country with code ${countryCode}`)
		}
		
		return countryStructure.toBBAN(
			iban,
			separator
		)
	}
	
	/**
	 * Convert the passed BBAN to an IBAN for this country specification.
	 * Please note that <i>"generation of the IBAN shall be the exclusive responsibility of the bank/branch servicing the account"</i>.
	 * This method implements the preferred algorithm described in http://en.wikipedia.org/wiki/International_Bank_Account_Number#Generating_IBAN_check_digits
	 *
	 * @param countryCode the country of the BBAN
	 * @param bban the BBAN to convert to IBAN
	 * @returns {string} the IBAN
	 */
	fromBBAN(
		countryCode: string,
		bban: string
	): string
	{
		if(!this._countries.has(countryCode))
		{
			throw new Error(`No country with code ${countryCode}`)
		}
		
		let countryStructure = this._countries.get(countryCode)
		
		if(!countryStructure)
		{
			throw new Error(`No country with code ${countryCode}`)
		}
		
		return countryStructure.fromBBAN(
			this.electronicFormat(bban)
		)
	}
	
	/**
	 * Check the validity of the passed BBAN.
	 *
	 * @param countryCode the country of the BBAN
	 * @param bban the BBAN to check the validity of
	 */
	isValidBBAN(
		countryCode: string,
		bban: string
	): boolean
	{
		if(!this._isString(bban))
		{
			return false;
		}
		
		if(!this._countries.has(countryCode))
		{
			throw new Error(`No country with code ${countryCode}`)
		}
		
		let countryStructure = this._countries.get(countryCode)
		
		return !!countryStructure
			&& countryStructure.isValidBBAN(
				this.electronicFormat(bban)
			)
	}
	// endregion ////
	
	// region Tools ////
	private _isString(value: any): boolean
	{
		return (
			typeof value == 'string'
			|| value instanceof String
		);
	}
	// endregion ////
}