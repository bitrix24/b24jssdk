import type { Options } from 'prettier'

export interface SimplePrettier {
  format: (source: string, options?: Options) => Promise<string>
}

/**
 * The postMessage/reply bookkeeping between the page and the formatting worker,
 * kept in its own browser-free module so it can be tested without a Worker or a
 * DOM — the same reason `codeTransform.ts` was split out in #139. Upstream keeps
 * this body inline; the split is a deliberate divergence, see
 * `.github/contributing/docs-fork.md`.
 *
 * The contract this implements is the reason `workers/prettier.js` must reply to
 * every message: a pending call lives in `handlers` until a reply carrying its
 * `uid` arrives, so a message that never gets one is a promise that never
 * settles. `CodeExample.vue` awaits that promise.
 */
export interface WorkerLike {
  addEventListener: (type: 'message', listener: (event: { data: WorkerReply }) => void) => void
  postMessage: (message: unknown) => void
}

export type WorkerReply = {
  uid: number
  message?: string
  error?: string
}

export function createPrettierWorkerApi(worker: WorkerLike): SimplePrettier {
  let counter = 0
  const handlers = new Map<number, [(value: string) => void, (reason: unknown) => void]>()

  worker.addEventListener('message', (event) => {
    const { uid, message, error } = event.data

    const handler = handlers.get(uid)
    // A reply for a uid we do not know about. Dropped rather than thrown: the
    // only ways to get here are a duplicate reply or a reply after the entry was
    // already settled, and neither has a caller left to tell.
    if (!handler) {
      return
    }

    const [resolve, reject] = handler
    handlers.delete(uid)

    if (error) {
      reject(error)
      return
    }

    // Checked, not cast. `handleMessage` in the worker returns `undefined` for
    // any `type` it does not recognise, and the reply is posted regardless — so
    // an unknown type arrives as `{ uid, message: undefined, error: undefined }`
    // and, resolved blindly, would hand `CodeExample.vue` an `undefined` that
    // the types call a string. Unreachable while `format` is the only message
    // type; writing `as string` is what would make the next one a silent
    // landmine instead of a visible failure.
    if (typeof message !== 'string') {
      reject(new Error(`prettier worker returned no message for uid ${uid}`))
      return
    }

    resolve(message)
  })

  function postMessage(message: unknown) {
    const uid = ++counter
    return new Promise<string>((resolve, reject) => {
      handlers.set(uid, [resolve, reject])
      worker.postMessage({ uid, message })
    })
  }

  return {
    format(source: string, options?: Options) {
      return postMessage({ type: 'format', source, options })
    }
  }
}
