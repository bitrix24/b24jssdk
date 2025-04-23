export type AnswerError = {
  error: string
  errorDescription: string
}

export type AjaxErrorParams = {
  status: number
  answerError: AnswerError
  cause?: Error
}

type ErrorDetails = {
  code: string
  description?: string
  status: number
  requestInfo?: {
    method?: string
    url?: string
    params?: Record<string, unknown> | unknown
  }
  originalError?: unknown
}


/**
 * Error requesting RestApi
 */
export class AjaxError extends Error {
  public readonly code: string
  private _status: number
  public readonly requestInfo?: ErrorDetails['requestInfo']
  public readonly timestamp: Date
  public readonly originalError?: unknown

  // override cause: null | Error
  // private _status: number
  // private _answerError: AnswerError

  constructor(details: ErrorDetails) {
    const message = AjaxError.formatErrorMessage(details)
    super(message)

    this.name = 'AjaxError' as const
    this.code = details.code
    this._status = details.status
    this.requestInfo = details.requestInfo
    this.originalError = details.originalError
    this.timestamp = new Date()

    this.cleanErrorStack()
  }

  // constructor(params: AjaxErrorParams) {
  //   const message = `${ params.answerError.error }${
  //     params.answerError.errorDescription
  //       ? ': ' + params.answerError.errorDescription
  //       : ''
  //   }`
  //
  //   super(message)
  //   this.cause = params.cause || null
  //   this.name = this.constructor.name
  //
  //   this._status = params.status
  //   this._answerError = params.answerError
  // }

  /**
   * @deprecated
   */
  get answerError(): AnswerError {
    return {
      error: this.message,
      errorDescription: ''
    }
  }

  get status(): number {
    return this._status
  }

  /**
   * @deprecated
   */
  set status(status: number) {
    this._status = status
  }

  /**
   * Creates AjaxError from HTTP response
   */
  static fromResponse(response: {
    status: number
    data?: { error?: string; error_description?: string }
    config?: { method?: string; url?: string; params?: unknown }
  }): AjaxError {
    return new AjaxError({
      code: response.data?.error || 'unknown_error',
      description: response.data?.error_description,
      status: response.status,
      requestInfo: {
        method: response.config?.method?.toUpperCase(),
        url: response.config?.url,
        params: response.config?.params
      }
    })
  }

  /**
   * Creates AjaxError from exception
   */
  static fromException(error: unknown, context?: {
    code?: string
    status?: number
    requestInfo?: ErrorDetails['requestInfo']
  }): AjaxError {
    if (error instanceof AjaxError) return error

    return new AjaxError({
      code: context?.code || 'internal_error',
      status: context?.status || 500,
      description: error instanceof Error ? error.message : String(error),
      requestInfo: context?.requestInfo,
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
      requestInfo: this.requestInfo,
      stack: this.stack
    }
  }

  // override toString(): string {
  //   return `${ this.answerError.error }${
  //     this.answerError.errorDescription
  //       ? ': ' + this.answerError.errorDescription
  //       : ''
  //   } (${ this.status })`
  // }

  /**
   * Formats error information for human-readable output
   */
  override toString(): string {
    let output = `[${this.name}] ${this.code} (${this._status}): ${this.message}`

    if (this.requestInfo) {
      output += `\nRequest: ${this.requestInfo.method} ${this.requestInfo.url}`
    }

    if (this.stack) {
      output += `\nStack trace:\n${this.stack}`
    }

    return output
  }

  private static formatErrorMessage(details: ErrorDetails): string {
    const parts = [details.code]

    if (details.description) {
      parts.push(`- ${details.description}`)
    }

    if (details.requestInfo?.method && details.requestInfo.url) {
      parts.push(`(on ${details.requestInfo.method} ${details.requestInfo.url})`)
    }

    return parts.join(' ')
  }

  private cleanErrorStack() {
    if (typeof this.stack === 'string') {
      this.stack = this.stack
        .split('\n')
        .filter(line => !line.includes('AjaxError.constructor'))
        .join('\n')
    }
  }
}
