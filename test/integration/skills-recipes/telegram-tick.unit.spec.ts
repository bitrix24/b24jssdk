/**
 * #64 — `tick()` from recipe 06-telegram-bot.ts: the cursor logic.
 *
 * `tick` walks new deals in id-ascending order and advances `lastSeenDealId`
 * per deal. On a send failure it `break`s rather than `continue`s, and that
 * choice is the whole design: with `continue`, deals after the failed one would
 * be delivered while the cursor stayed behind them, so the next tick would
 * re-send them as duplicates. `break` keeps the cursor a *contiguous prefix* of
 * what was delivered — at-least-once, never twice.
 *
 * A comment cannot enforce that. Someone "fixing" the loop to be more resilient
 * by swapping `break` for `continue` would produce duplicate Telegram messages
 * that only appear on the tick after a partial failure, which is exactly the
 * bug nobody reproduces locally. These tests pin it.
 *
 * The recipe is driven through fakes for `$b24` and the grammy bot, so no
 * portal and no network — jsSdk:unit.
 */
import { describe, it, expect, vi } from 'vitest'

interface FakeDeal {
  id: number
  title: string
  opportunity: number
  currencyId: string
  contactId?: number
  createdTime: string
  stageId: string
}

const deal = (id: number, stageId = 'NEW'): FakeDeal => ({
  id,
  title: `Deal ${id}`,
  opportunity: 100 * id,
  currencyId: 'RUB',
  contactId: undefined,
  createdTime: '2026-01-01T00:00:00Z',
  stageId
})

/**
 * Minimal stand-in for the SDK surface `tick` reaches through: one `call.make`
 * that answers `crm.item.list` from a queue of batches and `crm.item.get` with a
 * fixed contact. Records the `>id` filter of every list call so the cursor can
 * be observed from outside without the recipe exporting it.
 */
function fakeB24(batches: FakeDeal[][], opts: { listFails?: boolean, contactFails?: boolean } = {}) {
  const cursors: number[] = []
  let batch = 0
  const $b24 = {
    actions: {
      v2: {
        call: {
          make: async (options: { method: string, params?: Record<string, unknown> }) => {
            if (options.method === 'crm.item.list') {
              const filter = options.params?.filter as Record<string, number> | undefined
              cursors.push(filter?.['>id'] ?? -1)
              if (opts.listFails) {
                return {
                  isSuccess: false,
                  getErrorMessages: () => ['portal said no'],
                  getData: () => null
                }
              }
              const items = batches[batch] ?? []
              batch += 1
              return { isSuccess: true, getErrorMessages: () => [], getData: () => ({ result: { items } }) }
            }
            // crm.item.get — contact lookup
            if (opts.contactFails) {
              return { isSuccess: false, getErrorMessages: () => ['no such contact'], getData: () => null }
            }
            return {
              isSuccess: true,
              getErrorMessages: () => [],
              getData: () => ({ result: { item: { name: 'Ann', lastName: 'Lee' } } })
            }
          }
        }
      }
    }
  }
  return { $b24, cursors }
}

/** Bot whose sendMessage throws for the deal ids named in `failOn`. */
function fakeBot(failOn: number[] = []) {
  const sent: string[] = []
  const bot = {
    api: {
      sendMessage: async (_chatId: string, text: string) => {
        const id = Number(/ID:<\/b> (\d+)/.exec(text)?.[1] ?? -1)
        if (failOn.includes(id)) {
          throw new Error(`telegram rejected ${id}`)
        }
        sent.push(text)
      }
    }
  }
  return { bot, sent }
}

const idsOf = (sent: string[]) => sent.map(t => Number(/ID:<\/b> (\d+)/.exec(t)?.[1]))

/** Fresh module per test — `lastSeenDealId` is module state and must not leak. */
async function loadRecipe() {
  vi.resetModules()
  return await import('../../../skills/b24jssdk-recipes/examples/06-telegram-bot')
}

describe('tick (recipe 06) — cursor advances as a contiguous prefix', () => {
  it('sends nothing and leaves the cursor at 0 when there are no new deals', async () => {
    const { tick } = await loadRecipe()
    const { $b24, cursors } = fakeB24([[]])
    const { bot, sent } = fakeBot()

    await tick($b24 as never, bot as never, 'chat')

    expect(sent).toEqual([])
    expect(cursors).toEqual([0])
  })

  it('notifies every deal and advances the cursor to the highest id', async () => {
    const { tick } = await loadRecipe()
    const { $b24, cursors } = fakeB24([[deal(1), deal(2), deal(3)], []])
    const { bot, sent } = fakeBot()

    await tick($b24 as never, bot as never, 'chat')
    expect(idsOf(sent)).toEqual([1, 2, 3])

    // The next tick asks for deals after 3 — proof the cursor moved.
    await tick($b24 as never, bot as never, 'chat')
    expect(cursors).toEqual([0, 3])
  })

  it('stops at the first failure and does NOT deliver later deals', async () => {
    const { tick } = await loadRecipe()
    const { $b24, cursors } = fakeB24([[deal(1), deal(2), deal(3)], []])
    const { bot, sent } = fakeBot([2])

    await tick($b24 as never, bot as never, 'chat')

    // 1 delivered; 2 failed; 3 must NOT have been sent even though it would
    // have succeeded — that is `break`, not `continue`.
    expect(idsOf(sent)).toEqual([1])
    // Cursor sits at 1, so deals 2 and 3 are retried next tick.
    await tick($b24 as never, bot as never, 'chat')
    expect(cursors).toEqual([0, 1])
  })

  it('re-delivers nothing already delivered after a partial failure', async () => {
    // The property `break` exists to protect: across two ticks spanning a
    // failure, no deal is sent twice.
    const { tick } = await loadRecipe()
    const { $b24 } = fakeB24([[deal(1), deal(2), deal(3)], [deal(2), deal(3)], []])
    const first = fakeBot([2])
    await tick($b24 as never, first.bot as never, 'chat')

    const second = fakeBot()
    await tick($b24 as never, second.bot as never, 'chat')

    const allSent = [...idsOf(first.sent), ...idsOf(second.sent)]
    expect(allSent).toEqual([1, 2, 3])
    expect(new Set(allSent).size).toBe(allSent.length)
  })

  it('leaves the cursor untouched when the deal fetch itself fails', async () => {
    const { tick } = await loadRecipe()
    const { $b24, cursors } = fakeB24([], { listFails: true })
    const { bot, sent } = fakeBot()

    await tick($b24 as never, bot as never, 'chat')
    await tick($b24 as never, bot as never, 'chat')

    expect(sent).toEqual([])
    // Both ticks asked from 0 — a failed fetch must not look like "no deals".
    expect(cursors).toEqual([0, 0])
  })

  it('ignores deals whose base stage is not NEW', async () => {
    const { tick } = await loadRecipe()
    // Multi-funnel prefixes are stripped by baseStage before the comparison.
    const { $b24 } = fakeB24([[deal(1, 'C2:NEW'), deal(2, 'PREPARATION'), deal(3, 'NEW')], []])
    const { bot, sent } = fakeBot()

    await tick($b24 as never, bot as never, 'chat')

    expect(idsOf(sent)).toEqual([1, 3])
  })

  it('keeps the highest id when a batch is not ascending', async () => {
    // The cursor is `Math.max(lastSeenDealId, d.id)`, not a plain assignment.
    // The API is asked for `order: { id: 'asc' }`, so in practice ids arrive
    // ascending and the two are indistinguishable — which is exactly why the
    // guard would be droppable without a test that breaks the ordering.
    const { tick } = await loadRecipe()
    const { $b24, cursors } = fakeB24([[deal(3), deal(1)], []])
    const { bot } = fakeBot()

    await tick($b24 as never, bot as never, 'chat')
    await tick($b24 as never, bot as never, 'chat')

    // Plain assignment would leave the cursor at 1 and re-deliver deal 3.
    expect(cursors).toEqual([0, 3])
  })

  it('still notifies when the contact lookup fails', async () => {
    // A failed `crm.item.get` must degrade to a placeholder name, not abort the
    // notification — the deal is the thing worth telling someone about.
    const { tick } = await loadRecipe()
    // contactId must be set, or fetchContactName short-circuits to 'Not set'
    // and never reaches the failing lookup.
    const { $b24 } = fakeB24([[{ ...deal(1), contactId: 55 }], []], { contactFails: true })
    const { bot, sent } = fakeBot()

    await tick($b24 as never, bot as never, 'chat')

    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain('Failed to load')
  })

  it('advances past a filtered-out deal without re-fetching it', async () => {
    // Deal 2 is skipped by the stage filter, so the cursor lands on 3 — the
    // highest *delivered* id — and deal 2 is never reconsidered.
    const { tick } = await loadRecipe()
    const { $b24, cursors } = fakeB24([[deal(1), deal(2, 'LOSE'), deal(3)], []])
    const { bot } = fakeBot()

    await tick($b24 as never, bot as never, 'chat')
    await tick($b24 as never, bot as never, 'chat')

    expect(cursors).toEqual([0, 3])
  })
})
