export type SdkErrorDetails = {
  code: string
  /**
   * Human-readable detail. **Never interpolate a caller-supplied value into
   * this string** — request params, a filter, a URL, a token.
   *
   * `AjaxError` runs its `requestInfo` through `redactSensitiveParams` before
   * storing it; `SdkError` has no equivalent step, because its description is
   * expected to be written by the SDK rather than assembled from input. That
   * expectation is the only thing keeping a credential out of it, and error
   * messages travel — into logs, into failure reports, into Bitrix24 server-side
   * records. A filter alone legitimately carries user data: the email or phone
   * number being searched for.
   */
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
  /**
   * Opaque, un-scrubbed payload — may carry transport-layer detail
   * (e.g. `AxiosError.config.url` / request headers) with credentials that the
   * logger-side redaction does NOT scrub. It is defined **non-enumerable**
   * (see the constructor) so property-walking serializers — a spread
   * `{ ...err }`, `Object.keys(err)`, `Object.assign({}, err)`, or a
   * Sentry-style capture — skip it and can't leak the secret. `toJSON()` /
   * `toString()` already omit it too. It stays readable as `err.originalError`
   * for local debugging; prefer `code` / `status` / `message` (and
   * `AjaxError.requestInfo`, which IS redacted) for anything you log. (#73, #189)
   */
  declare public readonly originalError?: unknown

  constructor(params: SdkErrorDetails) {
    const message = SdkError.formatErrorMessage(params)
    super(message)

    this.name = 'SdkError' as const
    this.code = params.code

    this._status = params.status
    // Non-enumerable so a serializer that walks own-enumerable properties
    // (Sentry, `{ ...err }`, `Object.keys`) never sees the raw error and its
    // credential-bearing `config`; still accessible via `err.originalError`. (#189)
    Object.defineProperty(this, 'originalError', {
      value: params.originalError,
      enumerable: false,
      writable: false,
      configurable: true
    })
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
      description: error instanceof Error ? error.message : `${error}`,
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
