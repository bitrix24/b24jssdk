<script setup lang="ts">
/**
 * Deprecation trigger for #331.
 *
 * The job here is narrow on purpose: fire ONE deprecated messenger method at a
 * time so the portal prints its own deprecation notice, and make that notice
 * attributable. The portal already tells us what to use instead — calling
 * `imOpenMessenger` produces:
 *
 *   Developer: method BXIM.openMessenger is deprecated. Use method
 *   'Messenger.openChat' from 'im.public' or 'im.public.iframe' extension.
 *
 * So the harness does not need to guess command names. It needs to produce that
 * line, cleanly, for each of the four deprecated methods. Working out how to
 * reach the replacement is the browser assistant's job, from the top window
 * (see MESSENGER-PROBE-BRIEF.md).
 *
 * An earlier version of this file guessed at undocumented command names and
 * probed them in a batch. That was wrong twice over: the `im*` commands are
 * fire-and-forget, so silence proved nothing, and batching made side effects
 * unattributable. Both are gone.
 *
 * Every button here opens real UI on the portal. There is no safe mode, and
 * pretending otherwise is what broke the first run.
 */
import { onMounted, onBeforeUnmount, ref } from 'vue'
import type { B24Frame } from '@bitrix24/b24jssdk'
import { LoggerFactory } from '@bitrix24/b24jssdk'

const { $initializeB24Frame } = useNuxtApp()
const $logger = LoggerFactory.createForBrowserDevelopment('[playground] MessengerProbe')

type Row = { n: number, label: string, detail: string, outcome: string, tone: 'ok' | 'err' | 'warn' | 'info', ms: number }

let $b24: B24Frame
const isInit = ref(false)
const rows = ref<Row[]>([])
let counter = 0

const phone = ref('+70000000000')
const userId = ref('1')
const dialogId = ref('1')
const withVideo = ref(false)

/** Marker printed to the console so the portal's own notice can be attributed. */
const MARK = '#331 ▸'

function record(label: string, detail: string, outcome: string, tone: Row['tone'], ms: number): void {
  rows.value.push({ n: ++counter, label, detail, outcome, tone, ms })
}

/**
 * Fire one deprecated method and record what came back.
 *
 * `isSafely` is on inside the SDK for all four, so a resolve of
 * `{ isSafely: true }` means the parent never answered and a timer fired — not
 * success. That distinction is why the outcome column exists.
 */
async function trigger(label: string, detail: string, fn: () => Promise<unknown>): Promise<void> {
  console.info(`${MARK} calling ${label} — the next portal notice belongs to this call`)
  const startedAt = Date.now()
  try {
    const result = await fn()
    const ms = Date.now() - startedAt
    const viaTimer = !!result && typeof result === 'object' && 'isSafely' in (result as object)
    record(label, detail,
      viaTimer ? `no reply; SDK safety timer resolved after ${ms}ms` : `answered: ${JSON.stringify(result)}`,
      viaTimer ? 'warn' : 'ok', ms)
  } catch (error) {
    record(label, detail, 'threw: ' + (error instanceof Error ? error.message : String(error)), 'err', Date.now() - startedAt)
  }
  console.info(`${MARK} done ${label}`)
}

const callPhoneTo = () => trigger('im.phoneTo', `phone=${phone.value}`, () => $b24.parent.imPhoneTo(phone.value))
const callCallTo = () => trigger('im.callTo', `userId=${userId.value} video=${withVideo.value}`,
  () => $b24.parent.imCallTo(Number(userId.value), withVideo.value))
const callOpenMessenger = () => trigger('im.openMessenger', `dialogId=${dialogId.value}`,
  () => $b24.parent.imOpenMessenger(Number(dialogId.value)))
const callOpenHistory = () => trigger('im.openHistory', `dialogId=${dialogId.value}`,
  () => $b24.parent.imOpenHistory(Number(dialogId.value)))

/**
 * Context worth having in the report: proof that the recommended replacements
 * are unreachable from here. Cheap, reads nothing sensitive, opens nothing.
 */
function recordContext(): void {
  rows.value = []
  counter = 0
  record('targetOrigin', 'from $b24.getTargetOrigin()', $b24.getTargetOrigin(), 'info', 0)
  for (const [label, read] of [
    ['window.BX', () => String(typeof (window as any).BX)],
    ['window.parent.BX', () => String(typeof (window.parent as any).BX)],
    ['window.top.location.href', () => String((window.top as any).location.href)]
  ] as Array<[string, () => string]>) {
    try {
      record(label, 'direct read from the frame', `readable → ${read()}`, 'info', 0)
    } catch (error) {
      // The SecurityError is the point: it is why the documented
      // `BX.Messenger.Public.*` example cannot run inside an app.
      record(label, 'direct read from the frame',
        'blocked: ' + (error instanceof Error ? `${error.name}: ${error.message}` : String(error)), 'err', 0)
    }
  }
}

onMounted(async () => {
  try {
    $b24 = await $initializeB24Frame()
    isInit.value = true
  } catch (error) {
    $logger.error('init failed', { error }).catch(() => {})
  }
})

onBeforeUnmount(() => {
  $b24?.destroy?.()
})
</script>

<template>
  <div class="probe">
    <h2>Deprecation trigger — issue #331</h2>

    <p v-if="!isInit">
      Initialising inside the placement…
    </p>

    <template v-else>
      <p class="warn-note">
        Every button below opens real UI on the portal. Open the console, keep it
        on the <strong>portal</strong> frame, close any open slider or messenger
        window, then press <strong>one</strong> button and read the notice that
        follows the <code>#331 ▸</code> marker.
      </p>

      <fieldset>
        <legend>Inputs — use values that are safe to poke on a test portal</legend>
        <label>phone <input v-model="phone" size="18"></label>
        <label>userId <input v-model="userId" size="6"></label>
        <label>dialogId <input v-model="dialogId" size="8"></label>
        <label>withVideo <input v-model="withVideo" type="checkbox"></label>
      </fieldset>

      <div class="actions">
        <button @click="recordContext">
          Show context (opens nothing)
        </button>
      </div>

      <div class="actions">
        <button @click="callPhoneTo">
          im.phoneTo → expect: startPhoneCall
        </button>
        <button @click="callCallTo">
          im.callTo → expect: startVideoCall
        </button>
        <button @click="callOpenMessenger">
          im.openMessenger → expect: openChat
        </button>
        <button @click="callOpenHistory">
          im.openHistory → expect: openChat
        </button>
      </div>

      <table v-if="rows.length">
        <thead>
          <tr><th>#</th><th>what</th><th>detail</th><th>outcome</th><th>ms</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.n" :class="row.tone">
            <td>{{ row.n }}</td>
            <td><code>{{ row.label }}</code></td>
            <td>{{ row.detail }}</td>
            <td>{{ row.outcome }}</td>
            <td>{{ row.ms }}</td>
          </tr>
        </tbody>
      </table>
    </template>
  </div>
</template>

<style scoped>
.probe { font: 13px/1.5 ui-monospace, Menlo, Consolas, monospace; }
.warn-note { background: #fff8e5; padding: 8px; border-radius: 4px; }
fieldset { margin-block: 8px; }
label { margin-right: 12px; }
.actions { display: flex; gap: 8px; margin-block: 8px; flex-wrap: wrap; }
table { border-collapse: collapse; width: 100%; margin-top: 12px; }
th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; vertical-align: top; }
tr.ok td { background: #eefaee; }
tr.err td { background: #fdeeee; }
tr.warn td { background: #fff8e5; }
tr.info td { background: #f4f4f4; }
</style>
