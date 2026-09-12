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
 * Type-level only: `initializeB24Frame` awaits the parent-window handshake, so
 * there is nothing to run here without a portal.
 *
 * Run by the `jsSdk:types` project.
 */
import { describe, it, expectTypeOf } from 'vitest'
import { B24Hook, initializeB24Frame } from '../../../packages/jssdk/src/'
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
  })

  // The narrow slice is the point: a key that replaces how the SDK talks to the
  // portal is not on offer, and `transformRequest` is the one that was measured
  // rewriting the request body with no error on either side.
  it('refuses the keys that would break the transport', () => {
    // @ts-expect-error — `transformRequest` is not part of `TypeHttpOptions`
    const rejected: TypeHttpOptions = { transformRequest: [() => 'x'] }
    void rejected

    expectTypeOf<TypeHttpOptions>().toHaveProperty('adapter')
  })
})
