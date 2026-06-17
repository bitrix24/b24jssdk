// vitest transpiles via esbuild — no type-checking. The authoritative type gate is `contributing:typecheck`.
import { describe, expect, it } from 'vitest'
import { warnDeprecated } from './package-structure-deprecation-warning'

describe('contributing/package-structure-deprecation-warning', () => {
  it('module loads without throwing', () => {
    expect(typeof warnDeprecated).toBe('function')
  })
})
