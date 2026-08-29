/**
 * Type-level contract for the action option shapes (#426).
 *
 * Every action option type used to be declared as `ActionOptions & { … }`,
 * where `ActionOptions` is `{ [key: string]: any }`. That index signature meant
 * the compiler accepted **any** top-level key on **any** action — so
 * `batch.make({ calls, isHaltOnError: false })` type-checked, ran, and silently
 * ignored the flag, because the transport reads it from `options`.
 *
 * These are `@ts-expect-error` pins on real literal assignments, not
 * `expectTypeOf` pins, and the difference matters. What rejects a stray key is
 * TypeScript's **excess property check**, which fires only on a fresh object
 * literal — structurally, `{ calls, isHaltOnError }` is perfectly assignable to
 * `{ calls, options? }`, so `expectTypeOf(…).not.toExtend(…)` passes whether or
 * not the index signature is there. The first version of this file did exactly
 * that and pinned nothing; restoring the index signature left it green.
 *
 * A `@ts-expect-error` that stops being needed is itself a compile error, so
 * each of these fails loudly if the hole reopens. Verified by putting the index
 * signature back and watching them go red.
 *
 * The runtime half — the warning for callers TypeScript never sees — is pinned
 * in `batch-misplaced-options.unit.spec.ts`.
 *
 * Portal-free, and run by the `jsSdk:types` project — the `.types.spec.ts`
 * suffix is what routes it there, and that project is the only one whose
 * typecheck mode makes these pins capable of failing.
 */
import { describe, it, expect } from 'vitest'
import type { ActionBatchV2 } from '../../../packages/jssdk/src/core/actions/v2/batch'
import type { ActionBatchV3 } from '../../../packages/jssdk/src/core/actions/v3/batch'
import type { ActionCallV2 } from '../../../packages/jssdk/src/core/actions/v2/call'
import type { ActionCallListV2 } from '../../../packages/jssdk/src/core/actions/v2/call-list'

const CALLS = { a: ['server.time', {}] } as never

describe('action option types', () => {
  it('reject a batch flag written beside `options` instead of inside it', () => {
    const bad: ActionBatchV2 = {
      calls: CALLS,
      // @ts-expect-error `isHaltOnError` belongs in `options`; at the top level
      // it is read by nobody (#426).
      isHaltOnError: false
    }

    const badV3: ActionBatchV3 = {
      calls: CALLS,
      // @ts-expect-error same on v3.
      returnAjaxResult: true
    }

    // Keeps the file honest: a type test asserting nothing at runtime is easy
    // to leave passing vacuously.
    expect(bad.calls).toBeDefined()
    expect(badV3.calls).toBeDefined()
  })

  it('reject an arbitrary key on any action, not just batch', () => {
    const call: ActionCallV2 = {
      method: 'server.time',
      // @ts-expect-error not a member of ActionCallV2.
      nonsense: true
    }

    const list: ActionCallListV2 = {
      method: 'crm.deal.list',
      idKey: 'ID',
      // @ts-expect-error a plausible-looking typo is now caught.
      customKeyForResults: 'items'
    }

    expect(call.method).toBe('server.time')
    expect(list.idKey).toBe('ID')
  })

  it('still accept every documented shape', () => {
    // The tightening must not have narrowed anything a caller legitimately uses.
    const batch: ActionBatchV2 = {
      calls: CALLS,
      options: { isHaltOnError: false, returnAjaxResult: true, requestId: 'r' }
    }

    const list: ActionCallListV2 = {
      method: 'crm.item.list',
      params: { entityTypeId: 3 },
      idKey: 'id',
      customKeyForResult: 'items',
      requestId: 'r'
    }

    expect(batch.options?.isHaltOnError).toBe(false)
    expect(list.customKeyForResult).toBe('items')
  })
})
