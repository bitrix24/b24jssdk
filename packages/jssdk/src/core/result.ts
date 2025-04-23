import Text from '../tools/text'

/**
 * Interface defining the structure and methods of a Result object.
 */
export interface IResult<T = any> {
  /**
   * Indicates whether the operation resulted in success (no errors).
   */
  readonly isSuccess: boolean
  /**
   * Collection of errors
   */
  readonly errors: Map<string, Error>

  /**
   * Sets the data associated with the result.
   *
   * @param data The data to be stored in the result.
   * @returns The current Result object for chaining methods.
   */
  setData: (data: T) => IResult<T>
  /**
   * Retrieves the data associated with the result.
   *
   * @returns The data stored in the result, if any.
   */
  getData: () => T | null

  /**
   * Adds an error message or Error object to the result.
   * @param error The error message or Error object to be added.
   * @param key Error key. You can leave it blank. Then it will be generated automatically.
   * @returns {IResult} The current Result object for chaining methods.
   */
  addError: (error: Error | string, key?: string) => IResult
  /**
   * Adds multiple errors to the result in a single call.
   *
   * @param errors An array of errors or strings that will be converted to errors.
   * @returns {IResult} The current Result object for chaining methods.
   */
  addErrors: (errors: (Error | string)[]) => IResult
  /**
   * Retrieves an iterator for the errors collected in the result.
   *
   * @returns {IterableIterator<Error>} An iterator over the stored Error objects.
   */
  getErrors: () => IterableIterator<Error>

  /**
   * Retrieves an array of error messages from the collected errors.
   *
   * @returns {string[]} An array of strings representing the error messages.
   */
  getErrorMessages: () => string[]
  /**
   * Checks for an error in a collection by key
   * @param key - Error key
   */
  hasError(key: string): boolean
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
export class Result<T = any> implements IResult<T> {
  protected _errors: Map<string, Error>
  protected _data: T | null

  constructor(data?: T) {
    this._errors = new Map()
    this._data = data ?? null
  }

  get isSuccess(): boolean {
    return this._errors.size === 0
  }

  get errors(): Map<string, Error> {
    return this._errors
  }

  setData(data: T | null): Result<T> {
    this._data = data

    return this
  }

  getData(): T | null {
    return this._data
  }

  addError(error: Error | string, key?: string): Result<T> {
    const errorKey = key ?? Text.getUuidRfc4122()
    const errorObj = typeof error === 'string' ? new Error(error) : error

    this._errors.set(errorKey, errorObj)

    return this
  }

  addErrors(errors: (Error | string)[]): Result<T> {
    for (const error of errors) {
      this.addError(error)
    }

    return this
  }

  getErrors(): IterableIterator<Error> {
    return this._errors.values()
  }

  hasError(key: string): boolean {
    return this._errors.has(key)
  }

  /**
   * Retrieves an array of error messages from the collected errors.
   *
   * @returns An array of strings representing the error messages. Each string
   *          contains the message of a corresponding error object.
   */
  getErrorMessages(): string[] {
    return Array.from(this._errors.values(), e => e.message)
  }

  /**
   * Converts the Result object to a string.
   *
   * @returns {string} Returns a string representation of the result operation
   */
  toString(): string {
    const status = this.isSuccess ? 'success' : 'failure'
    const data = this.safeStringify(this._data)

    return this.isSuccess
      ? `Result(${status}): ${data}`
      : `Result(${status}): ${data}\nErrors: ${this.getErrorMessages().join(', ')}`
  }

  private safeStringify(data: unknown): string {
    try {
      return JSON.stringify(data, this.replacer, 2)
    } catch {
      return '[Unable to serialize data]'
    }
  }

  private replacer(_: string, value: unknown) {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack
      }
    }
    return value
  }

  // Static constructors
  static ok<U>(data?: U): Result<U> {
    return new Result<U>(data)
  }

  static fail<U>(error: Error | string, key?: string): Result<U> {
    return new Result<U>().addError(error, key)
  }
}
