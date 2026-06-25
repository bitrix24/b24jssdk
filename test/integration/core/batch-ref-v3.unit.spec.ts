/**
 * Unit tests for the v3 batch $ref / $refArray marker helpers. Pure logic.
 */
import { describe, it, expect } from 'vitest'
import { BatchRefV3 as R } from '../../../packages/jssdk/src/tools/batch-ref-v3'
import { ParseRow } from '../../../packages/jssdk/src/core/interaction/batch/parse-row'
import { SdkError } from '../../../packages/jssdk/src/core/sdk-error'

describe('BatchRefV3', () => {
  it('ref() builds a { $ref } marker', () => {
    expect(R.ref('newTask.item.id')).toEqual({ $ref: 'newTask.item.id' })
  })

  it('ref() accepts a dot-less path (a whole context entry); refArray() does not', () => {
    expect(R.ref('tasks')).toEqual({ $ref: 'tasks' }) // ref is NOT required to be dotted
    expect(() => R.refArray('tasks')).toThrow(/must contain a dot/)
  })

  it('refArray() builds a { $refArray } marker for a dotted path', () => {
    expect(R.refArray('tasks.id')).toEqual({ $refArray: 'tasks.id' })
  })

  it('rejection paths throw a typed SdkError with the right code and status', () => {
    expect.assertions(6)
    try {
      R.refArray('tasks')
    } catch (e) {
      expect(e).toBeInstanceOf(SdkError)
      expect((e as SdkError).code).toBe('JSSDK_BATCH_REF_V3_INVALID_REF_ARRAY')
      expect((e as SdkError).status).toBe(400)
    }
    try {
      R.ref('')
    } catch (e) {
      expect(e).toBeInstanceOf(SdkError)
      expect((e as SdkError).code).toBe('JSSDK_BATCH_REF_V3_INVALID_PATH')
      expect((e as SdkError).status).toBe(400)
    }
  })

  it('rejects an empty/non-string path', () => {
    expect(() => R.ref('')).toThrow(/non-empty dotted string/)
    // @ts-expect-error — runtime guard for a non-string path
    expect(() => R.refArray(42)).toThrow(/non-empty dotted string/)
  })

  it('markers drop into a batch params / filter unchanged (JSON shape)', () => {
    const params = { filter: [['taskId', 'in', R.refArray('tasks.id')]], id: R.ref('newTask.item.id') }
    expect(JSON.stringify(params)).toBe(
      '{"filter":[["taskId","in",{"$refArray":"tasks.id"}]],"id":{"$ref":"newTask.item.id"}}'
    )
  })

  it('survives the SDK batch assembly (ParseRow) without being mangled', () => {
    const marker = R.refArray('tasks.id')
    const cmd = ParseRow.getBatchCommand(
      { method: 'tasks.task.list', as: 'q', params: { filter: [['id', 'in', marker]] } },
      { parallelDefaultValue: false }
    )
    expect(cmd.method).toBe('tasks.task.list')
    expect(cmd.as).toBe('q')
    // the SDK maps `params` -> `query` and must not transform the marker
    expect((cmd.query as any).filter[0][2]).toEqual({ $refArray: 'tasks.id' })
  })

  it('is frozen', () => {
    expect(Object.isFrozen(R)).toBe(true)
  })
})
