import { expect } from 'vitest'
import type { PayloadTime } from '../../packages/jssdk/src/types/payloads'

/**
 * Assert the shape of the portal's operating counters — but only when the
 * portal sent them.
 *
 * They are optional, and their absence is the *normal* self-hosted state rather
 * than a broken envelope: `CRestServer::appendDebugInfo()` adds
 * `operating` / `operating_reset_at` only while the portal's own operating
 * limiter is active, which on-premise reads the `rest` module option
 * `load_limiter_active` — default `N`, and nothing in the product ever writes
 * it. A cloud portal always sends them, on `restApi:v2` and `restApi:v3` alike,
 * so against the cloud these assertions still run on every call. (#459)
 *
 * What is *not* tolerated is half of the pair: a response carrying `operating`
 * without `operating_reset_at` is a shape problem worth reporting, and is what
 * this still fails on. That is deliberately stricter than the SDK, which
 * tolerates the half-pair by guarding each counter separately — the limiter has
 * to survive it, but a portal doing it is news.
 *
 * @param time - The `time` block from the response, if one came back at all.
 * @param label - Names the call in a failure message, since these run across
 *   many methods and batch rows.
 */
export function expectOperatingCounters(time: PayloadTime | undefined, label: string): void {
  expect(time, `${label} returned no time block`).toBeDefined()

  // `null` counts as absent, because the SDK counts it as absent: the limiter
  // guards `undefined || null` before writing any statistics. Checking only for
  // `undefined` here would redden a portal the SDK itself handles quietly.
  if (undefined === time?.operating || null === time.operating) {
    return
  }

  expect(time.operating, `${label} operating`).toBeGreaterThanOrEqual(0)
  expect(time.operating_reset_at, `${label} sent operating without operating_reset_at`).toBeGreaterThan(0)
}
