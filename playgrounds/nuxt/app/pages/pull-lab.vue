<script setup lang="ts">
/**
 * Pull lab — compare the two protobuf codecs against a live portal.
 *
 * Open this route in TWO tabs and set a different codec in each
 * (`?codec=vendored` and `?codec=lite`). Each tab builds its own
 * `B24PullClientManager`, so the two connections are independent and the only
 * difference between them is which codec encodes and decodes the frames.
 *
 * Everything that travels goes through `pull.application.event.add`, which is
 * the REST method for pushing into an application's RT channel: a COMMAND
 * string, a free-form PARAMS object, and an optional USER_ID that switches
 * between the shared channel and the caller's private one. That covers both
 * halves of what this page is for — the server sending data to the front, and
 * one tab sending to the other (which necessarily goes through the server;
 * there is no browser-to-browser path in Pull).
 *
 * **The checks are only meaningful when the frames are actually protobuf.**
 * If the portal negotiates JSON-RPC (push-server v5+) or falls back to
 * long-polling, neither codec is exercised and the comparison is vacuous. The
 * connection panel says which mode is live, and check 2 fails loudly rather
 * than quietly passing.
 *
 * Needs the `pull` scope on the application.
 */
import { onMounted, onUnmounted, ref, computed, reactive } from 'vue'
import type { B24Frame, TypePullMessage } from '@bitrix24/b24jssdk'
import { B24PullClientManager, LoggerFactory, PullStatus, Text } from '@bitrix24/b24jssdk'

const { $initializeB24Frame } = useNuxtApp()
const $logger = LoggerFactory.createForBrowserDevelopment('[playground] PullLab')

const MODULE_ID = 'application'
/** How long any single message is waited for before it counts as lost. */
const AWAIT_MS = 15_000

type Codec = 'vendored' | 'lite'
type CheckState = 'idle' | 'running' | 'pass' | 'warn' | 'fail'

type LogEvent = {
  at: string
  ms: number
  kind: 'sent' | 'received' | 'status' | 'check' | 'note'
  text: string
  data?: unknown
}

type Check = {
  id: string
  title: string
  /** Why this check exists — carried into the exported log. */
  why: string
  state: CheckState
  detail: string
  ms: number
}

/** The envelope every lab message carries inside PARAMS. */
type LabEnvelope = {
  id: string
  from: string
  fromCodec: Codec
  to: string | null
  seq: number
  sentAt: number
  payload: unknown
}

// region state ////

const route = useRoute()
const router = useRouter()

/** This tab's identity — short enough to read off the screen when comparing two. */
const tabId = ref('')
const codec = ref<Codec>(route.query.codec === 'lite' ? 'lite' : 'vendored')
const userId = ref(0)
const isInit = ref(false)
const initError = ref('')
const isRunning = ref(false)

const status = ref<PullStatus>(PullStatus.Offline)
const debugInfo = ref<Record<string, unknown>>({})
const serverVersion = ref(0)
const connectionType = ref('-')
const wsMode = ref('-')

const events = ref<LogEvent[]>([])
const chatDraft = ref('')
const startedAt = Date.now()
let seq = 0

let $b24: B24Frame
let pull: B24PullClientManager | null = null
let unsubscribe: (() => void) | null = null
let refreshTimer = 0

/** Messages this tab is waiting for, keyed by envelope id. */
const pending = new Map<string, (envelope: LabEnvelope) => void>()

const checks = reactive<Check[]>([
  {
    id: 'connect',
    title: '1 · the client reaches "online"',
    why: 'Nothing below means anything if the connection never came up.',
    state: 'idle',
    detail: '',
    ms: 0
  },
  {
    id: 'mode',
    title: '2 · the frames really are protobuf',
    why: 'Under JSON-RPC or long-polling neither codec runs, so a green suite would be measuring nothing. This check exists to stop that false result.',
    state: 'idle',
    detail: '',
    ms: 0
  },
  {
    id: 'version',
    title: '3 · push-server version and the protobuf gate agree',
    why: 'The SDK enables protobuf on server version 4 exactly. A different version means the portal moved and the codec work needs revisiting.',
    state: 'idle',
    detail: '',
    ms: 0
  },
  {
    id: 'shared',
    title: '4 · a message on the SHARED channel comes back',
    why: 'pull.application.event.add without USER_ID publishes to the application channel every tab listens on.',
    state: 'idle',
    detail: '',
    ms: 0
  },
  {
    id: 'private',
    title: '5 · a message on the PRIVATE channel comes back',
    why: 'With USER_ID set the portal publishes to the caller\'s own channel, which is a different subscription and a different signature.',
    state: 'idle',
    detail: '',
    ms: 0
  },
  {
    id: 'fidelity',
    title: '6 · a payload of awkward values survives the round trip',
    why: 'This is the check a codec bug actually shows up in. The body is a JSON string on the wire, so multi-byte UTF-8 and a length past 127 bytes are the two cases most likely to be encoded wrongly.',
    state: 'idle',
    detail: '',
    ms: 0
  },
  {
    id: 'large',
    title: '7 · a large body survives',
    why: 'A body over 16 kB pushes the length prefix into a three-byte varint, and large frames are where a buffer-growth bug would surface.',
    state: 'idle',
    detail: '',
    ms: 0
  },
  {
    id: 'burst',
    title: '8 · a burst arrives complete and in order',
    why: 'Several messages can share one batch. Dropping or reordering inside a batch is invisible when you only ever send one message.',
    state: 'idle',
    detail: '',
    ms: 0
  }
])

const latencies = ref<number[]>([])

// endregion ////

// region helpers ////

const now = () => Date.now() - startedAt

function log(kind: LogEvent['kind'], text: string, data?: unknown): void {
  events.value.push({
    at: new Date().toISOString(),
    ms: now(),
    kind,
    text,
    ...(data === undefined ? {} : { data })
  })
}

function findCheck(id: string): Check {
  const found = checks.find(item => item.id === id)
  if (!found) {
    throw new Error(`unknown check: ${id}`)
  }

  return found
}

function setCheck(id: string, state: CheckState, detail: string, ms = 0): void {
  const check = findCheck(id)
  check.state = state
  check.detail = detail
  check.ms = ms
  log('check', `${check.title} → ${state}`, { detail, ms })
}

const pretty = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}

/** Structural comparison — what came back must be what went out, exactly. */
function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

// endregion ////

// region sending ////

/**
 * Push one lab message through the portal.
 *
 * `toUserId` picks the channel: omitted publishes to the shared application
 * channel, set publishes to that user's private one.
 */
async function send(
  command: string,
  payload: unknown,
  options: { to?: string | null, toUserId?: number } = {}
): Promise<LabEnvelope> {
  const envelope: LabEnvelope = {
    id: Text.getUuidRfc4122(),
    from: tabId.value,
    fromCodec: codec.value,
    to: options.to ?? null,
    seq: ++seq,
    sentAt: Date.now(),
    payload
  }

  const params: Record<string, unknown> = {
    COMMAND: command,
    MODULE_ID: MODULE_ID,
    PARAMS: { lab: envelope }
  }
  if (options.toUserId) {
    params.USER_ID = options.toUserId
  }

  const response = await $b24.actions.v2.call.make({
    method: 'pull.application.event.add',
    params,
    requestId: Text.getUuidRfc4122()
  })

  if (!response.isSuccess) {
    throw new Error(response.getErrorMessages().join('; '))
  }

  log('sent', `${command} → ${options.toUserId ? 'private' : 'shared'} channel`, {
    id: envelope.id,
    seq: envelope.seq,
    bytes: JSON.stringify(envelope.payload).length
  })

  return envelope
}

/** Send, then wait for that exact envelope to come back through Pull. */
async function sendAndAwait(
  command: string,
  payload: unknown,
  options: { toUserId?: number, timeout?: number } = {}
): Promise<{ envelope: LabEnvelope, ms: number }> {
  const timeout = options.timeout ?? AWAIT_MS
  let resolveFn: (envelope: LabEnvelope) => void = () => {}
  const received = new Promise<LabEnvelope>((resolve) => {
    resolveFn = resolve
  })

  const sent = await send(command, payload, { toUserId: options.toUserId })
  pending.set(sent.id, resolveFn)

  const timer = new Promise<null>(resolve => window.setTimeout(() => resolve(null), timeout))
  const startedWaiting = Date.now()
  const winner = await Promise.race([received, timer])
  pending.delete(sent.id)

  if (winner === null) {
    throw new Error(`nothing came back within ${timeout} ms`)
  }

  return { envelope: winner, ms: Date.now() - startedWaiting }
}

// endregion ////

// region receiving ////

function onPullMessage(message: TypePullMessage): void {
  const envelope = message.params?.lab as LabEnvelope | undefined
  if (!envelope || typeof envelope.id !== 'string') {
    log('received', `${message.command} (not a lab message)`, message.params)
    return
  }

  const mine = envelope.from === tabId.value
  log('received', `${message.command} from ${envelope.from}${mine ? ' (self)' : ''} via ${envelope.fromCodec}`, {
    id: envelope.id,
    seq: envelope.seq,
    latencyMs: Date.now() - envelope.sentAt
  })

  // Sampled for every lab message, self included — otherwise a single tab
  // measures nothing. Across two tabs on the same machine the clocks agree; on
  // two machines this figure carries their skew and is not a latency.
  latencies.value.push(Date.now() - envelope.sentAt)

  // Answer another tab's ping so the round trip can be measured from there.
  if (message.command === 'lab_ping' && !mine) {
    void send('lab_pong', envelope.payload, { to: envelope.from }).catch((error) => {
      log('note', 'pong failed: ' + String(error))
    })
  }

  const waiting = pending.get(envelope.id)
  if (waiting) {
    waiting(envelope)
  }
}

// endregion ////

// region checks ////

async function runChecks(): Promise<void> {
  if (!pull) {
    return
  }

  isRunning.value = true
  latencies.value = []
  for (const check of checks) {
    check.state = 'idle'
    check.detail = ''
    check.ms = 0
  }

  try {
    // ---- 1 · online -------------------------------------------------------
    setCheck('connect', 'running', 'waiting for status=online')
    const connectedAt = Date.now()
    while (pull.status !== PullStatus.Online && Date.now() - connectedAt < AWAIT_MS) {
      await new Promise(resolve => window.setTimeout(resolve, 250))
    }
    refreshConnection()
    if (pull.status === PullStatus.Online) {
      setCheck('connect', 'pass', `status=${pull.status}, transport=${connectionType.value}`, Date.now() - connectedAt)
    } else {
      setCheck('connect', 'fail', `status stuck at ${pull.status}`, Date.now() - connectedAt)
      return
    }

    // ---- 2 · protobuf actually in use -------------------------------------
    setCheck('mode', 'running', '')
    if (wsMode.value === 'protobuf') {
      setCheck('mode', 'pass', 'WebSocket in binary mode — the codec under test is doing the work')
    } else {
      setCheck(
        'mode',
        'fail',
        `WebSocket mode is "${wsMode.value}". Neither codec runs in this mode, so everything below tells you nothing about the codec — it only tells you the portal works.`
      )
    }

    // ---- 3 · server version ------------------------------------------------
    setCheck('version', 'running', '')
    const version = pull.getServerVersion()
    const supported = pull.isProtobufSupported()
    if (version === 4 && supported) {
      setCheck('version', 'pass', `server version ${version}, isProtobufSupported()=true`)
    } else if (version >= 5) {
      setCheck('version', 'warn', `server version ${version} — this portal is on JSON-RPC, protobuf is not used at all`)
    } else {
      setCheck('version', 'fail', `server version ${version}, isProtobufSupported()=${supported}`)
    }

    // ---- 4 · shared channel ------------------------------------------------
    setCheck('shared', 'running', '')
    try {
      const probe = { probe: 'shared', at: Date.now() }
      const result = await sendAndAwait('lab_probe', probe)
      setCheck(
        'shared',
        sameValue(result.envelope.payload, probe) ? 'pass' : 'fail',
        sameValue(result.envelope.payload, probe)
          ? `returned in ${result.ms} ms`
          : `returned in ${result.ms} ms but the payload differs: ${pretty(result.envelope.payload)}`,
        result.ms
      )
    } catch (error) {
      setCheck('shared', 'fail', String(error instanceof Error ? error.message : error))
    }

    // ---- 5 · private channel -----------------------------------------------
    setCheck('private', 'running', '')
    try {
      const probe = { probe: 'private', at: Date.now() }
      const result = await sendAndAwait('lab_probe', probe, { toUserId: userId.value })
      setCheck(
        'private',
        sameValue(result.envelope.payload, probe) ? 'pass' : 'fail',
        sameValue(result.envelope.payload, probe)
          ? `returned in ${result.ms} ms`
          : `returned in ${result.ms} ms but the payload differs`,
        result.ms
      )
    } catch (error) {
      setCheck('private', 'fail', String(error instanceof Error ? error.message : error))
    }

    // ---- 6 · payload fidelity ----------------------------------------------
    setCheck('fidelity', 'running', '')
    const battery = {
      emptyString: '',
      ascii: 'plain',
      // Multi-byte UTF-8: an encoder that counts characters instead of bytes
      // writes a length prefix that is too small and truncates the body.
      cyrillic: 'Проверка кодека',
      emoji: '🚀 конец 🇷🇺',
      // Past 127 bytes the length prefix stops being a single byte.
      long: 'x'.repeat(300),
      zero: 0,
      negative: -42,
      big: 2_147_483_647,
      float: 3.141_592_653_589_793,
      flagTrue: true,
      flagFalse: false,
      nullValue: null,
      list: [1, 'two', false, null, { deep: true }],
      nested: { a: { b: { c: 'deep' } } },
      quotes: 'he said "hi"\nand a tab\there'
    }
    try {
      const result = await sendAndAwait('lab_probe', battery)
      if (sameValue(result.envelope.payload, battery)) {
        setCheck('fidelity', 'pass', `all ${Object.keys(battery).length} values identical after the round trip`, result.ms)
      } else {
        const got = result.envelope.payload as Record<string, unknown>
        const differing = Object.keys(battery).filter(
          key => !sameValue(got?.[key], (battery as Record<string, unknown>)[key])
        )
        setCheck('fidelity', 'fail', `differs in: ${differing.join(', ')}`, result.ms)
        log('note', 'fidelity mismatch', { sent: battery, got: result.envelope.payload })
      }
    } catch (error) {
      setCheck('fidelity', 'fail', String(error instanceof Error ? error.message : error))
    }

    // ---- 7 · large body ------------------------------------------------------
    setCheck('large', 'running', '')
    const large = { blob: 'ab'.repeat(10_000) }
    try {
      const result = await sendAndAwait('lab_probe', large, { timeout: 30_000 })
      setCheck(
        'large',
        sameValue(result.envelope.payload, large) ? 'pass' : 'fail',
        sameValue(result.envelope.payload, large)
          ? `${JSON.stringify(large).length} bytes returned intact in ${result.ms} ms`
          : `returned but corrupted (${String((result.envelope.payload as { blob?: string })?.blob?.length)} chars instead of 20000)`,
        result.ms
      )
    } catch (error) {
      setCheck('large', 'fail', String(error instanceof Error ? error.message : error))
    }

    // ---- 8 · burst -----------------------------------------------------------
    setCheck('burst', 'running', '')
    const count = 20
    const arrived: number[] = []
    const waiters: Array<Promise<unknown>> = []
    try {
      for (let index = 1; index <= count; index++) {
        waiters.push(
          sendAndAwait('lab_probe', { burst: index }, { timeout: 30_000 })
            .then((result) => {
              arrived.push((result.envelope.payload as { burst: number }).burst)
            })
            .catch(() => {})
        )
      }
      await Promise.all(waiters)
      // `arrived` is receipt order; they were sent as 1..count, so anything
      // other than that sequence means the batch was reordered on the way back.
      const ordered = arrived.every((value, index) => value === index + 1)
      const sorted = [...arrived].sort((a, b) => a - b)
      const complete = sorted.length === count && sorted.every((value, index) => value === index + 1)
      if (complete && ordered) {
        setCheck('burst', 'pass', `all ${count} arrived; order as sent: ${arrived.join(',')}`)
      } else if (complete) {
        setCheck('burst', 'warn', `all ${count} arrived but out of order: ${arrived.join(',')}`)
      } else {
        setCheck('burst', 'fail', `${arrived.length} of ${count} arrived: ${arrived.join(',')}`)
      }
    } catch (error) {
      setCheck('burst', 'fail', String(error instanceof Error ? error.message : error))
    }
  } finally {
    refreshConnection()
    isRunning.value = false
  }
}

// endregion ////

// region cross-tab ////

async function pingOtherTab(): Promise<void> {
  const token = Text.getUuidRfc4122()
  const sentAt = Date.now()
  let answered = false

  const stop = pull?.subscribe({
    moduleId: MODULE_ID,
    callback: (message: TypePullMessage) => {
      const envelope = message.params?.lab as LabEnvelope | undefined
      if (
        message.command === 'lab_pong'
        && envelope
        && envelope.to === tabId.value
        && (envelope.payload as { token?: string })?.token === token
      ) {
        answered = true
        log('note', `pong from ${envelope.from} (${envelope.fromCodec}) — round trip ${Date.now() - sentAt} ms`)
      }
    }
  })

  await send('lab_ping', { token })
  await new Promise(resolve => window.setTimeout(resolve, AWAIT_MS))
  stop?.()

  if (!answered) {
    log('note', 'no pong — is the other tab open, started, and on the same application?')
  }
}

async function sendChat(): Promise<void> {
  const text = chatDraft.value.trim()
  if (!text) {
    return
  }

  chatDraft.value = ''
  await send('lab_chat', { text })
}

// endregion ////

// region connection panel ////

function refreshConnection(): void {
  if (!pull) {
    return
  }

  status.value = pull.status
  serverVersion.value = pull.getServerVersion()
  const info = pull.getDebugInfo() as Record<string, unknown>
  debugInfo.value = info
  wsMode.value = String(info['WebSocket mode'] ?? '-')
  // The client keeps its connection type private, but the debug dump says
  // whether the WebSocket is the one that is up — which is the same answer.
  connectionType.value = info['WebSocket connected'] === 'Y'
    ? 'webSocket'
    : (pull.isConnected() ? 'longPolling' : '-')
}

const protobufLive = computed(() => wsMode.value === 'protobuf')

// endregion ////

// region export ////

const report = computed(() => ({
  generatedAt: new Date().toISOString(),
  tabId: tabId.value,
  codec: codec.value,
  userId: userId.value,
  connection: {
    status: status.value,
    transport: connectionType.value,
    webSocketMode: wsMode.value,
    serverVersion: serverVersion.value,
    protobufActuallyInUse: protobufLive.value
  },
  // `getDebugInfo()` masks the push JWT and the private channel id before
  // returning, so this dump is safe to hand over as-is.
  debugInfo: debugInfo.value,
  checks: checks.map(check => ({
    id: check.id,
    title: check.title,
    why: check.why,
    state: check.state,
    detail: check.detail,
    ms: check.ms
  })),
  latencyMs: latencies.value,
  events: events.value
}))

const reportText = computed(() => pretty(report.value))

async function copyReport(): Promise<void> {
  try {
    await navigator.clipboard.writeText(reportText.value)
    log('note', 'report copied to the clipboard')
  } catch {
    log('note', 'clipboard refused — select the text below and copy it manually')
  }
}

function downloadReport(): void {
  const blob = new Blob([reportText.value], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `pull-lab-${codec.value}-${tabId.value}.json`
  link.click()
  URL.revokeObjectURL(url)
}

function switchCodec(next: Codec): void {
  // A codec is chosen when the client is constructed, so the page reloads.
  void router.replace({ query: { ...route.query, codec: next } }).then(() => {
    window.location.reload()
  })
}

// endregion ////

onMounted(async () => {
  try {
    tabId.value = Math.random().toString(36).slice(2, 7)
    $b24 = await $initializeB24Frame()
    if ($b24.isInstallMode) {
      try {
        await $b24.installFinish()
      } catch (error) {
        $logger.info('installFinish', { error })
      }
    }

    const profile = await $b24.actions.v2.call.make({
      method: 'profile',
      params: {},
      requestId: Text.getUuidRfc4122()
    })
    userId.value = Number((profile.getData()?.result as { ID?: number | string })?.ID ?? 0)

    pull = new B24PullClientManager({
      b24: $b24,
      restApplication: $b24.auth.getUniq('pull-lab'),
      userId: userId.value,
      protobufCodec: codec.value
    })

    unsubscribe = pull.subscribe({ moduleId: MODULE_ID, callback: onPullMessage })
    await pull.start()

    log('note', `tab ${tabId.value} started on the "${codec.value}" codec as user ${userId.value}`)
    refreshConnection()
    refreshTimer = window.setInterval(refreshConnection, 2000)
    isInit.value = true
  } catch (error) {
    initError.value = error instanceof Error ? error.message : String(error)
    $logger.error('pull lab init failed', { error })
  }
})

onUnmounted(() => {
  if (refreshTimer) {
    window.clearInterval(refreshTimer)
  }
  unsubscribe?.()
  pull?.destroy()
})
</script>

<template>
  <ClientOnly>
    <B24Alert
      v-if="!isInit && !initError"
      description="Connecting to Bitrix24 and starting the Pull client ..."
    />
    <B24Alert
      v-else-if="initError"
      color="air-primary-alert"
      :description="`Init failed: ${initError}`"
    />
    <div v-else class="flex flex-col gap-4 p-3">
      <!-- Identity: the thing you read first when two tabs are side by side -->
      <div class="flex flex-wrap items-center gap-3">
        <div class="rounded-lg border border-(--ui-border) px-3 py-2">
          <div class="text-xs opacity-60">
            tab
          </div>
          <div class="font-mono text-lg font-bold">
            {{ tabId }}
          </div>
        </div>
        <div class="rounded-lg border border-(--ui-border) px-3 py-2">
          <div class="text-xs opacity-60">
            codec
          </div>
          <div class="font-mono text-lg font-bold">
            {{ codec }}
          </div>
        </div>
        <div class="flex gap-2">
          <B24Button
            label="use vendored"
            :color="codec === 'vendored' ? 'air-boost' : 'air-tertiary-no-accent'"
            @click="switchCodec('vendored')"
          />
          <B24Button
            label="use lite"
            :color="codec === 'lite' ? 'air-boost' : 'air-tertiary-no-accent'"
            @click="switchCodec('lite')"
          />
        </div>
      </div>

      <B24Alert
        v-if="!protobufLive"
        color="air-primary-alert"
        :description="`WebSocket mode is &quot;${wsMode}&quot; — protobuf is NOT in use, so the two codecs cannot be told apart on this connection. Any result below is about the portal, not about the codec.`"
      />

      <!-- Connection -->
      <div class="rounded-lg border border-(--ui-border) p-3">
        <div class="mb-2 font-bold">
          Connection
        </div>
        <div class="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs md:grid-cols-3">
          <div>status: <b>{{ status }}</b></div>
          <div>transport: <b>{{ connectionType }}</b></div>
          <div>ws mode: <b>{{ wsMode }}</b></div>
          <div>server version: <b>{{ serverVersion }}</b></div>
          <div>user: <b>{{ userId }}</b></div>
          <div>latency samples: <b>{{ latencies.length }}</b></div>
        </div>
      </div>

      <!-- Checks -->
      <div class="flex flex-col gap-2">
        <div class="flex items-center gap-2">
          <B24Button
            label="▶ Run checks"
            color="air-boost"
            :disabled="isRunning"
            loading-auto
            @click="runChecks"
          />
          <span class="text-xs opacity-60">run this in BOTH tabs, then compare the two reports</span>
        </div>

        <div
          v-for="check in checks"
          :key="check.id"
          class="rounded-lg border border-(--ui-border) p-2 text-xs"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="font-bold">
              {{ check.title }}
            </div>
            <div
              class="font-mono"
              :class="{
                'opacity-50': check.state === 'idle' || check.state === 'running',
                'text-(--ui-color-success-text)': check.state === 'pass',
                'text-(--ui-color-warning-text)': check.state === 'warn',
                'text-(--ui-color-danger-text) font-bold': check.state === 'fail'
              }"
            >
              {{ check.state }}{{ check.ms ? ` · ${check.ms}ms` : '' }}
            </div>
          </div>
          <div v-if="check.detail" class="mt-1 font-mono opacity-80">
            {{ check.detail }}
          </div>
          <div class="mt-1 opacity-50">
            {{ check.why }}
          </div>
        </div>
      </div>

      <!-- Tab to tab -->
      <div class="rounded-lg border border-(--ui-border) p-3">
        <div class="mb-2 font-bold">
          Between the tabs
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <B24Button label="Ping the other tab" loading-auto @click="pingOtherTab" />
          <input
            v-model="chatDraft"
            placeholder="message to the other tab"
            class="min-w-60 flex-1 rounded-lg border border-(--ui-border) px-2 py-1 text-sm"
            @keyup.enter="sendChat"
          >
          <B24Button label="Send" loading-auto @click="sendChat" />
        </div>
        <div class="mt-1 text-xs opacity-50">
          Both go through the portal — Pull has no browser-to-browser path. A ping is answered
          automatically by whichever other tab is listening.
        </div>
      </div>

      <!-- Live log -->
      <div class="rounded-lg border border-(--ui-border) p-3">
        <div class="mb-2 flex items-center gap-2">
          <span class="font-bold">Log</span>
          <span class="text-xs opacity-60">{{ events.length }} events</span>
          <B24Button label="Copy report" size="xs" @click="copyReport" />
          <B24Button label="Download JSON" size="xs" @click="downloadReport" />
        </div>
        <div class="max-h-80 overflow-auto font-mono text-xs">
          <div
            v-for="(event, index) in [...events].reverse()"
            :key="index"
            class="flex gap-2"
            :class="{
              'text-(--ui-color-success-text)': event.kind === 'received',
              'opacity-70': event.kind === 'sent',
              'opacity-50': event.kind === 'note' || event.kind === 'status'
            }"
          >
            <span class="w-16 shrink-0 text-right opacity-60">{{ event.ms }}ms</span>
            <span class="w-16 shrink-0">{{ event.kind }}</span>
            <span class="break-all">{{ event.text }}</span>
          </div>
        </div>
      </div>

      <!-- The thing to hand back -->
      <details class="rounded-lg border border-(--ui-border) p-3">
        <summary class="cursor-pointer font-bold">
          Report (JSON) — this is what to send back
        </summary>
        <pre class="mt-2 max-h-96 overflow-auto font-mono text-xs whitespace-pre-wrap break-words">{{ reportText }}</pre>
      </details>
    </div>
  </ClientOnly>
</template>
