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
 * Half of the pair is tolerated too, and deliberately: `operating` without
 * `operating_reset_at` is the measured state of a portal whose limiter is on but
 * has no storage configured. What is still checked is that a counter which *did*
 * arrive makes sense.
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

  // Half a pair is tolerated, because it is a measured portal state rather than
  // a malformed envelope: with the portal's limiter switched on but no storage
  // configured, `operating` arrives on every response and `operating_reset_at`
  // never does. The SDK survives it — `updateStats` guards each counter
  // separately and keeps the previous reset point — so a suite run against such
  // a portal should not go red. When the value *is* there it still has to make
  // sense.
  if (undefined === time.operating_reset_at || null === time.operating_reset_at) {
    return
  }

  expect(time.operating_reset_at, `${label} operating_reset_at`).toBeGreaterThan(0)
}
