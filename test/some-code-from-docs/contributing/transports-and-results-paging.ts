/**
 * Canonical compile-checked example for v2 cursor-based paging from
 * .github/contributing/transports-and-results.md (§ Result Type).
 *
 * v2 paging: result.isMore() + result.getNext(b24.getHttpClient(ApiVersion.v2)).
 * AjaxResult (returned by b24.actions.v2.call.make) has isMore() and getNext().
 *
 * NOTE: neither is deprecated, but both are restApi:v2-only. isMore() answers false
 * under restApi:v3 (no `next` field); getNext() throws there.
 * For new code prefer b24.actions.v3.callList.make() or fetchList.make().
 *
 * v3 does NOT support getNext() — calling it throws at runtime:
 *   "restApi:v3 not support method getNext"
 * Use b24.actions.v3.callList.make() / fetchList.make() for v3 list iteration instead.
 *
 * If this file stops compiling, the contributing guide is out of sync with the SDK.
 * Prerequisite: pnpm run dev:prepare (builds dist/ and its type declarations).
 */

import type { TypeB24 } from '@bitrix24/b24jssdk'
import { ApiVersion } from '@bitrix24/b24jssdk'

export async function pagingV2Example(b24: TypeB24) {
  const result = await b24.actions.v2.call.make({
    method: 'crm.deal.list',
    params: { filter: {}, select: ['ID', 'TITLE'] },
    requestId: 'app/crm.deal.list'
  })

  // Both are restApi:v2-only. For new paging code prefer callList / fetchList,
  // which hide the offset bookkeeping and work under both protocol versions.
  if (result.isMore()) {
    // Pass the v2 http client so the same limiter stack is preserved on the next page.
    const next = await result.getNext(b24.getHttpClient(ApiVersion.v2))
    void next
  }
}
