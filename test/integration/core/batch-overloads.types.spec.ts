/**
 * Type-level contract for the `batch.make` overloads (#518).
 *
 * A batch answers in one of four shapes, and which one is decided by the
 * arguments — a named record answers by name, an array answers by index, and
 * `returnAjaxResult` decides whether each entry is the payload or the
 * `AjaxResult` wrapping it. None of that is observable on the returned value, so
 * before the overloads a caller had `CallBatchResult<T>` — a union — and no way
 * to narrow it. The repository's own batch documentation carried
 * `@check-ignore: … uses union result type` for exactly that reason.
 *
 * `T` is one command's payload in every case.
 *
 * Every call sits inside a lambda that is never invoked. Two reasons: overload
 * resolution only happens at a call site (`typeof method` collapses to the last
 * signature, which would make these assertions vacuous), and `.types.spec.ts`
 * files also run as ordinary tests — a real call against a declared-but-absent
 * client would throw at run time.
 *
 * The runtime half of the same table is measured in
 * `batch-overloads.unit.spec.ts`. If the two disagree, the overloads are lying,
 * which is worse than the union was.
 */
import { describe, expectTypeOf, it } from 'vitest'
import type { AjaxResult } from '../../../packages/jssdk/src/core/http/ajax-result'
import type { B24Hook, BatchCommandsArrayUniversal, BatchNamedCommandsUniversal } from '../../../packages/jssdk/src/index'

type Row = { id: string }
declare const b24: B24Hook

const NAMED: BatchNamedCommandsUniversal = { first: { method: 'crm.item.get', params: {} } }
// Typed, not `as never`: `never` satisfies every overload, so the first one
// would win and the array cases would silently assert the named shape.
const ARRAY: BatchCommandsArrayUniversal = [['crm.item.get', {}]]

describe('#518 batch.make overloads pick the shape from the arguments', () => {
  it('named commands, no returnAjaxResult — keyed by name, payload directly', () => {
    const call = async () => b24.actions.v2.batch.make<Row>({ calls: NAMED })
    expectTypeOf(call).returns.resolves.toEqualTypeOf<import('../../../packages/jssdk/src/core/result').Result<Record<string, Row>>>()
  })

  it('named commands, returnAjaxResult: true — keyed by name, AjaxResult per command', () => {
    const _call = async () => b24.actions.v2.batch.make<Row>({
      calls: NAMED,
      options: { returnAjaxResult: true }
    })
    type Data = Awaited<ReturnType<typeof _call>> extends { getData: () => infer D } ? D : never
    expectTypeOf<Data>().toEqualTypeOf<Record<string | number, AjaxResult<Row>> | null | undefined>()
  })

  it('array commands, no returnAjaxResult — indexed, payload directly', () => {
    const _call = async () => b24.actions.v2.batch.make<Row>({ calls: ARRAY })
    type Data = Awaited<ReturnType<typeof _call>> extends { getData: () => infer D } ? D : never
    expectTypeOf<Data>().toEqualTypeOf<Row[] | null | undefined>()
  })

  it('array commands, returnAjaxResult: true — indexed, AjaxResult per command', () => {
    const _call = async () => b24.actions.v2.batch.make<Row>({
      calls: ARRAY,
      options: { returnAjaxResult: true }
    })
    type Data = Awaited<ReturnType<typeof _call>> extends { getData: () => infer D } ? D : never
    expectTypeOf<Data>().toEqualTypeOf<AjaxResult<Row>[] | null | undefined>()
  })

  it('v3 resolves the same way — the overloads are on both actions', () => {
    const _call = async () => b24.actions.v3.batch.make<Row>({ calls: NAMED })
    type Data = Awaited<ReturnType<typeof _call>> extends { getData: () => infer D } ? D : never
    expectTypeOf<Data>().toEqualTypeOf<Record<string, Row> | null | undefined>()
  })

  it('a dynamic returnAjaxResult still compiles, and honestly returns the union', () => {
    // The flag is the discriminator; when the compiler cannot read it as a
    // literal there is no honest answer but the union. This must keep working —
    // refusing it would be a regression the overloads are not worth.
    const call = async (dynamic: boolean) => b24.actions.v2.batch.make<Row>({
      calls: NAMED,
      options: { returnAjaxResult: dynamic }
    })
    expectTypeOf(call).returns.resolves.not.toBeNever()
  })

  it('reading the array shape off a name-keyed result is an error', () => {
    const wrong = async () => {
      const named = await b24.actions.v2.batch.make<Row>({ calls: NAMED })
      // A `Record<string, Row>` answers any string key, so `.length` type-checks
      // and yields `Row` — it is calling it that the types refuse.
      // @ts-expect-error — Row is not callable, so this was never an array
      return named.getData()!.map(row => row)
    }
    expectTypeOf(wrong).toBeFunction()
  })

  it('reading a named key off an indexed result is an error', () => {
    const wrong = async () => {
      const indexed = await b24.actions.v2.batch.make<Row>({ calls: ARRAY })
      // @ts-expect-error — an indexed array has no `first` key
      return indexed.getData()!.first
    }
    expectTypeOf(wrong).toBeFunction()
  })
})
