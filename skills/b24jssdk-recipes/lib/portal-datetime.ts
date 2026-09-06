/**
 * Date formatting for `restApi:v3` fields.
 *
 * Shared rather than copied: two recipes write task deadlines, and a format
 * rule that drifts in one of two forks is a bug that reads like a refactor.
 */

/**
 * Format a `Date` for a v3 `DateTime` field.
 *
 * `Date.toISOString()` alone does not work: it emits milliseconds (`.000Z`),
 * and the portal rejects the value outright with "требуется тип данных
 * `DateTime`". Measured against a portal — the identical value without the
 * milliseconds is accepted, and reads back in the portal's own timezone.
 *
 * @example
 * const deadline = new Date()
 * deadline.setDate(deadline.getDate() + 5)
 * toPortalDateTime(deadline) // '2026-09-10T05:53:22Z'
 */
export function toPortalDateTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}
