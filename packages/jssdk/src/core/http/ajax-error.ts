import type { AjaxQuery } from './ajax-result'
import type { ValidationDetail } from './parse-error-payload'
import type { SdkErrorDetails } from '../sdk-error'
import { SdkError } from '../sdk-error'
import { redactSensitiveParams } from './redact'

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
  requestInfo?: Partial<AjaxQuery>
  validation?: readonly ValidationDetail[]
}

/**
 * Error requesting RestApi
 */
export class AjaxError extends SdkError {
  /**
   * Redaction contract: `requestInfo.params` has already been run through
   * {@link redactSensitiveParams} in the constructor, so credential-bearing
   * keys are stored as `***REDACTED***` and are safe to surface via
   * `toJSON()` / `toString()`. (#39, #73)
   */
  public readonly requestInfo?: AjaxErrorDetails['requestInfo']

  /**
   * The `restApi:v3` `validation` array, when the portal sent one.
   *
   * `description` folds the validation messages into one string for display;
   * this keeps them apart, **with the `field` each belongs to** — which the
   * message alone does not carry, and which is what a form needs in order to
   * mark the offending input rather than show a banner (#423).
   *
   * ```ts
   * if (!response.isSuccess) {
   *   for (const error of response.getErrors()) {
   *     if (error instanceof AjaxError) {
   *       for (const detail of error.validation ?? []) {
   *         markInvalid(detail.field, detail.message)
   *       }
   *     }
   *   }
   * }
   * ```
   *
   * Absent under `restApi:v2`, which has no equivalent, and absent when v3
   * reported an error without one. `field` is optional inside each entry
   * because the portal's own shape says so.
   *
   * **Not added to `toJSON()`**, which enumerates its fields explicitly. That
   * keeps the serialized shape unchanged for anything already consuming it. It
   * is not a redaction boundary: the same text is already in `message`, since
   * the description folds these messages in. The entries carry whatever the
   * portal chose to say about the request, which can quote a submitted value —
   * no more and no less than `message` does. A spread or `Object.keys(err)` will
   * see it, like every other public field.
   */
  public readonly validation?: readonly ValidationDetail[]

  constructor(params: AjaxErrorDetails) {
    // @todo test this
    // @memo get from PullClient.loadConfig
    if (params.code === 'AUTHORIZE_ERROR' || params.code === 'WRONG_AUTH_TYPE') {
      params.status = 403
    }

    params.description = AjaxError.formatErrorMessage(params)
    super(params)

    this.name = 'AjaxError' as const
    this.validation = params.validation
    // Redact credential-bearing keys from caller-supplied params so they never
    // leak via `toJSON()` / `toString()` consumers (#39).
    this.requestInfo = params.requestInfo
      ? {
          ...params.requestInfo,
          ...(params.requestInfo.params !== undefined
            ? { params: redactSensitiveParams(params.requestInfo.params) }
            : {})
        }
      : undefined

    this.cleanErrorStack()
  }

  /**
   * Creates AjaxError from HTTP response
   * @todo add support v3
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
      output += `\nRequest: ${this.requestInfo?.requestId ? `[${this.requestInfo.requestId}] ` : ''}${this.requestInfo.method}`
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
      if (params.requestInfo?.method) {
        return `${params.code} (on ${params.requestInfo.method})`
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
