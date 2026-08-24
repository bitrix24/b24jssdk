/**
 * Security helpers shared by the recipes that verify a secret.
 * Isolated here so they can be unit-tested, and so there is exactly one copy:
 * a constant-time compare that drifts in one of two forks is a vulnerability
 * that looks like a refactor.
 */
import { timingSafeEqual } from 'node:crypto'

/**
 * Constant-time string compare. Use for any secret / token comparison so an
 * attacker can't recover the value by measuring response latency.
 *
 * Returns false when the lengths differ. That early return is itself
 * length-dependent, but comparing buffers of unequal length is not something
 * `timingSafeEqual` permits — it throws — and a token's length is not the
 * secret. Do not "fix" it by padding: that would compare the padding, not the
 * token.
 */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}
