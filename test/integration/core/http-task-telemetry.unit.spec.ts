/**
 * Locks the `task.*` telemetry carve-out in the shared `_prepareMethod` (#207).
 *
 * The SDK appends telemetry query params (`bx24_request_id` / `bx24_sdk_ver` /
 * `bx24_sdk_type`) to the request URL. The legacy positional `task.*` methods
 * (`task.commentitem.*`, `task.checklistitem.*`, …) read the request query string
 * POSITIONALLY, so those params shift `Param #0` and the server rejects the call:
 * `WRONG_ARGUMENTS: Param #0 (taskId) ... expected integer, but given something
 * else`. Verified live against a portal — `task.commentitem.getlist` /
 * `task.checklistitem.getlist` succeed WITHOUT the telemetry params and fail WITH
 * them; modern `tasks.task.*` (named params) is unaffected.
 *
 * Before #207 only `HttpV2` had the carve-out; `HttpV3` always appended telemetry,
 * so once the v3 method allowlist was dropped (#259) a positional `task.*` routed
 * through `actions.v3.*` was broken. The carve-out now lives once on
 * `AbstractHttp`; this test pins that BOTH transports suppress telemetry for
 * `task.` methods, keep it for everything else, and build identical URLs — so the
 * two paths can't drift apart again. Pure logic, no portal — jsSdk:unit.
 */
import { describe, it, expect } from 'vitest'
import { HttpV2 } from '../../../packages/jssdk/src/core/http/v2'
import { HttpV3 } from '../../../packages/jssdk/src/core/http/v3'
import type { AuthActions } from '../../../packages/jssdk/src/types/auth'

const BASE = 'https://example.bitrix24.example/rest/1/TEST_SECRET'
const RID = 'req-0000'
const TELEMETRY = ['bx24_request_id', 'bx24_sdk_ver', 'bx24_sdk_type']

function makeV2(): HttpV2 {
  return new HttpV2({} as unknown as AuthActions, null)
}
function makeV3(): HttpV3 {
  return new HttpV3({} as unknown as AuthActions, null)
}
function prep(http: HttpV2 | HttpV3, method: string): string {
  return (http as unknown as { _prepareMethod: (r: string, m: string, b: string) => string })
    ._prepareMethod(RID, method, BASE)
}

// Any method whose name contains `task.` → telemetry suppressed. The match is a
// deliberate over-approximation: it also covers modern `tasks.task.*` /
// `bizproc.task.*` (telemetry-safe, they just lose the optional tracing param).
const SUPPRESSED = [
  'task.commentitem.getlist', // verified live: breaks with telemetry
  'task.checklistitem.getlist', // verified live: breaks with telemetry
  'task.commentitem.add',
  'task.elapseditem.getlist',
  'tasks.task.list', // modern named-param method — matched only by the broad substring; would NOT break with telemetry, just loses the optional param
  'bizproc.task.list'
]
// No `task.` substring → telemetry appended.
const WITH_TELEMETRY = ['crm.item.list', 'user.current', 'crm.deal.get', 'profile']

describe('_prepareMethod task.* telemetry carve-out (#207)', () => {
  for (const [label, make] of [['v2', makeV2], ['v3', makeV3]] as const) {
    it.each(SUPPRESSED)(`${label}: omits telemetry for %s`, (method) => {
      const url = prep(make(), method)
      expect(url).toBe(`${BASE}/${encodeURIComponent(method)}`)
      for (const p of TELEMETRY) {
        expect(url).not.toContain(p)
      }
    })

    it.each(WITH_TELEMETRY)(`${label}: appends telemetry for %s`, (method) => {
      const url = prep(make(), method)
      expect(url.startsWith(`${BASE}/${encodeURIComponent(method)}?`)).toBe(true)
      for (const p of TELEMETRY) {
        expect(url).toContain(p)
      }
    })
  }

  it('v2 and v3 build identical URLs — no transport drift (the #207 fix)', () => {
    for (const method of [...SUPPRESSED, ...WITH_TELEMETRY]) {
      expect(prep(makeV2(), method)).toBe(prep(makeV3(), method))
    }
  })

  it('regression: v3 omits telemetry for positional task.commentitem.getlist (was broken pre-#207)', () => {
    const url = prep(makeV3(), 'task.commentitem.getlist')
    expect(url).toBe(`${BASE}/task.commentitem.getlist`)
    expect(url).not.toContain('?')
  })
})
