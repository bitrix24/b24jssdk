/**
 * Pure functions extracted from recipe 01-crm-analytics.ts.
 * Isolated here so they can be unit-tested without a live Bitrix24 portal.
 */

export interface DealRow {
  id: number
  stageId: string
  opportunity: number
  currencyId: string
}

export interface StageStat {
  count: number
  total: number
}

/** Strip multi-funnel prefix: "C2:WON" → "WON", "WON" → "WON". */
export const baseStage = (s: string): string => (s.includes(':') ? s.split(':')[1]! : s)

/** Group deals by stage, summing opportunity amounts. */
export function analyseFunnel(deals: DealRow[]): Map<string, StageStat> {
  const stages = new Map<string, StageStat>()
  for (const d of deals) {
    const s = stages.get(d.stageId) ?? { count: 0, total: 0 }
    s.count += 1
    s.total += d.opportunity
    stages.set(d.stageId, s)
  }
  return stages
}
