import type { AjaxQuery } from './ajax-result'
import type { SdkErrorDetails } from '../sdk-error'
import { SdkError } from '../sdk-error'

export type AnswerError = {
  error: string
  errorDescription: string
}

export type AjaxErrorParams = {
  status: number
  answerError: AnswerError
  cause?: Error
}

type AjaxErrorDetails = SdkErrorDetails & {
  requestInfo?: Partial<AjaxQuery> & { url?: string }
}

/**
 * Error requesting RestApi
 */
export class AjaxError extends SdkError {
  public readonly requestInfo?: AjaxErrorDetails['requestInfo']

  constructor(params: AjaxErrorDetails) {
    params.description = AjaxError.formatErrorMessage(params)
    super(params)

    this.name = 'AjaxError' as const
    this.requestInfo = params.requestInfo

    this.cleanErrorStack()
  }

  /**
   * @deprecated use `error.message`
   */
  get answerError(): AnswerError {
    return {
      error: this.message,
      errorDescription: ''
    }
  }

  /**
   * @deprecated You don't need to set the error status. Left for compatibility.
   */
  override set status(status: number) {
    this._status = status
  }

  /**
   * Creates AjaxError from HTTP response
   */
  static fromResponse(response: {
    status: number
    data?: { error?: string, error_description?: string }
    config?: AjaxErrorDetails['requestInfo']
  }): AjaxError {
    return new AjaxError({
      code: response.data?.error || 'JSSDK_INTERNAL_AJAX_ERROR',
      description: response.data?.error_description,
      status: response.status,
      requestInfo: response.config
    })
  }

  /**
   * @inheritDoc
   */
  static override fromException(error: unknown, context?: {
    code?: string
    status?: number
    requestInfo?: AjaxErrorDetails['requestInfo']
  }): AjaxError {
    if (error instanceof AjaxError) return error

    return new AjaxError({
      code: context?.code || 'JSSDK_INTERNAL_AJAX_ERROR',
      status: context?.status || 500,
      description: error instanceof Error ? error.message : String(error),
      requestInfo: context?.requestInfo,
      originalError: error
    })
  }

  /**
   * @inheritDoc
   */
  override toJSON() {
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

  /**
   * @inheritDoc
   */
  override toString(): string {
    let output = `[${this.name}] ${this.code} (${this._status}): ${this.message}`

    if (this.requestInfo) {
      output += `\nRequest: ${this.requestInfo?.requestId ? `[${this.requestInfo.requestId}] ` : ''}${this.requestInfo.method} ${this.requestInfo.url}`
    }

    if (this.stack) {
      output += `\nStack trace:\n${this.stack}`
    }

    return output
  }

  /**
   * @inheritDoc
   */
  protected static override formatErrorMessage(params: AjaxErrorDetails): string {
    if (!params?.description) {
      if (
        params.requestInfo?.method
        && params.requestInfo.url
      ) {
        return `${params.code} (on ${params.requestInfo.method}${params.requestInfo?.url ? ' ' + params.requestInfo.url : ''})`
      } else {
        return `Internal ajax error`
      }
    }

    return `${params.description}`
  }

  /**
   * @inheritDoc
   */
  protected override cleanErrorStack() {
    if (typeof this.stack === 'string') {
      this.stack = this.stack
        .split('\n')
        .filter(line => !line.includes('AjaxError.constructor'))
        .join('\n')
    }
  }
}
