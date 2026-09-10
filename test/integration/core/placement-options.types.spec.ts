/**
 * Type-level contract for `PlacementManager.options` (#485).
 *
 * The getter used to be `any`, on a value that crosses a `postMessage` boundary
 * from the portal — so `options.payload.id` compiled, and was `undefined` at run
 * time. The production report is exactly that: a condition passed to a slider,
 * read back off `options`, never checked by anything.
 *
 * `any` cannot be pinned by asserting what it accepts, because it accepts
 * everything. What pins it is `@ts-expect-error` on a read that must **not**
 * compile: under `any` the read succeeds and the directive becomes an
 * unused-suppression error, so restoring the old type turns these red. Same
 * reasoning as `action-options.types.spec.ts` next door, which learned it the
 * hard way.
 *
 * Note *which* read is pinned. `options.payload` on its own compiles here —
 * `test/tsconfig.json` deliberately turns `noPropertyAccessFromIndexSignature`
 * off, so dotted access to an index signature is allowed and yields `unknown`.
 * The line that has to fail is the one the report actually wrote: reaching a
 * field **off** that value. That is the step `any` used to wave through.
 *
 * Everything is written as a type, or inside a function that is never called:
 * this project runs each file normally as well as type-checking it, so a
 * `declare const` would be a `ReferenceError` at run time.
 *
 * The runtime half — the three wire shapes the portal actually sends — is pinned
 * in `placement-options.unit.spec.ts`.
 */
import { describe, it, expectTypeOf } from 'vitest'
import type { PlacementManager, PlacementOptions } from '../../../packages/jssdk/src/frame/placement'

type Options = PlacementManager['options']

describe('PlacementManager.options is not `any` (#485)', () => {
  it('reads as a frozen index-signature object, not a free-for-all', () => {
    expectTypeOf<Options>().toEqualTypeOf<PlacementOptions>()
    expectTypeOf<Options>().not.toBeAny()
  })

  it('yields `unknown` per key, so a caller has to narrow', () => {
    expectTypeOf<Options['place']>().toBeUnknown()
  })

  it('is never `undefined`, so `?.` is not needed', () => {
    expectTypeOf<Options>().not.toBeNullable()
  })

  it('refuses to reach through a value the portal never promised', () => {
    // The assertions are the compile itself — see `pins` below, which is
    // exported so `noUnusedLocals` leaves it alone and never called because
    // there is nothing to run.
    expectTypeOf<typeof pins>().toBeFunction()
  })
})

export function pins(placement: PlacementManager): unknown[] {
  return [
    // @ts-expect-error — the line from the production report. `payload` reads as
    // `unknown`, so reaching `.id` off it is an error. Under the old `any` this
    // compiled and was `undefined` at run time.
    placement.options.payload.id,

    // @ts-expect-error — same for the bracket form a stricter consumer writes.
    placement.options['payload'].id
  ]
}

export function pinReadonly(placement: PlacementManager): void {
  // @ts-expect-error — `Readonly<…>`; the run-time `Object.freeze` is pinned in
  // the unit spec.
  placement.options['place'] = 'deal'
}
