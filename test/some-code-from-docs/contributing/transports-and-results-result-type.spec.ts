// vitest transpiles via esbuild — no type-checking. The authoritative type gate is `contributing:typecheck`.
import { describe, expect, it } from 'vitest'
import { isOk, readData } from './transports-and-results-result-type'

describe('contributing/transports-and-results-result-type', () => {
  it('module loads without throwing', () => {
    expect(typeof isOk).toBe('function')
    expect(typeof readData).toBe('function')
  })
})
