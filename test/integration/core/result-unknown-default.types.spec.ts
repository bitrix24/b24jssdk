/**
 * Type-level pin for #279: `Result<T>` and `IResult<T>` default to `unknown`,
 * and `TypeCallParams`'s catch-all index signature and nested `params` carry
 * `unknown` rather than `any`.
 *
 * These are one-word declarations, which is exactly why they need a pin: nothing
 * else in the suite would notice a later edit restoring `any`. The runtime
 * behaviour does not change at all, so no unit test can catch the regression —
 * `any` and `unknown` are indistinguishable once the code runs.
 *
 * The distinguishing property is that `unknown` **refuses** the reads `any`
 * permits, so each assertion below is written as a rejection: `@ts-expect-error`
 * fails the typecheck if the line it guards ever starts compiling.
 *
 * Portal-free, and run by the `jsSdk:types` project — the `.types.spec.ts`
 * suffix routes it there.
 */
import { describe, expect, expectTypeOf, it } from 'vitest'
import { Result } from '../../../packages/jssdk/src/core/result'
import type { IResult, TypeCallParams } from '../../../packages/jssdk/src/index'

describe('#279 unknown replaces any in the public type defaults', () => {
  it('Result<T> defaults to unknown, not any', () => {
    const result = new Result()
    expectTypeOf(result.getData()).toEqualTypeOf<unknown>()

    // Under `T = any` this compiled and silently returned `any`; under
    // `unknown` it is an error. If it ever compiles again, the default was
    // widened back. Declared and never called: `@ts-expect-error` suppresses the
    // compile error, it does not stop the line from running and dereferencing
    // `null`.
    const _neverCalled = () => {
      // @ts-expect-error — reading a field off an un-narrowed Result
      return result.getData().anything
    }
    expectTypeOf(_neverCalled).toBeFunction()

    // The runtime is untouched — an empty Result still carries no data.
    expect(result.getData()).toBeNull()
  })

  it('IResult<T> defaults to unknown too', () => {
    // The interface and the class have to agree; they were declared separately
    // and could drift.
    expectTypeOf<IResult['getData']>().returns.toEqualTypeOf<unknown>()
  })

  it('a named payload still flows through, so the narrowing costs nothing', () => {
    const typed = new Result<{ items: number[] }>()
    expectTypeOf(typed.getData()).toEqualTypeOf<{ items: number[] } | null | undefined>()
  })

  it('TypeCallParams index signature is unknown, not any', () => {
    const params: TypeCallParams = { entityTypeId: 2, id: 7 }

    // The signature still ACCEPTS arbitrary keys — that was decided in #279 and
    // is why `crm.item.get`'s `{ entityTypeId, id }` above compiles at all.
    expectTypeOf(params['entityTypeId']).toEqualTypeOf<unknown>()

    // What it no longer does is hand them back as `any`.
    const _neverCalled = () => {
      // @ts-expect-error — an unknown-valued key cannot be used without narrowing
      return params['entityTypeId'].toFixed(0)
    }
    expectTypeOf(_neverCalled).toBeFunction()
  })

  it('the nested params field is Record<string, unknown>, not any', () => {
    const params: TypeCallParams = { params: { nested: 1 } }
    const _neverCalled = () => {
      // @ts-expect-error — same rule one level down
      return params.params.nested.toFixed(0)
    }
    expectTypeOf(_neverCalled).toBeFunction()
    expect(params.params).toEqual({ nested: 1 })
  })
})
