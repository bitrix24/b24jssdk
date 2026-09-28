<script setup lang="ts">
/**
 * Slider lab — live measurements for #486 (`openSliderAppPage`).
 *
 * Three questions, each answered by the portal rather than by reading code:
 *
 * 1. **When does the promise settle, and with what?** The report says "when the
 *    slider is CLOSED, not when it opens". The page records the time between the
 *    call and the settle, and the exact value it settled with.
 * 2. **Where does it never settle?** On some clients the parent frame never
 *    answers. The page never awaits the call: it attaches `.then`, and marks the
 *    run "not settled" when the watchdog runs out.
 * 3. **How large may the parameters be?** A 1–2 KB JSON reportedly does not
 *    arrive. The page sends payloads of growing size and has the opened frame
 *    report what it received.
 *
 * How the opened frame reports back: `openSliderAppPage` opens the app's
 * REGISTERED handler URL — the index page, not this one. The index page sees
 * `slider_lab_role: 'child'` in the placement options and routes here; this
 * page then runs in child mode. Both frames are served from the app's origin,
 * so the child writes what it received to `localStorage` and the parent reads
 * it once the slider settles.
 *
 * `isSafely` is deliberately not used: it would settle the promise after its
 * timer with `{ isSafely: true }` while the slider is still open, and drop the
 * real answer — which is exactly what this page measures.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { B24Frame } from '@bitrix24/b24jssdk'
import { LoggerFactory } from '@bitrix24/b24jssdk'

const { $initializeB24Frame } = useNuxtApp()
const $logger = LoggerFactory.createForBrowserDevelopment('playground/slider-lab')

const STORAGE_KEY = 'b24jssdk:slider-lab:child-report'
const WATCHDOG_MS = 120_000
const SIZES = [0, 256, 512, 1024, 2048, 4096, 8192] as const

interface ChildReport {
  runId: string
  expectedSize: number
  receivedSize: number | null
  payloadIntact: boolean
  optionKeys: string[]
  isSliderMode: boolean
  at: number
}

interface RunRecord {
  runId: string
  kind: 'open-close' | 'payload'
  payloadSize: number
  startedAt: number
  settledAfterMs: number | null
  settledWith: unknown
  rejectedWith: string | null
  child: ChildReport | null
  note: string
}

let $b24: B24Frame | null = null
const role = ref<'parent' | 'child' | 'none'>('none')
const initError = ref('')
const runs = ref<RunRecord[]>([])
const busy = ref(false)
const childReport = ref<ChildReport | null>(null)
const env = ref<Record<string, unknown>>({})
let activeRun = ''
const timers = new Set<ReturnType<typeof setTimeout>>()

function payloadOf(size: number): string {
  // ASCII only, so bytes === characters and the size is exact on the wire.
  return 'x'.repeat(size)
}

function readChildReport(runId: string): ChildReport | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ChildReport
    return parsed.runId === runId ? parsed : null
  } catch {
    return null
  }
}

function start(kind: RunRecord['kind'], payloadSize: number): void {
  if (!$b24 || busy.value) return
  busy.value = true
  const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const record: RunRecord = {
    runId,
    kind,
    payloadSize,
    startedAt: Date.now(),
    settledAfterMs: null,
    settledWith: undefined,
    rejectedWith: null,
    child: null,
    note: 'waiting — close the slider when it has opened'
  }
  activeRun = runId
  runs.value.unshift(record)
  const row = runs.value[0]!

  let settled = false
  const watchdog = setTimeout(() => {
    timers.delete(watchdog)
    if (settled) return
    row.note = `NOT SETTLED after ${WATCHDOG_MS / 1000} s — this is the "never settles" case`
    row.child = readChildReport(runId)
    if (activeRun === runId) busy.value = false
  }, WATCHDOG_MS)
  timers.add(watchdog)

  // Never awaited: an `await` here would be the very bug #486 describes.
  $b24.slider.openSliderAppPage({
    bx24_title: `slider-lab ${kind} ${payloadSize} B`,
    bx24_width: 900,
    slider_lab_role: 'child',
    slider_lab_run: runId,
    slider_lab_size: payloadSize,
    slider_lab_payload: payloadOf(payloadSize)
  }).then((value: unknown) => {
    settled = true
    row.settledAfterMs = Date.now() - row.startedAt
    row.settledWith = value
    row.note = row.note.startsWith('NOT SETTLED') ? `${row.note}; settled later` : 'settled'
  }).catch((error: unknown) => {
    settled = true
    row.settledAfterMs = Date.now() - row.startedAt
    row.rejectedWith = String((error as Error)?.message ?? error)
    row.note = 'rejected'
  }).finally(() => {
    clearTimeout(watchdog)
    timers.delete(watchdog)
    row.child = readChildReport(runId)
    // A late settle of a timed-out run must not unlock a newer run's buttons.
    if (activeRun === runId) busy.value = false
  })
}

async function closeFromChild(): Promise<void> {
  // Not awaited for the answer: on some builds it never comes (#328).
  $b24?.slider.closeSliderAppPage().catch(() => {})
}

const report = computed(() => ({
  generatedAt: new Date().toISOString(),
  issue: 486,
  env: env.value,
  watchdogMs: WATCHDOG_MS,
  runs: runs.value
}))

function downloadReport(): void {
  const blob = new Blob([JSON.stringify(report.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `slider-lab-${Date.now().toString(36)}.json`
  link.click()
  // Revoked later: revoking right after click() can cancel the download.
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

onMounted(async () => {
  try {
    $b24 = await $initializeB24Frame()
    const options = $b24.placement.options as Record<string, unknown>

    env.value = {
      userAgent: navigator.userAgent,
      placement: $b24.placement.placement,
      isSliderMode: $b24.placement.isSliderMode,
      lang: $b24.getLang()
    }

    if (options['slider_lab_role'] === 'child') {
      role.value = 'child'
      const expected = Number(options['slider_lab_size'] ?? -1)
      const received = typeof options['slider_lab_payload'] === 'string' ? options['slider_lab_payload'] : null
      const reportData: ChildReport = {
        runId: String(options['slider_lab_run'] ?? ''),
        expectedSize: expected,
        receivedSize: received === null ? null : received.length,
        payloadIntact: received !== null && received === payloadOf(expected),
        optionKeys: Object.keys(options),
        isSliderMode: $b24.placement.isSliderMode,
        at: Date.now()
      }
      childReport.value = reportData
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(reportData))
      } catch {
        // Storage blocked: the report stays on screen only.
      }
      return
    }

    role.value = 'parent'
  } catch (error) {
    initError.value = String((error as Error)?.message ?? error)
    $logger.error('slider-lab init failed', { error: initError.value }).catch(() => {})
  }
})

onUnmounted(() => {
  for (const timer of timers) clearTimeout(timer)
  $b24?.destroy()
})
</script>

<template>
  <div style="font: 14px/1.5 ui-monospace, monospace; padding: 16px">
    <h1 style="font-size: 16px; margin: 0 0 12px">
      Slider lab — openSliderAppPage (#486)
    </h1>

    <p v-if="initError" style="color: #b00">
      Could not initialise the frame: {{ initError }}. Open this page inside a Bitrix24 frame.
    </p>

    <p v-else-if="role === 'none'">
      initialising…
    </p>

    <!-- Child: the frame the slider opened -->
    <div v-else-if="role === 'child'" data-testid="slider-lab-child">
      <p><b>Child frame</b> (opened by the slider). What arrived:</p>
      <pre style="white-space: pre-wrap">{{ JSON.stringify(childReport, null, 2) }}</pre>
      <p>
        <button data-testid="slider-lab-close" @click="closeFromChild">
          Close this slider (closeSliderAppPage)
        </button>
        — or close it with the portal's own ✕.
      </p>
    </div>

    <!-- Parent: runs and results -->
    <div v-else data-testid="slider-lab-parent">
      <p>
        Each button opens a slider and <b>does not await</b> it. Close the slider
        when it has opened; the row shows how long the promise took to settle and
        with what. A run that has not settled after {{ WATCHDOG_MS / 1000 }} s is
        marked NOT SETTLED.
      </p>

      <p>
        <button data-testid="slider-lab-open" :disabled="busy" @click="start('open-close', 0)">
          1 · open, then close (timing and value)
        </button>
      </p>

      <p>
        2 · payload size:
        <button
          v-for="size in SIZES"
          :key="size"
          :data-testid="`slider-lab-size-${size}`"
          :disabled="busy"
          style="margin-right: 6px"
          @click="start('payload', size)"
        >
          {{ size }} B
        </button>
      </p>

      <p>
        <button data-testid="slider-lab-download" @click="downloadReport">
          Download JSON report
        </button>
      </p>

      <table style="border-collapse: collapse; width: 100%">
        <thead>
          <tr>
            <th align="left">
              kind
            </th>
            <th align="left">
              size
            </th>
            <th align="left">
              settled after
            </th>
            <th align="left">
              settled with
            </th>
            <th align="left">
              child received
            </th>
            <th align="left">
              note
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="run in runs" :key="run.runId" :data-testid="`slider-lab-run-${run.runId}`">
            <td>{{ run.kind }}</td>
            <td>{{ run.payloadSize }}</td>
            <td>{{ run.settledAfterMs === null ? '—' : `${run.settledAfterMs} ms` }}</td>
            <td>{{ run.rejectedWith ? `rejected: ${run.rejectedWith}` : JSON.stringify(run.settledWith) }}</td>
            <td>
              {{ run.child
                ? `${run.child.receivedSize ?? 'nothing'} / ${run.child.expectedSize}${run.child.payloadIntact ? ' ✓' : ' ✗'}`
                : '—' }}
            </td>
            <td>{{ run.note }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
