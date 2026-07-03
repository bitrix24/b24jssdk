import type { B24FrameQueryParams } from './types/auth'
import type { RestrictionParams } from './types/limiters'
import type { ApiVersion } from './types/b24'
import { B24Frame } from './frame'
import { SdkError } from './core/sdk-error'

type whileB24InitCallback = {
  resolve: (b24Frame: B24Frame) => void
  reject: (error: any) => void
}

const delay = 50

let $b24Frame: null | B24Frame = null
let isInit = false
let connectError: null | Error = null
let isMakeFirstCall = false

let listCallBack: whileB24InitCallback[] = []
let isStartWatch = false

// region Watch ////
function startWatch() {
  window.setTimeout(() => {
    // Poll only while initialization is still pending — i.e. it has neither
    // succeeded (isInit + $b24Frame) NOR failed (connectError). Previously the
    // loop ignored connectError, so a failed init kept polling forever and every
    // queued caller waited on a promise that never settled. Now a terminal
    // failure ends the loop and flushes the queue with a rejection. (#142)
    if (connectError === null && (!isInit || $b24Frame === null)) {
      startWatch()
      return
    }

    processResult()
    listCallBack = []
    // Let a later initializeB24Frame() re-arm the watch if it retries. (#142)
    isStartWatch = false
  }, delay)
}

function processResult(): void {
  if (null !== connectError) {
    for (const callBack of listCallBack) {
      callBack.reject(connectError)
    }
    return
  }

  if (!isInit || $b24Frame === null) {
    return
  }

  for (const callBack of listCallBack) {
    callBack.resolve($b24Frame as B24Frame)
  }
}

// Terminal failure of the first init: record the error, reject everyone already
// queued (so no awaiter is stranded), clear the queue, and reset isMakeFirstCall
// so a subsequent initializeB24Frame() can retry from scratch. (#142)
function failInit(error: Error): void {
  connectError = error

  // Tear down the frame built by the failed attempt: its constructor subscribed
  // a window `message` listener that only B24Frame.destroy() removes. Without
  // this, a retry would build a SECOND frame and leave the first listener live —
  // two handlers then process the same incoming messages (cross-talk), not just
  // a leak. Guarded so a throwing destroy() can't mask the real error. (#142)
  if ($b24Frame !== null) {
    try {
      $b24Frame.destroy()
    } catch {
      // ignore — the init already failed; we only care about detaching listeners
    }
    $b24Frame = null
  }

  const queued = listCallBack
  listCallBack = []
  for (const callBack of queued) {
    callBack.reject(error)
  }

  isMakeFirstCall = false
}
// endregion ////

export async function initializeB24Frame(
  options?: {
    version?: ApiVersion
    restrictionParams?: Partial<RestrictionParams>
  }
): Promise<B24Frame> {
  // region isInit ////
  if (isInit && null !== $b24Frame) {
    return Promise.resolve($b24Frame)
  }
  // endregion ////

  // region Not First Call ///
  if (isMakeFirstCall) {
    // region startWatch ///
    if (!isStartWatch) {
      isStartWatch = true
      startWatch()
    }
    // endregion ////

    return new Promise((resolve, reject) => {
      listCallBack.push({
        resolve: resolve,
        reject: reject
      })
    })
  }
  // endregion ////

  // region First Call ///
  isMakeFirstCall = true
  // Start each fresh attempt from a clean slate so a retry after a previous
  // failure isn't poisoned by the old connectError (which would otherwise make
  // startWatch reject the new attempt's callers too). (#142)
  connectError = null
  $b24Frame = null
  isInit = false

  return new Promise((resolve, reject) => {
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

    if (!queryParams.DOMAIN || !queryParams.APP_SID) {
      // Reject AND stop: previously execution fell through here, constructing a
      // B24Frame (which subscribes a window `message` listener) and calling
      // .init() against an invalid target origin. Bail out cleanly instead. (#142)
      const error = new SdkError({
        code: 'JSSDK_CLIENT_SIDE_WARNING',
        description: 'Well done! Now paste this URL into the Bitrix24 app settings',
        status: 500
      })
      reject(error)
      failInit(error)
      return
    }

    $b24Frame = new B24Frame(
      queryParams,
      options
    )

    $b24Frame
      .init()
      .then(() => {
        isInit = true
        resolve($b24Frame as B24Frame)
      })
      .catch((error) => {
        reject(error)
        failInit(error)
      })
  })
  // endregion ////
}
