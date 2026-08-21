import { describe, it, expect } from 'vitest'
import { setupB24Tests } from '../../0_setup/hooks-integration-jssdk'

/**
 * Read-path smoke tests for the rest-v3 modules added in #203 — `mail.*`,
 * `humanresources.*`, `timeman.record.*` (#205).
 *
 * Why these exist. #203 wired routing for ~63 newly published v3 methods, and
 * nothing confirmed the request/response actually round-trips on a live portal.
 * That gap widened when the client-side allowlist was removed in 2.0.0: the SDK
 * now sends **any** method to the v3 endpoint and lets the server decide, so
 * there is no client-side signal left at all. A live call is the only check.
 *
 * What is asserted. One list method per module, and the v3 envelope around it:
 * `result` present, and a `time` block whose `operating` counters are the shape
 * the limiter reads. Nothing about the records themselves — a portal may hold
 * none, and an empty list is a perfectly good round-trip.
 *
 * **Local-only.** These need `B24_HOOK`, and CI does not run Vitest at all (see
 * .github/contributing/testing.md). The webhook needs the `mail`,
 * `humanresources` and `timeman` scopes on top of the usual set; `mail` and
 * `humanresources` in particular depend on the portal's plan and may simply not
 * be available, which is a legitimate reason to skip rather than to fail.
 *
 * On failure the assertion message carries the portal's own error text, because
 * the three causes need different actions and are otherwise indistinguishable:
 * a missing scope (`insufficient_scope`) is a webhook fix, `METHODNOTFOUND` means
 * the module is absent or the method is not on v3 after all, and anything else is
 * a real shape problem worth reporting.
 */

/** Field shape the limiter reads off every v3 response. */
type V3Time = {
  operating: number
  operating_reset_at: number
}

async function smokeList(
  b24: ReturnType<ReturnType<typeof setupB24Tests>['getB24Client']>,
  method: string,
  params: Record<string, unknown> = {}
): Promise<void> {
  const requestId = `test@apiV3/${method}`
  const response = await b24.actions.v3.call.make<Record<string, unknown>>({ method, params, requestId })

  // The portal's own words, so a red test says which of the three causes it is.
  expect(
    response.isSuccess,
    `${method} failed: ${response.getErrorMessages().join('; ')}`
  ).toBe(true)

  const data = response.getData()!
  expect(data.result, `${method} returned no result envelope`).toBeDefined()

  const time = data.time as unknown as V3Time
  expect(time).toHaveProperty('operating')
  expect(time.operating).toBeGreaterThanOrEqual(0)
  expect(time.operating_reset_at).toBeGreaterThan(0)
}

describe('core.actions.call @apiV3 — modules from #203', () => {
  const { getB24Client } = setupB24Tests()

  describe('mail', () => {
    it('mail.mailbox.list @apiV3 isSuccess', async () => {
      await smokeList(getB24Client(), 'mail.mailbox.list')
    })
  })

  describe('humanresources', () => {
    it('humanresources.node.list @apiV3 isSuccess', async () => {
      await smokeList(getB24Client(), 'humanresources.node.list')
    })
  })

  describe('timeman', () => {
    it('timeman.record.list @apiV3 isSuccess', async () => {
      await smokeList(getB24Client(), 'timeman.record.list')
    })
  })
})
