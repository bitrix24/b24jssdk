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
    // a reversed range is preserved verbatim (the server decides emptiness)
    expect(F.between('id', 9, 1)).toEqual(['id', 'between', [9, 1]])
  })

  it('between() rejects an undefined/null operand (fail fast on the client)', () => {
    expect(() => F.between('id', undefined, 5)).toThrow(/both range operands must be defined/)
    expect(() => F.between('id', 1, null)).toThrow(/both range operands must be defined/)
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

  it('not() does not mutate the original group (flag or conditions array)', () => {
    const group = F.or(F.eq('a', 1))
    const negated = F.not(group)
    expect((group as any).negative).toBeUndefined()
    expect(negated.negative).toBe(true)
    // the conditions array must be a copy, not shared
    expect(negated.conditions).not.toBe(group.conditions)
    negated.conditions.push(F.eq('b', 2))
    expect(group.conditions).toHaveLength(1) // original untouched
  })

  it('not(not(group)) stays negated (idempotent, does not toggle back)', () => {
    const once = F.not(F.or(F.eq('a', 1)))
    const twice = F.not(once)
    expect(once.negative).toBe(true)
    expect(twice.negative).toBe(true)
  })

  it('nests groups several levels deep', () => {
    const filter = F.build(
      F.and(
        F.eq('a', 1),
        F.or(
          F.eq('b', 2),
          F.and(F.gt('c', 3), F.lt('c', 9))
        )
      )
    )
    expect(filter).toEqual([
      {
        logic: 'and',
        conditions: [
          ['a', '=', 1],
          {
            logic: 'or',
            conditions: [
              ['b', '=', 2],
              { logic: 'and', conditions: [['c', '>', 3], ['c', '<', 9]] }
            ]
          }
        ]
      }
    ])
  })

  it('build() returns an empty array when every node is falsy', () => {
    expect(F.build(false, null, undefined)).toEqual([])
  })

  it('build() rejects a malformed node (forgotten spread / hand-rolled triple)', () => {
    // @ts-expect-error — passing an array of nodes instead of spreading
    expect(() => F.build([F.eq('a', 1)])).toThrow(/each node must be/)
    // hand-rolled triple with a bad operator escapes the leaf factories
    expect(() => F.build(['field', 'LIKE', 'x'] as never)).toThrow(/each node must be/)
    // a bare v2-style string (common migration mistake) is rejected
    expect(() => F.build('status = NEW' as never)).toThrow(/each node must be/)
  })

  it('golden payload: the exact wire shape verified live is stable and JSON-serializable', () => {
    // status = NEW AND (id in [1,2] OR id > 100) AND createdTime between [a,b]
    const filter = F.build(
      F.eq('status', 'NEW'),
      F.or(F.in('id', [1, 2]), F.gt('id', 100)),
      F.between('createdTime', '2025-01-01', '2025-12-31')
    )
    expect(JSON.stringify(filter)).toBe(
      '[["status","=","NEW"],'
      + '{"logic":"or","conditions":[["id","in",[1,2]],["id",">",100]]},'
      + '["createdTime","between",["2025-01-01","2025-12-31"]]]'
    )
  })
})
