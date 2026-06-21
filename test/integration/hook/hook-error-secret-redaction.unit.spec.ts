/**
 * #43 — `B24Hook` must never echo the webhook secret. The webhook URL carries the
 * secret in its path (`/rest/<userId>/<secret>/`), so a parse/format failure must
 * not leak it into a thrown error message. Portal-free (jsSdk:unit).
 */
import { describe, it, expect } from 'vitest'
import { B24Hook } from '../../../packages/jssdk/src/'

const SECRET = 'WEBHOOK_SECRET_SENTINEL_xyz123'

describe('#43 B24Hook does not leak the webhook secret in error messages', () => {
  it('a malformed webhook URL throws without echoing the URL/secret', () => {
    // no scheme → `new URL()` throws inside fromWebhookUrl
    const bad = `rest/1/${SECRET}`
    expect(() => B24Hook.fromWebhookUrl(bad)).toThrow()
    try {
      B24Hook.fromWebhookUrl(bad)
    } catch (e) {
      expect((e as Error).message).not.toContain(SECRET)
    }
  })

  it('a non-numeric userId segment throws without echoing the segment (it may be the secret)', () => {
    // transposed URL — the secret sits where the userId should be
    const bad = `https://x.bitrix24.com/rest/${SECRET}/1/`
    expect(() => B24Hook.fromWebhookUrl(bad)).toThrow()
    try {
      B24Hook.fromWebhookUrl(bad)
    } catch (e) {
      expect((e as Error).message).not.toContain(SECRET)
    }
  })
})
