// vitest transpiles via esbuild — no type-checking. The authoritative type gate is `contributing:typecheck`.
import { describe, expect, it } from 'vitest'
import { quickStart } from './documentation-b24hook-example'

describe('contributing/documentation-b24hook-example', () => {
  it('module loads without throwing', () => {
    expect(typeof quickStart).toBe('function')
  })
})
