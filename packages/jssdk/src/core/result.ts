/**
 * Interface defining the structure and methods of a Result object.
 */
export interface IResult {
	/**
	 * Indicates whether the operation resulted in success (no errors).
	 */
	isSuccess: boolean

	/**
	 * Sets the data associated with the result.
	 *
	 * @param data The data to be stored in the result.
	 * @returns The current Result object for chaining methods.
	 */
	setData: (data: any) => IResult

	/**
	 * Retrieves the data associated with the result.
	 *
	 * @returns The data stored in the result, if any.
	 */
	getData: () => any

	/**
	 * Adds an error message or Error object to the result.
	 *
	 * @param error The error message or Error object to be added.
	 * @returns The current Result object for chaining methods.
	 */
	addError: (error: Error | string) => IResult

	/**
	 * Adds multiple errors to the result in a single call.
	 *
	 * @param errors An array of errors or strings that will be converted to errors.
	 * @returns The current Result object for chaining methods.
	 */
	addErrors: (errors: (Error | string)[]) => IResult

	/**
	 * Retrieves an iterator for the errors collected in the result.
	 *
	 * @returns An iterator over the stored Error objects.
	 */
	getErrors: () => IterableIterator<Error>

	/**
	 * Retrieves an array of error messages from the collected errors.
	 *
	 * @returns An array of strings representing the error messages.
	 */
	getErrorMessages: () => string[]

	/**
	 * Converts the Result object to a string.
	 *
	 * @returns {string} Returns a string representation of the result operation
	 */
	toString: () => string
}

/**
 * A class representing an operation result with success/failure status, data, and errors.
 * Similar to \Bitrix\Main\Result from Bitrix Framework.
 * @link https://dev.1c-bitrix.ru/api_d7/bitrix/main/result/index.php
 */
export class Result implements IResult {
	private _errorCollection: Set<Error>
	protected _data: any

	constructor() {
		this._errorCollection = new Set()
		this._data = null
	}

	/**
	 * Getter for the `isSuccess` property.
	 * Checks if the `_errorCollection` is empty to determine success.
	 *
	 * @returns Whether the operation resulted in success (no errors).
	 */
	get isSuccess(): boolean {
		return this._errorCollection.size === 0
	}

	/**
	 * Sets the data associated with the result.
	 *
	 * @param data The data to be stored in the result.
	 * @returns The current Result object for chaining methods.
	 */
	setData(data: any): Result {
		this._data = data

		return this
	}

	/**
	 * Retrieves the data associated with the result.
	 *
	 * @returns The data stored in the result, if any.
	 */
	getData(): any {
		return this._data
	}

	/**
	 * Adds an error message or Error object to the result.
	 *
	 * @param error The error message or Error object to be added.
	 * @returns The current Result object for chaining methods.
	 */
	addError(error: Error | string): Result {
		if (error instanceof Error) {
			this._errorCollection.add(error)
		} else {
			this._errorCollection.add(new Error(error.toString()))
		}

		return this
	}

	/**
	 * Adds multiple errors to the result in a single call.
	 *
	 * @param errors An array of errors or strings that will be converted to errors.
	 * @returns The current Result object for chaining methods.
	 */
	addErrors(errors: (Error | string)[]): Result {
		for (const error of errors) {
			if (error instanceof Error) {
				this._errorCollection.add(error)
			} else {
				this._errorCollection.add(new Error(error.toString()))
			}
		}

		return this
	}

	/**
	 * Retrieves an iterator for the errors collected in the result.
	 * @returns An iterator over the stored Error objects.
	 */
	getErrors(): IterableIterator<Error> {
		return this._errorCollection.values()
	}

	/**
	 * Retrieves an array of error messages from the collected errors.
	 *
	 * @returns An array of strings representing the error messages. Each string
	 *          contains the message of a corresponding error object.
	 */
	getErrorMessages(): string[] {
		return [...this.getErrors()].map((error: Error) => error.message)
	}

	/**
	 * Converts the Result object to a string.
	 *
	 * @returns {string} Returns a string representation of the result operation
	 */
	toString(): string {
		if (this.isSuccess) {
			return `Result (success): data: ${JSON.stringify(this._data)}`
		}

		return `Result (failure): errors: ${this.getErrorMessages().join(', ')}`
	}
}
