export type SdkErrorDetails = {
  code: string
  description?: string
  status: number
  originalError?: unknown
}

/**
 * Error in Sdk
 */
export class SdkError extends Error {
  public readonly code: string
  protected _status: number
  public readonly timestamp: Date
  public readonly originalError?: unknown

  constructor(params: SdkErrorDetails) {
    const message = SdkError.formatErrorMessage(params)
    super(message)

    this.name = 'SdkError' as const
    this.code = params.code
    this._status = params.status
    this.originalError = params.originalError
    this.timestamp = new Date()

    this.cleanErrorStack()
  }

  get status(): number {
    return this._status
  }

  /**
   * Creates SdkError from exception
   */
  static fromException(error: unknown, context?: {
    code?: string
    status?: number
  }): SdkError {
    if (error instanceof SdkError) return error

    return new SdkError({
      code: context?.code || 'JSSDK_INTERNAL_ERROR',
      status: context?.status || 500,
      description: error instanceof Error ? error.message : String(error),
      originalError: error
    })
  }

  /**
   * Serializes error for logging and debugging
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      status: this._status,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack
    }
  }

  /**
   * Formats error information for human-readable output
   */
  override toString(): string {
    let output = `[${this.name}] ${this.code} (${this._status}): ${this.message}`

    if (this.stack) {
      output += `\nStack trace:\n${this.stack}`
    }

    return output
  }

  protected static formatErrorMessage(params: SdkErrorDetails): string {
    if (!params?.description) {
      return `Internal error`
    }

    return `${params.description}`
  }

  protected cleanErrorStack() {
    if (typeof this.stack === 'string') {
      this.stack = this.stack
        .split('\n')
        .filter(line => !line.includes('SdkError.constructor'))
        .join('\n')
    }
  }
}
