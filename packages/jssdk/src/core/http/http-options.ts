/**
 * The axios keys a caller may hand the SDK at construction, and the runtime
 * filter that enforces it.
 *
 * The list is the single source of truth for both halves: `TypeHttpOptions`
 * (in `types/http.ts`) is `Pick<AxiosRequestConfig, typeof HTTP_OPTION_KEYS[number]>`,
 * and `pickHttpOptions` below drops everything else before the config reaches
 * `axios.create`.
 *
 * A type alone does not enforce this. TypeScript's excess-property check fires
 * only on a direct object literal with no overlapping key, so
 * `{ timeout: 5000, transformRequest: [...] }` — or any value passed through a
 * variable, or any call from plain JavaScript — used to reach axios untouched.
 * Measured: a `transformRequest` smuggled in that way replaced the request body
 * wholesale, with no error on either side and a portal-side failure only, and a
 * `headers` entry was merged over the SDK's own. `baseURL`, `paramsSerializer`
 * and `validateStatus` are the same class of problem: they are how the SDK talks
 * to the portal, and overriding them breaks it quietly.
 *
 * `headers` is the one exception, and it is not in the list: the transport
 * constructor has merged a caller's headers over the SDK's own since #144 and
 * still does, so that contract is untouched. It is not *offered* either —
 * `TypeHttpOptions` does not accept it, so `httpOptions: { headers: … }` is a
 * compile error on every entry point. The merge survives for the path that
 * predates the type: a direct `new HttpV2(...)`, or a call from untyped
 * JavaScript. It stays out of the type because the SDK's own `Content-Type` and
 * `Authorization` are decided per request, where an instance header cannot
 * reach them — see `abstract-http.ts`.
 *
 * Dropped rather than refused, deliberately. These arrive at construction, where
 * throwing would take down an app over a key it may have carried for years; and
 * the caller is not left guessing — the dropped **names** are logged (never the
 * values: a `headers` entry can carry a credential). Everything outside this
 * list stays reachable through `getHttpClient(version).ajaxClient.defaults`,
 * where it reads as the deliberate act it is.
 */
export const HTTP_OPTION_KEYS = [
  'adapter',
  'timeout',
  'timeoutErrorMessage',
  'proxy',
  'httpAgent',
  'httpsAgent',
  'maxRedirects',
  'maxContentLength',
  'maxBodyLength',
  'decompress',
  'withCredentials'
] as const

/**
 * Keep only the allowed keys of `options`, and report the names of the rest.
 *
 * Own enumerable string keys only: a value inherited from a prototype, and a
 * symbol key, are neither kept nor reported. Both are the safe direction — the
 * previous spread copied symbol keys into axios, and nothing in the option
 * surface is reachable that way — but an allowed key that exists only on a
 * prototype is lost silently, which is why it is said here.
 *
 * @param options - Whatever a caller passed as `httpOptions` — typed or not.
 * @returns The filtered config and the names that were dropped, in input order.
 */
export function pickHttpOptions(options?: null | object): {
  picked: Record<string, unknown>
  dropped: string[]
} {
  const picked: Record<string, unknown> = {}
  const dropped: string[] = []

  if (!options) {
    return { picked, dropped }
  }

  for (const [key, value] of Object.entries(options)) {
    if ((HTTP_OPTION_KEYS as readonly string[]).includes(key)) {
      picked[key] = value
      continue
    }

    if ('headers' === key) {
      // Handled by the caller of this function, which merges it over the SDK's
      // own defaults (#144). Neither kept here nor reported as dropped.
      continue
    }

    dropped.push(key)
  }

  return { picked, dropped }
}
