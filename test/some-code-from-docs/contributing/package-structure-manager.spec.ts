// vitest transpiles via esbuild — no type-checking. The authoritative type gate is `contributing:typecheck`.
import { describe, expect, it } from 'vitest'
import { MyManager } from './package-structure-manager'

describe('contributing/package-structure-manager', () => {
  it('module loads without throwing', () => {
    expect(typeof MyManager).toBe('function')
  })
})
