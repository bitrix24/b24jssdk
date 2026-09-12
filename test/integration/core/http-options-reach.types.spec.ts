/**
 * `httpOptions` has to be reachable from the way each client is actually built.
 *
 * The option exists so a caller can name an axios adapter — in a browser the SDK
 * asks for `fetch`, and `{ adapter: 'xhr' }` is the way back. An option only the
 * raw constructor accepts is not an escape hatch: `B24Hook.fromWebhookUrl` is
 * the factory the documentation recommends everywhere, and `initializeB24Frame`
 * is the *only* supported way to build a frame ("you should not call
 * `new B24Frame(...)` directly"). Both forward `options` wholesale, so what can
 * go wrong is the signature, not the plumbing — which is what this pins.
 *
 * Type-level only, deliberately: the runtime half — that the option reaches the
 * live axios instance, and that a second `initializeB24Frame()` silently keeps
 * the first call's — is pinned in `frame-http-options.unit.spec.ts`.
 *
 * Run by the `jsSdk:types` project.
 */
import { describe, it, expectTypeOf } from 'vitest'
import { B24Frame, B24Hook, initializeB24Frame } from '../../../packages/jssdk/src/'
import { B24OAuth } from '../../../packages/jssdk/src/oauth/b24'
import type { TypeHttpOptions } from '../../../packages/jssdk/src/'

describe('httpOptions is reachable from every supported entry point', () => {
  it('accepts an adapter through each of them', () => {
    expectTypeOf(B24Hook.fromWebhookUrl)
      .parameter(1)
      .toExtend<undefined | { httpOptions?: TypeHttpOptions }>()

    expectTypeOf(initializeB24Frame)
      .parameter(0)
      .toExtend<undefined | { httpOptions?: TypeHttpOptions }>()

    expectTypeOf(B24Hook)
      .constructorParameters
      .toExtend<[unknown, (undefined | { httpOptions?: TypeHttpOptions })?]>()

    expectTypeOf(B24OAuth)
      .constructorParameters
      .toExtend<[unknown, unknown, (undefined | { httpOptions?: TypeHttpOptions })?]>()

    // The constructor a frame app is told never to call is documented as taking
    // the option too, so it is pinned like the rest.
    expectTypeOf(B24Frame)
      .constructorParameters
      .toExtend<[unknown, (undefined | { httpOptions?: TypeHttpOptions })?]>()
  })

  // Reachability is not the whole claim — narrowness is the other half, and it
  // has to hold at each entry point separately. Widening one of them back to
  // `AxiosRequestConfig` passes every assertion above.
  it('refuses a forbidden key at each entry point', () => {
    // Never called — these are compile-time assertions, and running them would
    // build real clients and start a frame handshake.
    const _typeOnly = (): void => {
      B24Hook.fromWebhookUrl('https://example.bitrix24.com/rest/1/secret/', {
        // @ts-expect-error — `transformRequest` is not part of `TypeHttpOptions`
        httpOptions: { transformRequest: [() => 'x'] }
      })

      void initializeB24Frame({
        // @ts-expect-error — same, on the frame factory
        httpOptions: { baseURL: 'https://elsewhere.example/' }
      })
    }
    void _typeOnly

    expectTypeOf(_typeOnly).toBeFunction()
  })

  // The narrow slice is the point: a key that replaces how the SDK talks to the
  // portal is not on offer. `transformRequest` is the sharpest of them — it
  // replaces the request body wholesale — and this pin is a type-surface pin,
  // not a demonstration of that: the `@ts-expect-error` goes red as an unused
  // directive the moment the key is added back to the `Pick`.
  it('refuses the keys that would break the transport', () => {
    // @ts-expect-error — `transformRequest` is not part of `TypeHttpOptions`
    const rejected: TypeHttpOptions = { transformRequest: [() => 'x'] }
    void rejected

    // The whole key set, not one sample: losing `maxRedirects` or `timeout`
    // from the public option type is a breaking change, and a single
    // `toHaveProperty('adapter')` noticed none of them. Adding or removing a key
    // is now a deliberate two-file edit.
    expectTypeOf<keyof TypeHttpOptions>().toEqualTypeOf<
      | 'adapter'
      | 'timeout'
      | 'timeoutErrorMessage'
      | 'proxy'
      | 'httpAgent'
      | 'httpsAgent'
      | 'maxRedirects'
      | 'maxContentLength'
      | 'maxBodyLength'
      | 'decompress'
      | 'withCredentials'
    >()
  })
})
