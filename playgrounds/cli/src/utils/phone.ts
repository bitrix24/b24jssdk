import type { Language } from '../types'
import { COUNTRY_CODES } from '../constants'

/**
 * Generates a random phone number with an international country code.
 *
 * The function matches the passed language with the phone code from {@link COUNTRY_CODES}
 * and appends a random 10-digit number to it.
 *
 * @param {Language} language - The language/country for which to generate the number.
 * Acceptable values are defined in the {@link LANGUAGES} array.
 *
 * @returns {string} A string in the format: `+[code][number]`.
 *
 * @example
 * generatePhoneNumber('russian'); // Returns: "+7XXXXXXXXXX"
 *
 * @see COUNTRY_CODES
 */
export function generatePhoneNumber(language: Language): string {
  const code = COUNTRY_CODES[language]

  const number = Math.floor(1000000000 + Math.random() * 9000000000)
  return `${code}${number}`
}
