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
import type { ActionCallV3 } from '../../../packages/jssdk/src/core/actions/v3/call'
import type { ActionCallListV3 } from '../../../packages/jssdk/src/core/actions/v3/call-list'
import type { ActionFetchListV2 } from '../../../packages/jssdk/src/core/actions/v2/fetch-list'
import type { ActionFetchListV3 } from '../../../packages/jssdk/src/core/actions/v3/fetch-list'
import type { ActionCallTailV3 } from '../../../packages/jssdk/src/core/actions/v3/call-tail'
import type { ActionFetchTailV3 } from '../../../packages/jssdk/src/core/actions/v3/fetch-tail'
import type { ActionAggregateV3 } from '../../../packages/jssdk/src/core/actions/v3/aggregate'
import type { ActionBatchByChunkV2 } from '../../../packages/jssdk/src/core/actions/v2/batch-by-chunk'
import type { ActionBatchByChunkV3 } from '../../../packages/jssdk/src/core/actions/v3/batch-by-chunk'

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

  it('reject an arbitrary key on all thirteen action types', () => {
    // The tightening was applied to every action, so pin every action. Four of
    // the thirteen were covered before, which left nine where an accidental
    // re-widening would have gone unnoticed.
    const callV3: ActionCallV3 = {
      method: 'm',
      // @ts-expect-error not a member of ActionCallV3.
      nonsense: true
    }
    const listV3: ActionCallListV3 = {
      method: 'm',
      // @ts-expect-error not a member of ActionCallListV3.
      nonsense: true
    }
    const fetchV2: ActionFetchListV2 = {
      method: 'm',
      // @ts-expect-error not a member of ActionFetchListV2.
      nonsense: true
    }
    const fetchV3: ActionFetchListV3 = {
      method: 'm',
      // @ts-expect-error not a member of ActionFetchListV3.
      nonsense: true
    }
    const tailV3: ActionCallTailV3 = {
      method: 'm',
      // @ts-expect-error not a member of ActionCallTailV3.
      nonsense: true
    }
    const fetchTailV3: ActionFetchTailV3 = {
      method: 'm',
      // @ts-expect-error not a member of ActionFetchTailV3.
      nonsense: true
    }
    const aggV3: ActionAggregateV3 = {
      method: 'm',
      // @ts-expect-error not a member of ActionAggregateV3.
      nonsense: true
    }
    const chunkV2: ActionBatchByChunkV2 = {
      calls: CALLS,
      // @ts-expect-error not a member of ActionBatchByChunkV2.
      nonsense: true
    }
    const chunkV3: ActionBatchByChunkV3 = {
      calls: CALLS,
      // @ts-expect-error not a member of ActionBatchByChunkV3.
      nonsense: true
    }

    expect([callV3, listV3, fetchV2, fetchV3, tailV3, fetchTailV3, aggV3, chunkV2, chunkV3]).toHaveLength(9)
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
      cursorIdKey: 'ID',
      requestId: 'r'
    }

    expect(batch.options?.isHaltOnError).toBe(false)
    expect(list.customKeyForResult).toBe('items')
  })
})
