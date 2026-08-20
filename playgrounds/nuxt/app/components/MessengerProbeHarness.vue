<script setup lang="ts">
/**
 * Messenger / call probe harness — for #331.
 *
 * Every messenger method this SDK exposes is deprecated upstream, and every
 * recommended replacement is a TOP-WINDOW global (`BX.Messenger.Public.*`) that
 * an app placement iframe cannot reach. This harness answers, from inside a real
 * placement, the three questions the issue asks:
 *
 *   A. do the deprecated `im*` bridges still work?
 *   B. is any top-window Messenger object reachable from the iframe at all?
 *   C. does the parent frame handler already accept an undocumented command for
 *      the new methods — the way it accepts `imPhoneTo` today?
 *
 * (C) is the one that decides the issue. `imPhoneTo` works because the app posts
 * the literal string `imPhoneTo:…` to the parent window and a handler there runs
 * the real call. If the parent also answers `startPhoneCall` or `openChat`, the
 * migration path already exists and only needs documenting. If it answers none
 * of them, apps have no path and Bitrix24 has to add one.
 *
 * The probe posts the SAME wire format the SDK uses, built only from public API
 * (`getAppSid()` / `getTargetOrigin()`), and listens for a reply keyed to its own
 * callback id. It deliberately does NOT use the SDK's `isSafely` auto-resolve:
 * that resolves on a timer whether or not anyone answered, which would make
 * "handled" and "ignored" look identical — exactly the distinction we need.
 *
 * Nothing here changes portal data. The call/chat probes DO open a real UI on
 * the portal (that is the observable being measured), so run them on a test
 * portal with a number and dialog you are happy to poke.
 */
import { onMounted, onBeforeUnmount, ref } from 'vue'
import type { B24Frame } from '@bitrix24/b24jssdk'
import { LoggerFactory } from '@bitrix24/b24jssdk'

const { $initializeB24Frame } = useNuxtApp()
const $logger = LoggerFactory.createForBrowserDevelopment('[playground] MessengerProbe')

type Tone = 'info' | 'ok' | 'err' | 'warn'
type Row = {
  n: number
  group: string
  label: string
  detail: string
  outcome: string
  tone: Tone
  ms: number
}

let $b24: B24Frame
const isInit = ref(false)
const rows = ref<Row[]>([])
const transcript = ref('')
let counter = 0

// Inputs — defaults are obviously-fake placeholders; set them for your portal.
const phone = ref('+70000000000')
const userId = ref('1')
const dialogId = ref('1')
const chatId = ref('chat1')
const withVideo = ref(false)

/** How long to wait for a reply before calling a command unanswered. */
const PROBE_TIMEOUT_MS = 2500

function record(group: string, label: string, detail: string, outcome: string, tone: Tone, ms: number): void {
  rows.value.push({ n: ++counter, group, label, detail, outcome, tone, ms })
}

// ===================== A · the deprecated bridges we ship =====================

async function runDeprecated(label: string, detail: string, fn: () => Promise<unknown>): Promise<void> {
  const startedAt = Date.now()
  try {
    const result = await fn()
    const ms = Date.now() - startedAt
    // `isSafely` is on inside the SDK for these, so a resolve of
    // `{ isSafely: true }` means "nobody answered, the timer fired" — not success.
    const viaTimer = !!result && typeof result === 'object' && 'isSafely' in (result as object)
    record(
      'A · deprecated im* bridge',
      label,
      detail,
      viaTimer
        ? `resolved by the SDK safety timer after ${ms}ms — no reply from the parent`
        : `answered: ${JSON.stringify(result)}`,
      viaTimer ? 'warn' : 'ok',
      ms
    )
  } catch (error) {
    record('A · deprecated im* bridge', label, detail,
      'threw: ' + (error instanceof Error ? error.message : String(error)),
      'err', Date.now() - startedAt)
  }
}

// ===================== B · can we see the top window at all? =====================

function probeGlobals(): void {
  const checks: Array<[string, () => string]> = [
    ['window.BX', () => typeof (window as any).BX],
    ['window.BX.Messenger', () => String(typeof (window as any).BX?.Messenger)],
    ['window.BX.Messenger.Public', () => String(typeof (window as any).BX?.Messenger?.Public)],
    ['window.parent === window', () => String(window.parent === window)],
    ['window.parent.BX (cross-origin read)', () => typeof (window.parent as any).BX],
    ['window.top.location.href (cross-origin read)', () => String((window.top as any).location.href)]
  ]
  for (const [label, read] of checks) {
    const startedAt = Date.now()
    try {
      const value = read()
      record('B · top-window reachability', label, 'direct property read',
        `readable → ${value}`,
        value === 'undefined' ? 'warn' : 'ok', Date.now() - startedAt)
    } catch (error) {
      // A SecurityError here is the POINT: it is the evidence that the
      // documented `BX.Messenger.Public.*` example cannot run from an app.
      record('B · top-window reachability', label, 'direct property read',
        'blocked: ' + (error instanceof Error ? `${error.name}: ${error.message}` : String(error)),
        'err', Date.now() - startedAt)
    }
  }
}

// ============ C · does the parent already accept a newer command name? ============

/**
 * Post one raw command in the SDK's own wire format and wait for a reply.
 *
 * Format, from MessageManager.send: a command with no `:` is sent as the string
 * `command:params:callbackKey:appSid`, where empty parts are dropped. The reply
 * arrives as a message whose data starts with the callback key.
 */
function probeCommand(command: string, params: Record<string, unknown> | null): Promise<{ answered: boolean, data?: string, ms: number }> {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    const callbackKey = `probe_${Date.now()}_${Math.floor(performance.now() * 1000)}`
    const targetOrigin = $b24.getTargetOrigin()
    const appSid = $b24.getAppSid()

    const onMessage = (event: MessageEvent): void => {
      if (event.origin !== targetOrigin) return
      if (typeof event.data !== 'string') return
      if (!event.data.startsWith(callbackKey)) return
      window.removeEventListener('message', onMessage)
      window.clearTimeout(timeoutId)
      resolve({ answered: true, data: event.data, ms: Date.now() - startedAt })
    }

    const timeoutId = window.setTimeout(() => {
      window.removeEventListener('message', onMessage)
      resolve({ answered: false, ms: Date.now() - startedAt })
    }, PROBE_TIMEOUT_MS)

    window.addEventListener('message', onMessage)

    const parts = [params ? JSON.stringify(params) : '', callbackKey, appSid].filter(Boolean)
    const wire = `${command}:${parts.join(':')}`
    $logger.info('probe →', { command, targetOrigin }).catch(() => {})
    window.parent.postMessage(wire, targetOrigin)
  })
}

/**
 * Command names worth trying, and why each is plausible.
 *
 * The SDK's own commands are bare camelCase (`imPhoneTo`), so the first guesses
 * mirror the new public method names in that style. The dotted/namespaced forms
 * are included because `MessageManager.send` has a separate object-shaped branch
 * for commands containing `:`, which suggests the parent understands some
 * namespaced vocabulary too.
 */
const CANDIDATES: Array<{ command: string, params: Record<string, unknown> | null, why: string }> = [
  { command: 'startPhoneCall', params: { number: '' }, why: 'new public name, SDK-style bare camelCase' },
  { command: 'imStartPhoneCall', params: { number: '' }, why: 'new name under the existing im* prefix' },
  { command: 'messengerStartPhoneCall', params: { number: '' }, why: 'new name under a messenger* prefix' },
  { command: 'startVideoCall', params: { dialogId: '', withVideo: false }, why: 'new public name for the video call' },
  { command: 'openChat', params: { dialogId: '' }, why: 'new public name replacing openMessenger + openHistory' },
  { command: 'imOpenChat', params: { dialogId: '' }, why: 'openChat under the existing im* prefix' }
]

async function probeCandidates(): Promise<void> {
  for (const candidate of CANDIDATES) {
    // Probe with EMPTY payloads: we are asking "does a handler exist", not
    // trying to place a call. A handler that exists should still answer (even
    // if only to reject the empty argument); no handler answers nothing.
    const outcome = await probeCommand(candidate.command, candidate.params)
    record(
      'C · undocumented command probe',
      candidate.command,
      candidate.why,
      outcome.answered
        ? `ANSWERED in ${outcome.ms}ms → ${outcome.data}`
        : `silent for ${PROBE_TIMEOUT_MS}ms — no handler`,
      outcome.answered ? 'ok' : 'warn',
      outcome.ms
    )
  }
}

/** Control probe: a command we KNOW the parent handles, to prove the probe works. */
async function probeControl(): Promise<void> {
  const outcome = await probeCommand('imOpenMessenger', { dialogId: dialogId.value })
  record(
    'C · undocumented command probe',
    'imOpenMessenger (CONTROL)',
    'known-good command — if this is silent, the probe itself is wrong, not the parent',
    outcome.answered
      ? `ANSWERED in ${outcome.ms}ms → ${outcome.data}`
      : `silent for ${PROBE_TIMEOUT_MS}ms — probe is NOT trustworthy, do not read section C`,
    outcome.answered ? 'ok' : 'err',
    outcome.ms
  )
}

// ================================ runners ================================

async function runAll(): Promise<void> {
  rows.value = []
  counter = 0
  transcript.value = ''

  record('0 · context', 'targetOrigin', 'from $b24.getTargetOrigin()', $b24.getTargetOrigin(), 'info', 0)
  record('0 · context', 'appSid', 'from $b24.getAppSid()', $b24.getAppSid() ? 'present' : 'MISSING', 'info', 0)
  record('0 · context', 'userAgent', 'browser', navigator.userAgent, 'info', 0)

  probeGlobals()
  await probeControl()
  await probeCandidates()

  transcript.value = buildTranscript()
}

async function runDeprecatedAll(): Promise<void> {
  await runDeprecated('imPhoneTo', `phone=${phone.value}`, () => $b24.parent.imPhoneTo(phone.value))
  await runDeprecated('imCallTo', `userId=${userId.value} video=${withVideo.value}`,
    () => $b24.parent.imCallTo(Number(userId.value), withVideo.value))
  await runDeprecated('imOpenMessenger', `dialogId=${dialogId.value}`,
    () => $b24.parent.imOpenMessenger(Number(dialogId.value)))
  await runDeprecated('imOpenHistory', `dialogId=${dialogId.value}`,
    () => $b24.parent.imOpenHistory(Number(dialogId.value)))
  transcript.value = buildTranscript()
}

function buildTranscript(): string {
  const lines: string[] = [
    '# Messenger / call probe — #331',
    '',
    `Portal: ${$b24.getTargetOrigin()}`,
    `Run at: ${new Date().toISOString()}`,
    `Probe timeout: ${PROBE_TIMEOUT_MS}ms`,
    '',
    '| # | group | what | why / detail | outcome | ms |',
    '|---|---|---|---|---|---|'
  ]
  for (const row of rows.value) {
    const cell = (text: string) => text.replaceAll('|', '\\|').replaceAll('\n', ' ')
    lines.push(`| ${row.n} | ${cell(row.group)} | \`${cell(row.label)}\` | ${cell(row.detail)} | ${cell(row.outcome)} | ${row.ms} |`)
  }
  lines.push('', '## How to read this', '',
    '- **Section B** all-blocked is the evidence that `BX.Messenger.Public.*` is unreachable from a placement.',
    '- **Section C** is decisive only if the CONTROL row answered. If the control is silent, the probe is broken and section C says nothing.',
    '- A candidate that ANSWERED is an existing, undocumented migration path — it needs documenting, not building.',
    '- All candidates silent means apps currently have no path, and one has to be added upstream.')
  return lines.join('\n')
}

async function copyTranscript(): Promise<void> {
  try {
    await navigator.clipboard.writeText(transcript.value)
  } catch {
    // clipboard is best-effort; the textarea below is always selectable
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
    <h2>Messenger / call probe — issue #331</h2>

    <p v-if="!isInit">
      Initialising inside the placement…
    </p>

    <template v-else>
      <fieldset>
        <legend>Inputs (use values that are safe to poke on a test portal)</legend>
        <label>phone <input v-model="phone" size="18"></label>
        <label>userId <input v-model="userId" size="6"></label>
        <label>dialogId <input v-model="dialogId" size="10"></label>
        <label>chatId <input v-model="chatId" size="10"></label>
        <label>withVideo <input v-model="withVideo" type="checkbox"></label>
      </fieldset>

      <div class="actions">
        <button @click="runAll">
          Run probe (safe — opens nothing)
        </button>
        <button @click="runDeprecatedAll">
          Run deprecated im* (WILL open call/chat UI)
        </button>
      </div>

      <table v-if="rows.length">
        <thead>
          <tr><th>#</th><th>group</th><th>what</th><th>why / detail</th><th>outcome</th><th>ms</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.n" :class="row.tone">
            <td>{{ row.n }}</td>
            <td>{{ row.group }}</td>
            <td><code>{{ row.label }}</code></td>
            <td>{{ row.detail }}</td>
            <td>{{ row.outcome }}</td>
            <td>{{ row.ms }}</td>
          </tr>
        </tbody>
      </table>

      <template v-if="transcript">
        <h3>Transcript to hand over</h3>
        <button @click="copyTranscript">
          Copy
        </button>
        <textarea :value="transcript" rows="14" spellcheck="false" readonly />
      </template>
    </template>
  </div>
</template>

<style scoped>
.probe { font: 13px/1.5 ui-monospace, Menlo, Consolas, monospace; }
fieldset { margin-block: 8px; }
label { margin-right: 12px; }
.actions { display: flex; gap: 8px; margin-block: 8px; }
table { border-collapse: collapse; width: 100%; margin-top: 12px; }
th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; vertical-align: top; }
tr.ok td { background: #eefaee; }
tr.err td { background: #fdeeee; }
tr.warn td { background: #fff8e5; }
tr.info td { background: #f4f4f4; }
textarea { width: 100%; margin-top: 8px; font: inherit; }
</style>
