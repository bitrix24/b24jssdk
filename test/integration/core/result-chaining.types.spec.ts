/**
 * Type-level contract for the `Result` chaining fixes and for the batch
 * envelope's nesting depth. Compile-time pins (`expectTypeOf`) plus the few
 * runtime assertions that keep the file honest — a type test that never runs
 * anything is easy to leave passing vacuously.
 *
 * Two separate bugs, both invisible at runtime:
 *
 *  1. `IResult.addError` / `addErrors` were declared as returning a bare
 *     `IResult` — `IResult<any>`. So `result.addError('x').getData()` came back
 *     as `any`: chaining silently threw away the payload type, and any typo
 *     after the chain compiled. The class methods returned `Result<T>`, which
 *     is right for `Result` and wrong for every subclass — chaining off an
 *     `AjaxResult` widened it to `Result`, losing `getStatus()`/`getQuery()`.
 *     Both are now the polymorphic `this`.
 *
 *  2. `AjaxResult<X>` already means "the payload is `{ result: X, time }`", so
 *     the batch transport passing `BatchPayload<T>` described one envelope too
 *     many. See `BatchResponsePayload`.
 *
 * Portal-free, and run by the `jsSdk:types` project — the `.types.spec.ts`
 * suffix is what routes it there, and that project is the only one whose
 * typecheck mode makes the `expectTypeOf` pins below capable of failing.
 */
import { describe, it, expect, expectTypeOf } from 'vitest'
import { Result } from '../../../packages/jssdk/src/core/result'
import type { AjaxResult } from '../../../packages/jssdk/src/core/http/ajax-result'
import type { BatchResponsePayload } from '../../../packages/jssdk/src/core/interaction/batch/abstract-interaction-batch'
import type { BatchPayload, SuccessPayload } from '../../../packages/jssdk/src/types/payloads'

type Payload = { id: number }

/** A subclass, to prove chaining does not widen back to `Result`. */
class TaggedResult<T> extends Result<T> {
  readonly tag = 'tagged'
}

describe('Result chaining keeps the concrete type', () => {
  it('addError returns the same class, not a widened Result', () => {
    const tagged = new TaggedResult<Payload>().addError('boom')

    expectTypeOf(tagged).toEqualTypeOf<TaggedResult<Payload>>()
    // The property access is the point: before the fix this line did not
    // compile, because `addError` handed back a plain `Result`.
    expect(tagged.tag).toBe('tagged')
  })

  it('addErrors and setData chain the same way', () => {
    const tagged = new TaggedResult<Payload>()
      .addErrors(['a', 'b'])
      .setData({ id: 7 })

    expectTypeOf(tagged).toEqualTypeOf<TaggedResult<Payload>>()
    expect(tagged.getData()).toEqual({ id: 7 })
    expect(tagged.getErrorMessages()).toEqual(['a', 'b'])
  })

  it('does not degrade the payload type to any', () => {
    const data = Result.ok<Payload>({ id: 1 }).addError('boom').getData()

    // `not.toBeAny` is the assertion that matters. `toEqualTypeOf` alone would
    // pass against `any`, which is exactly what the bug produced.
    expectTypeOf(data).not.toBeAny()
    expectTypeOf(data).toEqualTypeOf<Payload | null | undefined>()
  })

  it('static fail keeps the payload type through the internal chain', () => {
    const failed = Result.fail<Payload>('boom')

    expectTypeOf(failed).toEqualTypeOf<Result<Payload>>()
    expect(failed.isSuccess).toBe(false)
  })

  it('setData accepts null and undefined, as the implementation always did', () => {
    // The interface declared `(data: T) => …` while the class accepted
    // `T | null | undefined`, so clearing a result through an `IResult`-typed
    // reference was a type error against code that worked.
    const asInterface = new Result<Payload>({ id: 1 })

    expect(asInterface.setData(null).getData()).toBeNull()
    expect(asInterface.setData(undefined).getData()).toBeUndefined()
  })
})

describe('the batch envelope is one level deep, not two', () => {
  it('getData().result is the batch payload itself', () => {
    type Data = AjaxResult<BatchResponsePayload<Payload>>['getData'] extends () => infer R ? R : never

    expectTypeOf<Data>().toEqualTypeOf<undefined | SuccessPayload<BatchResponsePayload<Payload>>>()
  })

  it('rejects the old doubled envelope', () => {
    // `BatchPayload<T>` is `{ result: …, time }`. Handing that to `AjaxResult`
    // as the payload type produced `{ result: { result: …, time }, time }` —
    // which is why every consumer needed `as unknown as` to read a row out.
    // The two are not interchangeable, and this pins that they are not.
    expectTypeOf<BatchPayload<Payload>>().not.toEqualTypeOf<BatchResponsePayload<Payload>>()
    expectTypeOf<BatchPayload<Payload>>().not.toMatchTypeOf<BatchResponsePayload<Payload>>()
  })
})
