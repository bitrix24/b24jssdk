<script setup lang="ts">
/**
 * Manual check for the browser half of #455.
 *
 * A `restApi:v3` batch sends its commands **as** the request body — a bare
 * array, no envelope, nowhere inside for a credential. On a server the SDK puts
 * the token in an `Authorization: Bearer` header. A browser cannot: the portal
 * answers the CORS preflight with
 * `Access-Control-Allow-Headers: origin, content-type, accept`, so that header
 * would fail the preflight and the request would never leave. So in a browser
 * the SDK appends `?auth=<token>` to the URL instead.
 *
 * Everything above is verified against a live portal from Node with
 * `getEnvironment()` forced to report a browser, and by unit tests. What only a
 * real browser can settle is the **preflight**: whether Chrome/Firefox/Safari
 * actually let this request out. That is what this page is for — open it inside
 * a Bitrix24 frame and read the three lines it prints.
 *
 * Expected: the batch succeeds, the request URL carries `auth=`, and no
 * `Authorization` header is sent. A failure with a bare "Network Error" and
 * nothing in the response means the preflight refused it — the one outcome the
 * design is meant to avoid.
 */
import { onMounted, ref } from 'vue'
import type { B24Frame } from '@bitrix24/b24jssdk'
import { ApiVersion, LoggerFactory } from '@bitrix24/b24jssdk'

const { $initializeB24Frame } = useNuxtApp()
const $logger = LoggerFactory.createForBrowserDevelopment('playground/v3-batch-browser')

const lines = ref<string[]>([])
const done = ref(false)
const add = (...parts: unknown[]) => lines.value.push(parts.map(String).join(' '))

onMounted(async () => {
  let $b24: B24Frame | null = null

  try {
    $b24 = await $initializeB24Frame()

    // What actually went on the wire. `interceptors` is the only honest place to
    // read this: the SDK deliberately never logs the URL, precisely because it
    // now carries a credential.
    let seenUrl = ''
    let seenAuthHeader = false
    let seenBodyIsArray: boolean | null = null

    $b24.getHttpClient(ApiVersion.v3).ajaxClient.interceptors.request.use((config) => {
      seenUrl = `${String(config.baseURL ?? '')}${String(config.url ?? '')}`
      seenAuthHeader = Boolean((config.headers as Record<string, unknown>)['Authorization'])
      const raw = config.data
      const parsed: unknown = 'string' === typeof raw ? JSON.parse(raw) : raw
      seenBodyIsArray = Array.isArray(parsed)
      return config
    })

    // Two read-only commands. `user.current` needs only `user_brief`, which this
    // playground already asks for; swap in anything your app has a scope for.
    try {
      const response = await $b24.actions.v3.batch.make({
        calls: [
          ['main.eventlog.list', { select: ['id'], pagination: { limit: 1 } }],
          ['rest.scope.list', {}]
        ] as never
      })

      add('batch →', response.isSuccess ? 'OK' : 'FAILED')

      if (!response.isSuccess) {
        add('   portal said:', response.getErrorMessages().join(' | '))
      }
    } catch (error) {
      const asError = error as { code?: string, message?: string }
      add('batch threw:', asError.code ?? '', String(asError.message ?? error))
      add('   ↑ a bare network error with no status is what a refused preflight looks like')
    }

    add('body was an array:', String(seenBodyIsArray))
    add('Authorization header sent:', seenAuthHeader ? 'YES — unexpected in a browser' : 'no, as designed')
    add('credential in the URL:', seenUrl.includes('auth=') ? 'yes, as designed' : 'NO — unexpected')
  } catch (error) {
    add('could not initialise the frame:', String((error as Error)?.message ?? error))
  } finally {
    done.value = true
    $b24?.destroy()
    $logger.info('v3 batch browser probe finished', { lines: lines.value })
  }
})
</script>

<template>
  <div style="font: 14px/1.5 ui-monospace, monospace; padding: 16px">
    <h1 style="font-size: 16px; margin: 0 0 12px">
      v3 batch from a browser (#455)
    </h1>

    <p v-if="!done">
      running…
    </p>

    <pre v-else style="white-space: pre-wrap; margin: 0">{{ lines.join('\n') }}</pre>

    <p style="margin-top: 16px; color: #666">
      Open this page inside a Bitrix24 frame. It sends one v3 batch and reports
      what went on the wire. Also worth a look in the browser devtools Network
      tab: there should be an <code>OPTIONS</code> preflight that succeeds, then
      the <code>POST</code> — and the POST URL carries <code>auth=</code>.
    </p>
  </div>
</template>
