/**
 * Unit tests for the pure funnel helpers extracted from recipe 01-crm-analytics.ts.
 * No Bitrix24 portal required — these are pure functions with no I/O.
 */
import { describe, it, expect } from 'vitest'
import {
  baseStage,
  analyseFunnel,
  type DealRow
} from '../../../skills/b24jssdk-recipes/lib/funnel'

describe('baseStage', () => {
  it('returns the stage id unchanged when there is no colon prefix', () => {
    expect(baseStage('WON')).toBe('WON')
    expect(baseStage('NEW')).toBe('NEW')
    expect(baseStage('LOSE')).toBe('LOSE')
  })

  it('strips the multi-funnel category prefix', () => {
    expect(baseStage('C2:WON')).toBe('WON')
    expect(baseStage('C10:PREPARATION')).toBe('PREPARATION')
  })

  it('handles the first category (C1:)', () => {
    expect(baseStage('C1:EXECUTING')).toBe('EXECUTING')
  })

  it('falls back to the original string when the suffix is empty ("C2:")', () => {
    // Bitrix24 should never send this, but the guard prevents a silent empty-string key.
    expect(baseStage('C2:')).toBe('C2:')
  })

  it('returns empty string unchanged', () => {
    expect(baseStage('')).toBe('')
  })
})

describe('analyseFunnel', () => {
  it('returns an empty map for an empty dataset', () => {
    const result = analyseFunnel([])
    expect(result.size).toBe(0)
  })

  it('counts deals per stage', () => {
    const deals: DealRow[] = [
      { id: 1, stageId: 'NEW', opportunity: 1000, currencyId: 'RUB' },
      { id: 2, stageId: 'NEW', opportunity: 500, currencyId: 'RUB' },
      { id: 3, stageId: 'WON', opportunity: 2000, currencyId: 'RUB' }
    ]
    const result = analyseFunnel(deals)
    expect(result.get('NEW')).toEqual({ count: 2, total: 1500 })
    expect(result.get('WON')).toEqual({ count: 1, total: 2000 })
  })

  it('sums opportunity amounts correctly', () => {
    const deals: DealRow[] = [
      { id: 1, stageId: 'EXECUTING', opportunity: 100, currencyId: 'USD' },
      { id: 2, stageId: 'EXECUTING', opportunity: 250, currencyId: 'USD' },
      { id: 3, stageId: 'EXECUTING', opportunity: 150, currencyId: 'USD' }
    ]
    const result = analyseFunnel(deals)
    expect(result.get('EXECUTING')?.total).toBe(500)
    expect(result.get('EXECUTING')?.count).toBe(3)
  })

  it('treats multi-funnel stage ids as distinct keys (prefix not stripped by analyseFunnel)', () => {
    // analyseFunnel preserves raw stageId; baseStage() is applied by printFunnel
    const deals: DealRow[] = [
      { id: 1, stageId: 'C1:WON', opportunity: 100, currencyId: 'RUB' },
      { id: 2, stageId: 'C2:WON', opportunity: 200, currencyId: 'RUB' }
    ]
    const result = analyseFunnel(deals)
    expect(result.size).toBe(2)
    expect(result.get('C1:WON')?.count).toBe(1)
    expect(result.get('C2:WON')?.count).toBe(1)
  })

  it('handles zero-opportunity deals without corrupting totals', () => {
    const deals: DealRow[] = [
      { id: 1, stageId: 'NEW', opportunity: 0, currencyId: 'RUB' },
      { id: 2, stageId: 'NEW', opportunity: 0, currencyId: 'RUB' }
    ]
    const result = analyseFunnel(deals)
    expect(result.get('NEW')).toEqual({ count: 2, total: 0 })
  })

  it('handles a single deal', () => {
    const deals: DealRow[] = [
      { id: 42, stageId: 'LOSE', opportunity: 9999, currencyId: 'EUR' }
    ]
    const result = analyseFunnel(deals)
    expect(result.get('LOSE')).toEqual({ count: 1, total: 9999 })
    expect(result.size).toBe(1)
  })

  it('correctly sums negative opportunity values (reversals / write-downs)', () => {
    const deals: DealRow[] = [
      { id: 1, stageId: 'WON', opportunity: 5000, currencyId: 'RUB' },
      { id: 2, stageId: 'WON', opportunity: -500, currencyId: 'RUB' }
    ]
    const result = analyseFunnel(deals)
    expect(result.get('WON')).toEqual({ count: 2, total: 4500 })
  })
})
