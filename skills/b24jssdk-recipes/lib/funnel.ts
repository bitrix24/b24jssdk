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
  readonly count: number
  readonly total: number
}

/**
 * Strip multi-funnel prefix: "C2:WON" → "WON", "WON" → "WON".
 *
 * Falls back to the original string if the part after the colon is empty, so a
 * malformed "C2:" stays "C2:" rather than collapsing to "". Keep that fallback:
 * an empty key silently merges every unparseable stage into one bucket and can
 * collide with a real empty-string key, whereas the original value fails a
 * lookup visibly. Bitrix24 does not emit a prefix with an empty status, so this
 * guards a malformed input rather than a live API shape.
 */
export const baseStage = (s: string): string => {
  if (!s.includes(':')) return s
  const suffix = s.split(':')[1]
  return suffix || s
}

/**
 * Group deals by their raw `stageId` (prefix NOT stripped).
 * Multi-funnel portals will produce separate entries for "C1:WON" and "C2:WON".
 * Call `baseStage(stageId)` on the resulting keys when aggregating across funnels.
 */
export function analyseFunnel(deals: DealRow[]): Map<string, StageStat> {
  const stages = new Map<string, StageStat>()
  for (const d of deals) {
    const s = stages.get(d.stageId)
    stages.set(d.stageId, {
      count: (s?.count ?? 0) + 1,
      total: (s?.total ?? 0) + d.opportunity
    })
  }
  return stages
}
