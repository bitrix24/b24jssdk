/**
 * Unit tests for the v3 batch $ref / $refArray marker helpers. Pure logic.
 */
import { describe, it, expect } from 'vitest'
import { BatchRefV3 as R } from '../../../packages/jssdk/src/tools/batch-ref-v3'

describe('BatchRefV3', () => {
  it('ref() builds a { $ref } marker', () => {
    expect(R.ref('newTask.item.id')).toEqual({ $ref: 'newTask.item.id' })
  })

  it('refArray() builds a { $refArray } marker for a dotted path', () => {
    expect(R.refArray('tasks.id')).toEqual({ $refArray: 'tasks.id' })
  })

  it('refArray() rejects a dot-less path (server would 400)', () => {
    expect(() => R.refArray('tasks')).toThrow(/must contain a dot/)
  })

  it('rejects an empty/non-string path', () => {
    expect(() => R.ref('')).toThrow(/non-empty dotted string/)
    // @ts-expect-error — runtime guard for a non-string path
    expect(() => R.refArray(42)).toThrow(/non-empty dotted string/)
  })

  it('markers drop into a batch query / filter unchanged', () => {
    const query = { filter: [['taskId', 'in', R.refArray('tasks.id')]], id: R.ref('newTask.item.id') }
    expect(JSON.stringify(query)).toBe(
      '{"filter":[["taskId","in",{"$refArray":"tasks.id"}]],"id":{"$ref":"newTask.item.id"}}'
    )
  })

  it('is frozen', () => {
    expect(Object.isFrozen(R)).toBe(true)
  })
})
