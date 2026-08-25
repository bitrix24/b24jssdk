/**
 * #113a — live-portal verification of the skill files that a webhook can reach.
 *
 * The skills under `skills/` are the SDK's agent-facing interface. CI already
 * compiles every snippet (`skills:typecheck`), which proves they type-check
 * against the built types — not that the portal answers the way the skill says
 * it does. This suite exercises each documented pattern against a real portal
 * and names the skill file in the test title, so a failure points straight at
 * the sentence to fix.
 *
 * Deliberately portal-agnostic. The rest of `test/integration/` uses the fixed
 * ids in `hooks-integration-jssdk.ts`, which are tuned to one portal; a skill
 * verification that fails on someone else's portal for lack of task #2 says
 * nothing about the skill. Entities are discovered at run time and a case skips
 * itself, loudly, when the portal has nothing to work with.
 *
 * Read-only by default. The two round-trip cases that write app options run
 * only with `B24_SKILLS_ALLOW_WRITE=1`, and restore what they found.
 *
 * Run: `pnpm run skills:verify` (needs `.env.test` with `B24_HOOK`).
 *
 * NOT covered here — everything that needs a live placement iframe: the whole
 * of `b24jssdk-frame-ui`, and the frame half of `b24jssdk-helpers` (Pull
 * subscription, `initializeB24Frame`). Those are a manual pass; see
 * `skills/VERIFICATION.md`.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { setupB24Tests } from '../../0_setup/hooks-integration-jssdk'
import { LoadDataType, useB24Helper } from '../../../packages/jssdk/src/'

/** Ids discovered from the portal, or null when it has no such entity. */
const found: { taskId: number | null, dealId: number | null, contactId: number | null } = {
  taskId: null,
  dealId: null,
  contactId: null
}

/**
 * Failures that say something about the portal or the webhook, not about the
 * skill. A restricted webhook, a plan without CRM, a missing scope — all arrive
 * as a thrown AjaxError and would otherwise look exactly like "the skill
 * documents something that does not work". They are reported as skips with the
 * portal's own words, so a red line in this suite always means a skill to fix.
 */
const ENVIRONMENT_LIMIT_CODE = /ACCESS_DENIED|INSUFFICIENT_SCOPE|PAYMENT_REQUIRED|NOT_FOUND_MODULE|METHOD_NOT_FOUND|INVALID_CREDENTIALS|ALLOWED_ONLY_INTRANET_USER/i

/**
 * The portal answers in the portal's language, so matching English alone is not
 * enough — a restricted plan says "Функция недоступна на текущем тарифе" on a
 * Russian portal and this suite reported it as a skill defect until both were
 * listed. Codes are matched first because they do not translate.
 *
 * Kept deliberately narrow: an unrecognised failure must go red. Erring towards
 * "skip" would hide the defects this suite exists to find, so an unfamiliar
 * limitation shows up as a failure whose message names the code — add it here
 * once, rather than widening the pattern on a guess.
 */
const ENVIRONMENT_LIMIT_MESSAGE = new RegExp([
  'not available on the current plan',
  'higher privileges',
  'insufficient scope',
  'method not found',
  'недоступна на текущем тарифе',
  'требует более высоких прав',
  'недостаточно прав',
  'метод не найден'
].join('|'), 'i')

function isEnvironmentLimit(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  const code = String((error as { code?: unknown }).code ?? '')
  return ENVIRONMENT_LIMIT_CODE.test(code) || ENVIRONMENT_LIMIT_MESSAGE.test(error.message)
}

/** `it`, but a portal/webhook limitation skips instead of failing. */
function portalIt(name: string, run: () => Promise<void>) {
  it(name, async (ctx) => {
    try {
      await run()
    } catch (error) {
      const code = String((error as { code?: unknown }).code ?? '—')
      if (isEnvironmentLimit(error)) {
        console.warn(
          `[skills-live] SKIP — ${name}\n`
          + `    portal limitation [${code}]: ${(error as Error).message}`
        )
        ctx.skip()
        return
      }
      // Not a limitation this suite recognises. Naming the code here is what
      // lets an unfamiliar one be added to the list above rather than guessed at.
      console.error(`[skills-live] FAIL — ${name}\n    error [${code}]: ${(error as Error).message}`)
      throw error
    }
  })
}

describe('skills-live @skills', () => {
  const { getB24Client } = setupB24Tests()

  /**
   * Discovery must never fail the suite. A hard error — a webhook without the
   * `crm` scope, say — arrives as a thrown AjaxError rather than a soft Result,
   * and an unguarded `beforeAll` would take every case down with it and report
   * nothing. A portal that cannot show us a deal should skip the deal cases and
   * still verify everything else.
   */
  async function discover<T>(
    label: string,
    run: () => Promise<T | null>
  ): Promise<T | null> {
    try {
      return await run()
    } catch (error) {
      console.warn(`[skills-live] discovery for ${label} failed: ${(error as Error).message}`)
      return null
    }
  }

  beforeAll(async () => {
    const b24 = getB24Client()

    found.taskId = await discover('task', async () => {
      const response = await b24.actions.v2.call.make<{ tasks: Array<{ id: string }> }>({
        method: 'tasks.task.list',
        params: { select: ['ID'], start: 0 },
        requestId: 'skills-live/discover-task'
      })
      return response.isSuccess
        ? Number(response.getData()!.result.tasks?.[0]?.id ?? NaN) || null
        : null
    })

    found.dealId = await discover('deal', async () => {
      const response = await b24.actions.v2.call.make<Array<{ ID: string }>>({
        method: 'crm.deal.list',
        params: { select: ['ID'], start: 0 },
        requestId: 'skills-live/discover-deal'
      })
      return response.isSuccess ? Number(response.getData()!.result?.[0]?.ID ?? NaN) || null : null
    })

    found.contactId = await discover('contact', async () => {
      const response = await b24.actions.v2.call.make<Array<{ ID: string }>>({
        method: 'crm.contact.list',
        params: { select: ['ID'], start: 0 },
        requestId: 'skills-live/discover-contact'
      })
      return response.isSuccess ? Number(response.getData()!.result?.[0]?.ID ?? NaN) || null : null
    })

    console.log(
      `[skills-live] discovered — task:${found.taskId ?? 'none'} `
      + `deal:${found.dealId ?? 'none'} contact:${found.contactId ?? 'none'}`
    )
  })

  // ── b24jssdk-core ──────────────────────────────────────────────────────
  describe('b24jssdk-core/SKILL.md', () => {
    portalIt('the boot snippet reaches the portal (actions.v2.call.make)', async () => {
      const response = await getB24Client().actions.v2.call.make({
        method: 'server.time',
        requestId: 'skills-live/core-boot'
      })
      expect(response.isSuccess).toBe(true)
      expect(response.getData()!.result).toBeDefined()
    })

    portalIt('a soft error is returned on the Result, not thrown', async () => {
      // The skill's central claim about error handling: an unknown method is a
      // soft error the caller inspects, not an exception.
      const response = await getB24Client().actions.v2.call.make({
        method: 'this.method.does.not.exist',
        requestId: 'skills-live/core-soft-error'
      })
      expect(response.isSuccess).toBe(false)
      expect(response.getErrorMessages().join(' ')).not.toBe('')
    })

    portalIt('the response carries the operating-budget fields the skill documents', async () => {
      const response = await getB24Client().actions.v2.call.make({
        method: 'server.time',
        requestId: 'skills-live/core-operating'
      })
      const time = response.getData()!.time
      expect(time).toHaveProperty('operating')
      expect(time).toHaveProperty('operating_reset_at')
    })
  })

  // ── b24jssdk-rest ──────────────────────────────────────────────────────
  describe('b24jssdk-rest/SKILL.md', () => {
    portalIt('actions.v2.batch.make returns one result per command', async () => {
      const response = await getB24Client().actions.v2.batch.make({
        calls: { now: ['server.time', {}], me: ['profile', {}] },
        isHaltOnError: false,
        requestId: 'skills-live/rest-v2-batch'
      })
      expect(response.isSuccess).toBe(true)
      const data = response.getData()!.result as Record<string, unknown>
      expect(Object.keys(data)).toEqual(expect.arrayContaining(['now', 'me']))
    })

    portalIt('actions.v2.callList.make pages a *.list method', async () => {
      const response = await getB24Client().actions.v2.callList.make<{ ID: string }>({
        method: 'crm.contact.list',
        params: { select: ['ID'] },
        idKey: 'ID',
        requestId: 'skills-live/rest-v2-callList'
      })
      expect(response.isSuccess).toBe(true)
      expect(Array.isArray(response.getData()!.result)).toBe(true)
    })

    portalIt('actions.v2.fetchList.make yields chunks', async () => {
      const generator = getB24Client().actions.v2.fetchList.make<{ ID: string }>({
        method: 'crm.contact.list',
        params: { select: ['ID'] },
        idKey: 'ID',
        requestId: 'skills-live/rest-v2-fetchList'
      })
      let chunks = 0
      for await (const chunk of generator) {
        expect(Array.isArray(chunk)).toBe(true)
        chunks++
        if (chunks >= 2) break
      }
      expect(chunks).toBeGreaterThanOrEqual(1)
    })

    portalIt('actions.v3.call.make reaches the v3 endpoint', async () => {
      if (found.taskId === null) {
        console.warn('[skills-live] SKIPPED: portal has no task to read')
        return
      }
      const response = await getB24Client().actions.v3.call.make<{ task: { id: number } }>({
        method: 'tasks.task.get',
        params: { id: found.taskId },
        requestId: 'skills-live/rest-v3-call'
      })
      expect(response.isSuccess).toBe(true)
      // The skill says v3 returns camelCase fields under a unified `result`.
      expect(response.getData()!.result.task).toHaveProperty('id')
    })

    portalIt('v3 tasks.task.list needs no cursorIdKey override (the skill\'s table)', async () => {
      // The skill states that on v3 `tasks.task.list` is all-lowercase — `id`
      // for both request and response, rows under `result.items` — unlike v2.
      const response = await getB24Client().actions.v3.callList.make<{ id: number }>({
        method: 'tasks.task.list',
        params: { select: ['id'] },
        idKey: 'id',
        customKeyForResult: 'items',
        requestId: 'skills-live/rest-v3-callList'
      })
      expect(response.isSuccess).toBe(true)
      expect(Array.isArray(response.getData()!.result)).toBe(true)
    })

    it('a method that is not on v3 fails softly, not by throwing', async () => {
      // The skill's claim after the allowlist removal: any method is sent, and
      // a non-v3 method comes back as a soft error.
      const response = await getB24Client().actions.v3.call.make({
        method: 'crm.deal.get',
        params: { id: found.dealId ?? 1 },
        requestId: 'skills-live/rest-v3-not-a-v3-method'
      })
      // Either the portal really does expose it on v3, or it is a soft error —
      // both are consistent with the skill. What must NOT happen is a throw,
      // and that is what reaching this line proves.
      expect(typeof response.isSuccess).toBe('boolean')
      if (!response.isSuccess) {
        console.log(`[skills-live] crm.deal.get on v3: ${response.getErrorMessages().join('; ')}`)
      }
    })

    it('actions.v3.aggregate.make — @experimental, records the outcome', async () => {
      // The skill marks this "unverified live; fall back to callList + reduce".
      // This case exists to answer that question on a real portal rather than
      // to gate the suite, so it reports and does not fail.
      try {
        const response = await getB24Client().actions.v3.aggregate.make({
          method: 'tasks.task.aggregate',
          params: { select: [{ field: 'id', type: 'count' }] },
          requestId: 'skills-live/rest-v3-aggregate'
        } as never)
        console.log(
          `[skills-live] v3 aggregate: isSuccess=${response.isSuccess} `
          + `${response.isSuccess ? JSON.stringify(response.getData()!.result) : response.getErrorMessages().join('; ')}`
        )
      } catch (error) {
        console.log(`[skills-live] v3 aggregate threw: ${(error as Error).message}`)
      }
      expect(true).toBe(true)
    })
  })

  // ── b24jssdk-filtering ─────────────────────────────────────────────────
  describe('b24jssdk-filtering/SKILL.md', () => {
    portalIt('a v2 prefix-keyed filter narrows the result set', async () => {
      if (found.contactId === null) {
        console.warn('[skills-live] SKIPPED: portal has no contact to filter on')
        return
      }
      const response = await getB24Client().actions.v2.callList.make<{ ID: string }>({
        method: 'crm.contact.list',
        params: { select: ['ID'], filter: { '>ID': found.contactId } },
        idKey: 'ID',
        requestId: 'skills-live/filtering-v2-prefix'
      })
      expect(response.isSuccess).toBe(true)
      for (const row of response.getData()!.result) {
        expect(Number(row.ID)).toBeGreaterThan(found.contactId!)
      }
    })

    portalIt('a v3 array-of-triples filter is accepted', async () => {
      const response = await getB24Client().actions.v3.callList.make<{ id: number }>({
        method: 'tasks.task.list',
        params: { select: ['id'], filter: [['id', '>', 0]] },
        idKey: 'id',
        customKeyForResult: 'items',
        requestId: 'skills-live/filtering-v3-triples'
      })
      expect(response.isSuccess).toBe(true)
    })

    portalIt('callList strips a caller-supplied order (the skill\'s warning)', async () => {
      // The skill says keyset pagination requires idKey ASC, so callList
      // discards any `order` the caller passes. Ask for DESC and confirm the
      // rows still come back ascending.
      const response = await getB24Client().actions.v2.callList.make<{ ID: string }>({
        method: 'crm.contact.list',
        params: { select: ['ID'], order: { ID: 'DESC' } },
        idKey: 'ID',
        requestId: 'skills-live/filtering-order-stripped'
      })
      expect(response.isSuccess).toBe(true)
      const ids = response.getData()!.result.map(r => Number(r.ID))
      const ascending = [...ids].sort((a, b) => a - b)
      expect(ids).toEqual(ascending)
    })
  })

  // ── b24jssdk-helpers (the half a webhook can reach) ─────────────────────
  describe('b24jssdk-helpers/SKILL.md', () => {
    portalIt('initB24Helper loads Profile and Currency over a webhook', async () => {
      // The skill's frontmatter says the helpers also work with B24Hook for
      // read-only data. `App` / `AppOptions` are deliberately not requested:
      // a webhook has no application context.
      const { initB24Helper, isInitB24Helper, getB24Helper, destroyB24Helper } = useB24Helper()
      try {
        await initB24Helper(
          getB24Client(),
          [LoadDataType.Profile, LoadDataType.Currency],
          'skills-live/helper-init'
        )
        expect(isInitB24Helper()).toBe(true)

        const helper = getB24Helper()
        expect(helper.profileInfo.data).toHaveProperty('id')
        expect(typeof helper.currency.baseCurrency).toBe('string')
        console.log(`[skills-live] base currency: ${helper.currency.baseCurrency}`)
      } finally {
        destroyB24Helper()
      }
    })

    portalIt('currency formatting uses the portal\'s own rules', async () => {
      const { initB24Helper, getB24Helper, destroyB24Helper } = useB24Helper()
      try {
        await initB24Helper(getB24Client(), [LoadDataType.Currency], 'skills-live/helper-currency')
        const helper = getB24Helper()
        const base = helper.currency.baseCurrency

        const literal = helper.currency.getCurrencyLiteral(base, 'en')
        const formatted = helper.currency.format(1234.56, base, 'en')
        console.log(`[skills-live] format(1234.56, '${base}', 'en') = ${formatted} (literal ${literal})`)

        expect(typeof formatted).toBe('string')
        expect(formatted.length).toBeGreaterThan(0)
      } finally {
        destroyB24Helper()
      }
    })
  })

  // ── b24jssdk-vibecode ──────────────────────────────────────────────────
  describe('b24jssdk-vibecode/SKILL.md', () => {
    portalIt('the SDK-side calls the skill documents succeed', async () => {
      const response = await getB24Client().actions.v2.call.make({
        method: 'profile',
        requestId: 'skills-live/vibecode-profile'
      })
      expect(response.isSuccess).toBe(true)
      expect(response.getData()!.result).toHaveProperty('ID')
    })
  })
})
