/**
 * `initializeB24Frame()` must carry `httpOptions` all the way to axios.
 *
 * The factory is the only supported way to build a `B24Frame` — the docs say so
 * in as many words — and a browser is where the SDK asks axios for the `fetch`
 * adapter, so `{ adapter: 'xhr' }` here is the documented way back. Pinning the
 * signature is not enough: what a reader is promised is that the option reaches
 * the transport, and the transports are built inside `init()`, one layer below
 * where the option is handed over.
 *
 * The parent window is stubbed rather than mocked away: `window.name` carries
 * the `DOMAIN|PROTOCOL|APP_SID` triple the factory parses, and the stubbed
 * `parent.postMessage` echoes the `getInitData` answer back through the real
 * `message` listener. So this drives the actual handshake, with no portal.
 *
 * Also pinned: the factory's singleton keeps the **first** call's options and
 * silently ignores a later call's. That is deliberate — one frame per page — but
 * it is a sharper surprise now that `adapter` can be passed here, so it is a
 * tested property rather than a comment.
 *
 * `*.unit.spec.ts` — no portal required.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { ApiVersion } from '../../../packages/jssdk/src/'
import { defineGlobal, restoreGlobal } from '../../0_setup/browser-globals'

const DOMAIN = 'example.bitrix24.com'
const APP_SID = 'test-app-sid'

const INIT_DATA = {
  AUTH_ID: 'ACCESS_TOKEN_PLACEHOLDER',
  REFRESH_ID: 'REFRESH_TOKEN_PLACEHOLDER',
  AUTH_EXPIRES: 3600,
  MEMBER_ID: 'member',
  IS_ADMIN: false,
  LANG: 'en',
  APP_SID
}

type Listener = (event: MessageEvent) => void

/**
 * Stand in for the Bitrix24 parent page: answer every command the frame sends
 * with the payload it expects, addressed to the callback key the frame minted.
 */
function installParentWindow(): { listeners: Listener[] } {
  const listeners: Listener[] = []

  const post = (cmd: string): void => {
    // `<command>:<params>:<callbackKey>:<appSid>` — the key is what the answer
    // has to be addressed to.
    const parts = cmd.split(':')
    const callbackKey = parts.find(part => part.startsWith('b24-'))
      ?? parts[parts.length - 2]
      ?? ''

    queueMicrotask(() => {
      for (const listener of listeners) {
        listener({
          origin: `https://${DOMAIN}`,
          data: `${callbackKey}:${JSON.stringify(INIT_DATA)}`
        } as MessageEvent)
      }
    })
  }

  defineGlobal('window', {
    name: `${DOMAIN}|1|${APP_SID}`,
    addEventListener: (type: string, listener: Listener) => {
      if ('message' === type) {
        listeners.push(listener)
      }
    },
    removeEventListener: () => {},
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: number) => clearTimeout(id),
    location: { href: `https://${DOMAIN}/app` }
  })
  defineGlobal('parent', { postMessage: (cmd: string) => post(cmd) })

  return { listeners }
}

describe('initializeB24Frame carries httpOptions to the transports', () => {
  afterEach(() => {
    vi.resetModules()
    restoreGlobal('window')
    restoreGlobal('parent')
  })

  it('reaches the live axios instance', async () => {
    installParentWindow()

    // Fresh module instance per case: the factory caches the resolved frame in
    // a module-level promise, which is the behaviour the next case is about.
    const { initializeB24Frame } = await import('../../../packages/jssdk/src/loader-b24frame')

    const b24 = await initializeB24Frame({ httpOptions: { adapter: 'xhr', timeout: 4321 } })

    try {
      const axiosInstance = b24.getHttpClient(ApiVersion.v2).ajaxClient
      expect(axiosInstance.defaults.adapter).toBe('xhr')
      expect(axiosInstance.defaults.timeout).toBe(4321)
    } finally {
      b24.destroy()
    }
  })

  it('keeps the first call\'s options and ignores a later call\'s', async () => {
    installParentWindow()

    const { initializeB24Frame } = await import('../../../packages/jssdk/src/loader-b24frame')

    const first = await initializeB24Frame({ httpOptions: { adapter: 'xhr' } })
    const second = await initializeB24Frame({ httpOptions: { adapter: 'http' } })

    try {
      // One frame per page, by design — so the second call's adapter never
      // applies. Documented on the factory's page, because silently dropping an
      // adapter is a surprise worth naming.
      expect(second).toBe(first)
      expect(second.getHttpClient(ApiVersion.v2).ajaxClient.defaults.adapter).toBe('xhr')
    } finally {
      first.destroy()
    }
  })
})
