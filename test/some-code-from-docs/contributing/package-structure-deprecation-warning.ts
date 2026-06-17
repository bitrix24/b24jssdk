/**
 * Canonical compile-checked example for the deprecation runtime-warning pattern,
 * shared by .github/contributing/package-structure.md (§ deprecation cycle, step 2)
 * and .github/contributing/transports-and-results.md (§ Logger discipline).
 *
 * Pins the LoggerFactory.forcedLog signature — (logger, action, message, context),
 * FOUR arguments, not three — and the `removalVersion` context key (the common
 * mistake the guides call out).
 *
 * If this file stops compiling, the contributing guides are out of sync with the SDK.
 * Prerequisite: pnpm run dev:prepare (builds dist/ and its type declarations).
 */

import type { LoggerInterface } from '@bitrix24/b24jssdk'
import { LoggerFactory } from '@bitrix24/b24jssdk'

export function warnDeprecated(logger: LoggerInterface): void {
  LoggerFactory.forcedLog(
    logger,
    'warning',
    'AbstractB24.callMethod() is deprecated and will be removed in version X.Y.Z. Use b24.actions.vX.call.make(options) instead.',
    {
      class: 'AbstractB24',
      method: 'callMethod',
      replacement: 'b24.actions.vX.call.make()',
      removalVersion: 'X.Y.Z'
    }
  )
}
