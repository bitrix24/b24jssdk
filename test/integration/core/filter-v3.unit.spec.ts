/**
 * Unit tests for the v3 filter builder (FilterV3). Pure logic, no portal.
 */
import { describe, it, expect } from 'vitest'
import { FilterV3 as F } from '../../../packages/jssdk/src/tools/filter-v3'

describe('FilterV3 builder', () => {
  it('leaf operators produce short-form triples', () => {
    expect(F.eq('status', 'NEW')).toEqual(['status', '=', 'NEW'])
    expect(F.ne('status', 'DONE')).toEqual(['status', '!=', 'DONE'])
    expect(F.gt('id', 100)).toEqual(['id', '>', 100])
    expect(F.ge('price', 10)).toEqual(['price', '>=', 10])
    expect(F.lt('id', 5)).toEqual(['id', '<', 5])
    expect(F.le('price', 10)).toEqual(['price', '<=', 10])
  })

  it('in() requires a non-empty array', () => {
    expect(F.in('id', [1, 2, 3])).toEqual(['id', 'in', [1, 2, 3]])
    expect(() => F.in('id', [])).toThrow(/non-empty array/)
    // @ts-expect-error — runtime guard for a non-array value
    expect(() => F.in('id', 5)).toThrow(/non-empty array/)
  })

  it('between() produces a two-operand range', () => {
    expect(F.between('createdTime', '2025-01-01', '2025-12-31')).toEqual([
      'createdTime', 'between', ['2025-01-01', '2025-12-31']
    ])
  })

  it('and()/or() build logic groups', () => {
    expect(F.or(F.in('id', [1, 2]), F.gt('id', 100))).toEqual({
      logic: 'or',
      conditions: [['id', 'in', [1, 2]], ['id', '>', 100]]
    })
    expect(F.and(F.eq('a', 1), F.eq('b', 2))).toEqual({
      logic: 'and',
      conditions: [['a', '=', 1], ['b', '=', 2]]
    })
  })

  it('not() negates a group, or wraps a bare condition', () => {
    expect(F.not(F.or(F.eq('a', 1), F.eq('b', 2)))).toEqual({
      logic: 'or',
      negative: true,
      conditions: [['a', '=', 1], ['b', '=', 2]]
    })
    expect(F.not(F.eq('status', 'CLOSED'))).toEqual({
      logic: 'and',
      negative: true,
      conditions: [['status', '=', 'CLOSED']]
    })
  })

  it('build() flattens to a top-level AND array and skips falsy nodes', () => {
    const enabled = false
    const filter = F.build(
      F.eq('status', 'NEW'),
      enabled && F.gt('id', 10),
      F.or(F.in('id', [1, 2]), F.gt('id', 100))
    )
    expect(filter).toEqual([
      ['status', '=', 'NEW'],
      { logic: 'or', conditions: [['id', 'in', [1, 2]], ['id', '>', 100]] }
    ])
  })

  it('nests arbitrarily and matches the reference example shape', () => {
    // status NEW and (id=1,2 or id in [3,4,5])
    const filter = F.build(
      F.eq('status', 'NEW'),
      F.or(F.in('id', [1, 2]), F.in('id', [3, 4, 5]))
    )
    expect(filter[0]).toEqual(['status', '=', 'NEW'])
    expect((filter[1] as any).logic).toBe('or')
    expect((filter[1] as any).conditions).toHaveLength(2)
  })

  it('rejects an empty field name', () => {
    expect(() => F.eq('', 1)).toThrow(/non-empty string/)
  })

  it('not() does not mutate the original group', () => {
    const group = F.or(F.eq('a', 1))
    const negated = F.not(group)
    expect((group as any).negative).toBeUndefined()
    expect(negated.negative).toBe(true)
  })
})
