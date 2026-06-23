/**
 * #236 — HTTP logger payloads (post/send `params`, post/response `result`, and
 * post/catchError `responseData`) are length-capped by the shared `truncateForLog`
 * so a large body (HTML error page, big validation dump) can't flood a wired
 * logger sink. Previously `post/catchError` logged `error.response.data` uncapped.
 * This pins the cap boundary; the three callsites wire it (see abstract-http.ts).
 */
import { describe, it, expect } from 'vitest'
import { truncateForLog } from '../../../packages/jssdk/src/core/http/abstract-http'

describe('#236 truncateForLog caps oversized log payloads', () => {
  it('leaves a short string unchanged', () => {
    expect(truncateForLog('short value')).toBe('short value')
  })

  it('keeps a string at the 300-char boundary intact', () => {
    const atLimit = 'y'.repeat(300)
    expect(truncateForLog(atLimit)).toBe(atLimit)
  })

  it('truncates the first-over-boundary (301) string to a 100-char prefix + marker', () => {
    expect(truncateForLog('z'.repeat(301))).toBe('z'.repeat(100) + '...')
  })

  it('truncates an oversized string to a 100-char prefix + marker', () => {
    const out = truncateForLog('x'.repeat(5000))
    expect(out).toBe('x'.repeat(100) + '...')
    expect(out.length).toBe(103)
  })
})
