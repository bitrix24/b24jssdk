import type { B24FrameQueryParams } from './types/auth'
import type { RestrictionParams } from './types/limiters'
import type { ApiVersion } from './types/b24'
import { B24Frame } from './frame'
import { SdkError } from './core/sdk-error'

// The single in-flight (or resolved) initialization. Every caller shares it, so
// concurrent callers await ONE handshake and a resolved value is returned
// instantly. On failure it is cleared so a later call can retry from scratch.
// This replaces the former 50ms busy-poll + four coordination booleans
// (isInit / connectError / isMakeFirstCall / isStartWatch) with a single cached
// promise — same public contract, no polling, no stranded awaiters. (#142)
let initPromise: null | Promise<B24Frame> = null

function parseFrameQueryParams(): B24FrameQueryParams {
  const queryParams: B24FrameQueryParams = {
    DOMAIN: null,
    PROTOCOL: false,
    APP_SID: null,
    LANG: null
  }

  if (window.name) {
    const [domain, protocol, appSid] = window.name.split('|')
    queryParams.DOMAIN = domain
    queryParams.PROTOCOL = Number.parseInt(protocol ?? '0') === 1
    queryParams.APP_SID = appSid
    queryParams.LANG = null
  }

  return queryParams
}

async function makeFrame(
  options?: {
    version?: ApiVersion
    restrictionParams?: Partial<RestrictionParams>
  }
): Promise<B24Frame> {
  const queryParams = parseFrameQueryParams()

  if (!queryParams.DOMAIN || !queryParams.APP_SID) {
    // Opened outside the Bitrix24 iframe (direct URL, dev server, install
    // screen): window.name carries no DOMAIN/APP_SID. Fail fast — do NOT build a
    // B24Frame (which would subscribe a window `message` listener and post to an
    // invalid origin). (#142)
    throw new SdkError({
      code: 'JSSDK_CLIENT_SIDE_WARNING',
      description: 'Well done! Now paste this URL into the Bitrix24 app settings',
      status: 500
    })
  }

  const b24Frame = new B24Frame(queryParams, options)

  try {
    await b24Frame.init()
  } catch (error) {
    // The frame's constructor already subscribed a window `message` listener;
    // tear it down so a retry can't leave two live handlers cross-talking.
    // Guarded so a throwing destroy() can't mask the real init error. (#142)
    try {
      b24Frame.destroy()
    } catch {
      // ignore — init already failed; we only care about detaching listeners
    }
    throw error
  }

  return b24Frame
}

export async function initializeB24Frame(
  options?: {
    version?: ApiVersion
    restrictionParams?: Partial<RestrictionParams>
  }
): Promise<B24Frame> {
  // Concurrent callers (and calls after a success) share the one promise — a
  // later caller's `options` are ignored; the first caller's frame is returned.
  if (initPromise !== null) {
    return initPromise
  }

  const pending = makeFrame(options)
  initPromise = pending

  // Drop the cached promise on failure so a subsequent call retries from
  // scratch; keep it on success so the resolved frame is reused. The caller's
  // own rejection still propagates via the returned `pending`.
  pending.catch(() => {
    if (initPromise === pending) {
      initPromise = null
    }
  })

  return pending
}
