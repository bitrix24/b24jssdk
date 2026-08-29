import type { TypeDescriptionError, TypeDescriptionErrorV3 } from '../../types/auth'

/**
 * One entry of the `restApi:v3` `validation` array, as the SDK exposes it.
 *
 * `field` and `message` are both optional because the portal's own type says so
 * — `TypeDescriptionErrorV3` declares them optional and permits extra keys. A
 * caller matching on `field` has to handle it being absent; that is the portal's
 * shape, not a hedge.
 */
export type ValidationDetail = {
  readonly field?: string
  readonly message?: string
  readonly [key: string]: unknown
}

/** What a REST error body yields, whichever protocol version produced it. */
export type ParsedErrorPayload = {
  readonly code: string
  readonly description: string
  /**
   * The `restApi:v3` `validation` array, verbatim and **unredacted** — this is
   * the raw read. `AjaxError` runs each entry through `redactSensitiveParams`
   * when it stores them, which is the copy a caller sees.
   *
   * Absent for `restApi:v2`, which has no equivalent, and absent when v3 did not
   * send one.
   */
  readonly validation?: readonly ValidationDetail[]
}

/**
 * Separates the messages folded into {@link ParsedErrorPayload.description}.
 *
 * Two validation rows used to be concatenated with nothing between them —
 * `Field A must not be empty.Field B is invalid.` — with no way to tell where
 * one ended (#423).
 */
const MESSAGE_SEPARATOR = ' '

/**
 * Reads a Bitrix24 REST error body into the parts the SDK reports.
 *
 * This existed twice — in `AjaxResult.#processErrors()` and in
 * `AbstractHttp._convertAxiosErrorToAjaxError()` — each carrying a
 * `@todo make single function` pointing at the other. Which copy ran depended on
 * whether the error code was soft or hard, something a caller does not control,
 * so the two had to agree and nothing made them. They did not: neither read
 * `validation[].field`, and a fix applied to one would have left the other
 * lossy (#423).
 *
 * Returns `undefined` when the body carries no error the SDK recognises, so a
 * caller can tell "no error here" from "an error with an empty description".
 *
 * @param body the parsed response body — `unknown` because it arrives from
 *   `axios` on one path and from a stored response on the other, and neither is
 *   trustworthy enough to assert a type on.
 * @param fallbackCode used when the body names no code, e.g. an axios error
 *   whose own code is the only one available.
 * @param fallbackDescription likewise for the message.
 */
export function parseErrorPayload(
  body: unknown,
  fallbackCode: string,
  fallbackDescription: string
): ParsedErrorPayload | undefined {
  if (!body || typeof body !== 'object' || !('error' in body)) {
    return undefined
  }

  const responseData = body as TypeDescriptionError | TypeDescriptionErrorV3

  // restApi:v3 — `error` is an object carrying `code`, and optionally the
  // `validation` array this function exists to stop losing.
  if (
    responseData.error
    && typeof responseData.error === 'object'
    && 'code' in responseData.error
  ) {
    const error = responseData.error
    let description = String(error.message ?? '').trimEnd()

    if (error.validation && error.validation.length > 0) {
      const messages = error.validation
        // `||`, not `??`: a row whose `message` is present but empty says
        // nothing, so it falls back to the row itself rather than contributing
        // an empty fragment and a stray separator.
        .map(row => row?.message || JSON.stringify(row))
        .filter(message => message !== undefined && message !== '')

      if (messages.length > 0) {
        if (description.length > 0) {
          if (!description.endsWith('.')) {
            description += '.'
          }
          description += MESSAGE_SEPARATOR
        }
        description += messages.join(MESSAGE_SEPARATOR)
      }
    }

    return {
      code: error.code,
      description,
      // Kept verbatim rather than reshaped: `field` is what the caller came for,
      // and the portal is free to add keys the SDK has not seen. The copy is
      // what detaches it from the response body; the freeze stops a caller
      // reordering or extending the array. Both are **shallow** — the `readonly`
      // on each entry's fields is a type-level claim only, and nothing stops a
      // caller writing to `validation[0].field` at runtime.
      ...(error.validation ? { validation: Object.freeze([...error.validation]) } : {})
    }
  }

  // restApi:v2 — `error` is the code itself, with the text alongside it.
  if (responseData.error && typeof responseData.error === 'string') {
    return {
      code: responseData.error !== '0' ? responseData.error : fallbackCode,
      description: (responseData as TypeDescriptionError)?.error_description ?? fallbackDescription
    }
  }

  return undefined
}
