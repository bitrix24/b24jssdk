/**
 * Canonical compile-checked example for the B24Hook quick-start from
 * .github/contributing/documentation.md (§ Code examples) — the most common
 * beginner entry point.
 *
 * If this file stops compiling, the contributing guide is out of sync with the SDK.
 * Prerequisite: pnpm run dev:prepare (builds dist/ and its type declarations).
 */

import { B24Hook } from '@bitrix24/b24jssdk'

export async function quickStart(): Promise<void> {
  // Read the URL from env / config; never hard-code the webhook secret.
  const b24 = B24Hook.fromWebhookUrl(
    'https://your-portal.bitrix24.com/rest/YOUR_USER_ID/YOUR_WEBHOOK_SECRET/'
  )
  const result = await b24.actions.v3.call.make({
    method: 'user.current',
    requestId: 'docs/user.current'
  })
  void result
}
