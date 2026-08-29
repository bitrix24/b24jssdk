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
 * Read-only. Every call is a `get` or a `list`; nothing here mutates a portal.
 * Keep it that way — if a write case is ever added it needs an explicit opt-in
 * flag, not a promise in this comment.
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
import { FilterV3, LoadDataType, useB24Helper } from '../../../packages/jssdk/src/'

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
const ENVIRONMENT_LIMIT_CODE = /ACCESS_DENIED|INSUFFICIENT_SCOPE|PAYMENT_REQUIRED|NOT_FOUND_MODULE|INVALID_CREDENTIALS|ALLOWED_ONLY_INTRANET_USER/i

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
  'недоступна на текущем тарифе',
  'требует более высоких прав',
  'недостаточно прав'
].join('|'), 'i')

// Deliberately NOT in the lists above: "method not found". A skill that
// documents a method the portal does not have is precisely the defect #113
// exists to catch, and classifying it as a portal limitation would skip the
// finding. The two cases that probe an unsupported method on purpose handle
// their own outcome with a plain `it`.

function isEnvironmentLimit(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  const code = String((error as { code?: unknown }).code ?? '')
  return ENVIRONMENT_LIMIT_CODE.test(code) || ENVIRONMENT_LIMIT_MESSAGE.test(error.message)
}

/**
 * `it`, but a portal/webhook limitation skips instead of failing.
 *
 * The body receives the test context so a case with no fixture to work on can
 * `ctx.skip()`. Returning early instead registers as a **pass** — two of the
 * four green results on a restricted portal had verified nothing, which breaks
 * the one property this suite needs: a green line means something was checked.
 */
function portalIt(name: string, run: (ctx: { skip: () => void }) => Promise<void>) {
  it(name, async (ctx) => {
    try {
      await run(ctx)
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

    portalIt('an unknown v3 method is a soft error on the Result, not a throw', async () => {
      // The claim is specific to v3 (b24jssdk-core/SKILL.md, "Common SdkError
      // codes"): since the allowlist was dropped, an unknown v3 method comes
      // back as a METHODNOTFOUNDEXCEPTION *on the result*.
      //
      // It does NOT hold on v2, where the same call throws
      // ERROR_METHOD_NOT_FOUND — an earlier version of this case asserted the
      // soft behaviour against v2 and reported the core skill as wrong. It is
      // not; the test was.
      const response = await getB24Client().actions.v3.call.make({
        method: 'this.method.does.not.exist',
        requestId: 'skills-live/core-v3-soft-error'
      })
      expect(response.isSuccess).toBe(false)
      expect(response.getErrorMessages().join(' ')).not.toBe('')
    })

    portalIt('the same unknown method throws on v2', async () => {
      // The other half of the same sentence, pinned so the asymmetry is
      // recorded rather than rediscovered.
      await expect(getB24Client().actions.v2.call.make({
        method: 'this.method.does.not.exist',
        requestId: 'skills-live/core-v2-throws'
      })).rejects.toThrow()
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
  /**
   * What `getData()` returns, per action — measured against a live portal, and
   * the thing this block used to get wrong (#425):
   *
   * | action            | `getData()`                                  |
   * | ----------------- | -------------------------------------------- |
   * | `call.make`       | the envelope: `{ result, time }`             |
   * | `batch.make`      | the keyed map directly: `{ now: …, me: … }`  |
   * | `callList.make`   | a flat array                                 |
   * | `batchByChunk`    | a flat array                                 |
   *
   * Only `call` has a `result` property. Reading `getData()!.result` off the
   * others yields `undefined`, which reads as an SDK or skill defect and is
   * neither — the skill files document these shapes correctly.
   *
   * Batch flags (`isHaltOnError`, `returnAjaxResult`) go under `options`. At the
   * top level they are silently ignored (#426), so a case written that way
   * verifies something other than what its title claims.
   */
  describe('b24jssdk-rest/SKILL.md', () => {
    portalIt('actions.v2.batch.make returns one result per command', async () => {
      const response = await getB24Client().actions.v2.batch.make({
        calls: { now: ['server.time', {}], me: ['profile', {}] },
        options: { isHaltOnError: false, requestId: 'skills-live/rest-v2-batch' }
      })
      expect(response.isSuccess).toBe(true)
      // The keyed map itself — batch has no `result` envelope.
      const data = response.getData() as Record<string, unknown>
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
      expect(Array.isArray(response.getData())).toBe(true)
    })

    portalIt('actions.v2.fetchList.make yields chunks', async (ctx) => {
      // A generator over an empty method yields nothing at all — correctly. That
      // is a portal with no contacts, not a skill defect, so it skips rather
      // than failing; asserting "at least one chunk" made an empty portal look
      // like a broken generator (#425).
      if (found.contactId === null) {
        console.warn('[skills-live] SKIP — no contact on this portal to page over')
        ctx.skip()
        return
      }
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

    portalIt('actions.v3.call.make reaches the v3 endpoint', async (ctx) => {
      if (found.taskId === null) {
        console.warn('[skills-live] SKIP — no task on this portal to read')
        ctx.skip()
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
      expect(Array.isArray(response.getData())).toBe(true)
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

    portalIt('batch reports per-command failures when isHaltOnError is false', async () => {
      // The skill's batch semantics: with halt-on-error off, a bad command does
      // not sink the good ones, and the failures are reachable by key.
      const response = await getB24Client().actions.v2.batch.make({
        calls: { good: ['server.time', {}], bad: ['this.method.does.not.exist', {}] },
        options: { isHaltOnError: false, requestId: 'skills-live/rest-v2-batch-partial' }
      })
      const errorsByKey = response.getErrorsByKey?.() ?? {}
      expect(Object.keys(errorsByKey)).toContain('bad')
      const data = response.getData() as Record<string, unknown>
      expect(data.good).toBeDefined()
    })

    portalIt('actions.v2.batchByChunk.make takes a command list, not a method', async () => {
      // One of the five primitives in the skill's decision table, and the only
      // one with no other coverage here. Note the shape: `calls` + `options`,
      // and `getData()` is a FLAT array — not the `{ result }` envelope the
      // other actions return. Writing it like `callList` is the obvious
      // mistake, and it fails with a TypeError rather than a portal error.
      const calls: Array<[string, Record<string, unknown>]> = [
        ['server.time', {}],
        ['profile', {}]
      ]
      const response = await getB24Client().actions.v2.batchByChunk.make({
        calls,
        options: { isHaltOnError: false, requestId: 'skills-live/rest-v2-batchByChunk' }
      })
      expect(response.isSuccess).toBe(true)
      expect(Array.isArray(response.getData())).toBe(true)
    })

    portalIt('v2 tasks.task.list needs idKey id with cursorIdKey ID', async (ctx) => {
      // The asymmetry the skill calls out as "most notably": on v2 the method
      // sorts and filters by `ID` but returns lowercase `id`, so the cursor
      // needs both keys. Getting this wrong pages forever or not at all.
      if (found.taskId === null) {
        console.warn('[skills-live] SKIP — no task on this portal to page')
        ctx.skip()
        return
      }
      const response = await getB24Client().actions.v2.callList.make<{ id: string }>({
        method: 'tasks.task.list',
        params: { select: ['ID'] },
        idKey: 'id',
        cursorIdKey: 'ID',
        customKeyForResult: 'tasks',
        requestId: 'skills-live/rest-v2-tasks-cursor'
      })
      expect(response.isSuccess).toBe(true)
      expect(Array.isArray(response.getData())).toBe(true)
    })

    portalIt('crm.item.list needs lowercase idKey and customKeyForResult items', async () => {
      // The skill's primary CRM pattern: v3 entities called on v2 still return
      // rows under `items` with a lowercase id.
      const response = await getB24Client().actions.v2.callList.make<{ id: number }>({
        method: 'crm.item.list',
        params: { entityTypeId: 3, select: ['id'] },
        idKey: 'id',
        customKeyForResult: 'items',
        requestId: 'skills-live/rest-crm-item-list'
      })
      expect(response.isSuccess).toBe(true)
      expect(Array.isArray(response.getData())).toBe(true)
    })

    portalIt('actions.v3.fetchTail.make drives the native cursor', async () => {
      // v3-only, and distinct from fetchList: it uses the server's own `tail`
      // action rather than an emulated keyset.
      const generator = getB24Client().actions.v3.fetchTail.make<{ id: number }>({
        method: 'main.eventlog.tail',
        params: { select: ['id'] },
        cursorField: 'id',
        requestId: 'skills-live/rest-v3-fetchTail'
      })
      let chunks = 0
      for await (const chunk of generator) {
        expect(Array.isArray(chunk)).toBe(true)
        chunks++
        break
      }
      expect(chunks).toBeGreaterThanOrEqual(0)
    })

    it('actions.v3.aggregate.make — @experimental, surveys every candidate module', async () => {
      // The maintainer's position on this action is doubt: `AggregateV3` is
      // `@experimental` because no module on the reference portal was known to
      // expose an `*.aggregate` endpoint, and the working assumption is that it
      // does not work anywhere yet. This case exists to replace that assumption
      // with an answer, so it **surveys several modules** rather than probing one
      // and it prints a table ready to paste into #113.
      //
      // It reports and never fails: a portal where nothing supports `aggregate`
      // is a finding about Bitrix24's v3 rollout, not a defect in a skill file.
      // Whoever runs it must read the output — a green line here proves nothing
      // on its own, which is the opposite of every other case in this suite.
      //
      // An earlier version probed `tasks.task.aggregate` alone and logged
      // `getData()!.result`. `make()` resolves to `Result<AggregateResultV3>`,
      // whose data **is** the buckets — there is no `.result` on it, so the log
      // printed `undefined` for a successful call. It answered nothing while
      // looking like it did; the whole bucket object is printed now.
      const candidates: Array<{ method: string }> = [
        { method: 'tasks.task.aggregate' },
        { method: 'crm.deal.aggregate' },
        { method: 'crm.contact.aggregate' },
        { method: 'crm.company.aggregate' },
        { method: 'crm.lead.aggregate' },
        { method: 'main.eventlog.aggregate' }
      ]

      const outcomes: string[] = []
      for (const candidate of candidates) {
        try {
          // `select` is top level and keyed by aggregate function — NOT nested
          // under `params` as a `{ field, type }[]`, a shape that does not exist
          // in `ActionAggregateV3` and only ever type-checked behind an
          // `as never`: `options.select` came out undefined, the shape
          // validation iterated zero times, and the request went out empty.
          const response = await getB24Client().actions.v3.aggregate.make({
            method: candidate.method,
            select: { count: ['id'] },
            requestId: `skills-live/rest-v3-aggregate/${candidate.method}`
          })
          outcomes.push(
            response.isSuccess
              ? `  OK    ${candidate.method} → ${JSON.stringify(response.getData())}`
              : `  SOFT  ${candidate.method} → ${response.getErrorMessages().join('; ')}`
          )
        } catch (error) {
          const code = String((error as { code?: unknown }).code ?? '')
          outcomes.push(`  THROW ${candidate.method} → ${code || '(no code)'} ${(error as Error).message}`)
        }
      }

      console.log(
        '[skills-live] v3 aggregate survey — paste into #113:\n'
        + outcomes.join('\n')
        + '\n  Read: OK = the endpoint exists and answered. SOFT = the server rejected it\n'
        + '  (METHODNOTFOUNDEXCEPTION here means the module has no *.aggregate yet).\n'
        + '  THROW = the SDK or transport failed, which IS a defect worth reporting.\n'
        + '  If every line is SOFT/THROW, `AggregateV3` stays @experimental and the\n'
        + '  docs must keep telling readers to reduce a callList client-side.'
      )
      // Deliberately not asserted: see the comment above. The output is the test.
      expect(outcomes).toHaveLength(candidates.length)
    })
  })

  // ── b24jssdk-filtering ─────────────────────────────────────────────────
  describe('b24jssdk-filtering/SKILL.md', () => {
    portalIt('a v2 prefix-keyed filter narrows the result set', async (ctx) => {
      if (found.contactId === null) {
        console.warn('[skills-live] SKIP — no contact on this portal to filter on')
        ctx.skip()
        return
      }
      const response = await getB24Client().actions.v2.callList.make<{ ID: string }>({
        method: 'crm.contact.list',
        params: { select: ['ID'], filter: { '>ID': found.contactId } },
        idKey: 'ID',
        requestId: 'skills-live/filtering-v2-prefix'
      })
      expect(response.isSuccess).toBe(true)
      for (const row of response.getData()!) {
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

    portalIt('the FilterV3 builder produces a filter the server accepts', async () => {
      // The skill tells readers to build nested v3 groups with FilterV3 rather
      // than by hand; this checks the built shape is actually accepted.
      const filter = FilterV3.and(
        FilterV3.gt('id', 0)
      )
      const response = await getB24Client().actions.v3.callList.make<{ id: number }>({
        method: 'tasks.task.list',
        params: { select: ['id'], filter: FilterV3.build(filter) },
        idKey: 'id',
        customKeyForResult: 'items',
        requestId: 'skills-live/filtering-v3-builder'
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
      const ids = response.getData()!.map(r => Number(r.ID))
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
