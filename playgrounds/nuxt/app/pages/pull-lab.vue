<script setup lang="ts">
/**
 * Pull lab — exercise the two protobuf codecs against a live portal.
 *
 * Open this route in TWO tabs and set a different codec in each
 * (`?codec=vendored` and `?codec=lite`). Each tab builds its own
 * `B24PullClientManager`, so the codec is the difference the page controls —
 * see the caveat below about what it does not control.
 *
 * ## What this page can and cannot see
 *
 * Most of it travels through `pull.application.event.add` — a COMMAND string, a
 * free-form PARAMS object, and an optional USER_ID that switches between the
 * shared application channel and the caller's private one. That is plain REST
 * on the way out and protobuf only on the way back, so **it exercises the
 * DECODE half of the codec and nothing else**.
 *
 * The encode half is only reachable through `PullClient.sendMessage()`, which
 * needs `publish_enabled` from the portal and a portal that is not on JSON-RPC.
 * Check 9 runs it when both hold and reports `skip` when either does not — it
 * never quietly passes. This matters because two of the three traps named in
 * `.github/contributing/pull-protobuf.md` live on the encode side.
 *
 * A message published by `sendMessage()` comes back on a DIFFERENT subscription
 * from one published by `pull.application.event.add`: the push server stamps it
 * `sender.type = Client`, and `broadcastMessage` emits those to
 * `SubscriptionType.Client` subscribers only. The page subscribes to both, and
 * has to — with the server subscription alone, which is what `subscribe()`
 * defaults to, check 9's own echo could never reach it and the check timed out
 * on every portal it was ever run against.
 *
 * Even with that fixed, a missing echo does not acquit the encoder. Some bad
 * frames are refused with a socket close carrying a code — the page records
 * those — but a frame that parses and merely addresses the wrong field number
 * is broadcast with an empty body and says nothing at all. So "encoded and
 * accepted by the transport" is the most check 9 can assert on its own.
 * Reading an encoded frame BACK is what would settle it, and no portal route
 * for that exists from an application today.
 *
 * The transport does NOT decide whether the codec runs. On a version-4 portal
 * the long-polling connector sets `responseType = 'arraybuffer'` too, and
 * `extractMessages` dispatches on the payload type alone — so long-polling
 * decodes through the codec under test exactly as the WebSocket does. What
 * turns the codec off is JSON-RPC (push-server 5+), not the fallback.
 *
 * The two tabs are also not perfectly independent: `SharedConfig` keeps the
 * blocked-transport flags in `localStorage` keyed by user and site, so one tab
 * being pushed onto long-polling can drag the other with it. The codec is the
 * only difference this page controls, not the only difference there is.
 *
 * ## What actually settles the codec question
 *
 * `pull-protobuf.md` asks for a `ResponseBatch` recorded from a real portal and
 * committed as a fixture. Decoded results are not that. "Capture raw frames"
 * taps the WebSocket and puts the bytes in the report, which is the artefact —
 * and, incidentally, the only honest proof that binary protobuf frames are
 * arriving at all rather than the client merely having asked for them.
 *
 * **The tap sees every frame on the connection, including events from other
 * applications and portal modules.** That is why it is a button and not the
 * default, and why the export carries a warning instead of a reassurance.
 *
 * Needs the `pull` scope. Test portals only — check 4 and everything after it
 * broadcast to the shared channel, which reaches every user with this
 * application open.
 */
import { onMounted, onUnmounted, ref, computed, reactive } from 'vue'
import type { B24Frame, TypePullMessage } from '@bitrix24/b24jssdk'
import { B24PullClientManager, CloseReasons, isFrameRefusalCloseCode, LoggerFactory, PullStatus, SubscriptionType, Text } from '@bitrix24/b24jssdk'

const { $initializeB24Frame } = useNuxtApp()
const $logger = LoggerFactory.createForBrowserDevelopment('[playground] PullLab')

const MODULE_ID = 'application'
/** How long any single message is waited for before it counts as lost. */
const AWAIT_MS = 15_000
/** The event log is exported whole, so it is bounded. */
const MAX_EVENTS = 2000
/** Raw frames are large and carry other applications' traffic. */
const MAX_FRAMES = 40
/** Closures are the one collector that a reconnect loop can grow without end. */
const MAX_CLOSURES = 50
/** A close reason is the server's own text, and the spec allows 123 bytes. */
const MAX_REASON_CHARS = 123

type Codec = 'vendored' | 'lite'
type CheckState = 'idle' | 'running' | 'pass' | 'warn' | 'skip' | 'fail'

type LogEvent = {
  id: number
  at: string
  ms: number
  kind: 'sent' | 'received' | 'frame' | 'check' | 'note'
  text: string
  data?: unknown
}

type Check = {
  id: string
  title: string
  /** Why this check exists — carried into the exported report. */
  why: string
  state: CheckState
  detail: string
  ms: number
}

/** A raw WebSocket frame, as the fixture #552 asks for. */
type RawFrame = {
  ms: number
  binary: boolean
  byteLength: number
  /** base64 — decode with `Uint8Array.from(atob(b64), c => c.charCodeAt(0))`. */
  base64: string
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
const publishingEnabled = ref(false)

const events = ref<LogEvent[]>([])
const frames = ref<RawFrame[]>([])
const isCapturing = ref(false)
/** Set once a binary frame has actually been observed, not merely requested. */
const sawBinaryFrame = ref(false)
/** Set once `encodeRequestBatch` has demonstrably run against the portal. */
const encodePathExercised = ref(false)

/**
 * Every socket closure this page observed, with its code and reason.
 *
 * A refused publish is answered by a socket close, not by a reply, so when one
 * of these lands inside check 9's window it is the most informative thing on
 * the page. Three things keep it honest:
 *
 * - `frameRefusal` separates the codes that reject a FRAME from the ones that
 *   say the connection is unusable and from the client's own disconnects,
 *   which on a page left open for a full run are routine and would otherwise
 *   outnumber the signal;
 * - a closure INSIDE the window is a correlation, not a cause. The connection
 *   is shared with subscriptions, heartbeats and config refreshes;
 * - the absence of a closure proves nothing. Only a structurally unparseable
 *   frame trips `4013`; a scalar written at the wrong field number parses
 *   cleanly and is broadcast with an empty body, silently.
 *
 * And the tap is attached from a 2-second poll, so a socket opened and closed
 * between two ticks is never seen at all. "Every closure observed" is the
 * honest description; "every closure" is not.
 */
/**
 * Check 9's window, so a reader can line a closure up against it.
 *
 * `checks[].ms` is a DURATION, not a start time, so without this the report
 * invited a correlation it gave the reader no way to make.
 */
const encodeWindow = ref<null | { fromMs: number, toMs: number }>(null)

const socketClosures = ref<Array<{
  ms: number
  code: number
  name: string
  frameRefusal: boolean
  reason: string
}>>([])
const chatDraft = ref('')
const startedAt = Date.now()
let seq = 0
let eventId = 0

let $b24: B24Frame
let pull: B24PullClientManager | null = null
let unsubscribers: Array<() => void> = []
let refreshTimer = 0
let tappedSocket: WebSocket | null = null

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
    title: '2 · the codec under test is actually on the decode path',
    why: 'What switches the codec off is JSON-RPC (push-server 5+), not the transport: long-polling on a version-4 portal also receives an ArrayBuffer and decodes through the same codec. So this keys on the SDK\'s own gate rather than on the WebSocket. An observed binary frame is stronger evidence still and is reported when there is one, but it can only be seen on the WebSocket — its absence under long-polling means nothing.',
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
    why: 'pull.application.event.add without USER_ID publishes to the application channel every client of this app is subscribed to.',
    state: 'idle',
    detail: '',
    ms: 0
  },
  {
    id: 'private',
    title: '5 · a message on the PRIVATE channel comes back',
    why: 'With USER_ID set the portal publishes to that user\'s own channel, which is a different subscription with a different signature. Both tabs run as the same user, so this separates CHANNELS, not recipients.',
    state: 'idle',
    detail: '',
    ms: 0
  },
  {
    id: 'fidelity',
    title: '6 · a body of awkward values survives the round trip',
    why: 'The body is one opaque length-delimited blob on the wire, so this is a weak codec test by construction: most of the values below exercise JSON, not protobuf. What it does reach is the length prefix and the UTF-8 decode — the sizes are chosen to sit either side of the varint boundary at 127 bytes.',
    state: 'idle',
    detail: '',
    ms: 0
  },
  {
    id: 'large',
    title: '7 · a large body survives',
    why: 'The most valuable of the payload checks: a body over 16 kB forces a three-byte varint length prefix, which is the one wire-level read the ordinary traffic never reaches.',
    state: 'idle',
    detail: '',
    ms: 0
  },
  {
    id: 'burst',
    title: '8 · a sequence arrives complete and in the order it was sent',
    why: 'Sent one at a time so the send order is real. The SDK rate limiter paces these, so they will usually NOT share one batch — this checks delivery, not batch handling, and says so rather than claiming more.',
    state: 'idle',
    detail: '',
    ms: 0
  },
  {
    id: 'surrogate',
    title: '10 · a lone surrogate in the body',
    why: 'Measured, not assumed: on a live portal this does not reach the codec at all — the REST call is refused with "Wrong authorization data" before anything is published. It lives in its own check because when it shared the fidelity battery it failed that whole check, so fourteen values that would have passed reported nothing. A fail here is expected and is a fact about the transport, not about protobuf.',
    state: 'idle',
    detail: '',
    ms: 0
  },
  {
    id: 'encode',
    title: '9 · the ENCODE half of the codec runs',
    why: 'Everything above sends over REST, so it only ever exercises decoding. This is the one check that runs the encoder — and two of the three traps in pull-protobuf.md are on that side. It needs publish_enabled AND a portal that is not on JSON-RPC, since push-server 5+ publishes as JSON and no codec runs; either one missing is a skip, because a pass there would be a lie. Below a pass there are two informative outcomes and the detail says which happened. A fail carrying [JSSDK_PULL_PUBLIC_IDS_UNAVAILABLE] means the channel lookup was refused and NOTHING was encoded. A warn means the batch WAS encoded and the socket took it, and only the echo did not come back — which does not acquit the encoder: the server answers SOME bad frames by closing the socket with a code (look at socketClosures and encodeWindow in the report), but a scalar written at the wrong field number parses cleanly, is broadcast with an empty body, and produces no close code and no echo at all. Whether you get the fail or the warn turns on whether every recipient already had an unexpired channel in the cache, which pull.application.config.get (pull.config.get outside an application) prefills from publicChannels; check 9 sends to the current user, whose own channel is usually in there. The report field encodePathExercised follows the send itself, so it is true for a warn and for a JSSDK_PULL_SEND_REFUSED fail, and false for a skip. Until 3.0.0 every one of these reported success alike.',
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
    id: ++eventId,
    at: new Date().toISOString(),
    ms: now(),
    kind,
    text,
    ...(data === undefined ? {} : { data })
  })
  if (events.value.length > MAX_EVENTS) {
    events.value.splice(0, events.value.length - MAX_EVENTS)
  }
}

/**
 * Errors go into a file that leaves this machine, so only the message does.
 *
 * `String(error)` on an `AjaxError` appends its stack trace, and in a browser
 * that carries the app's origin — the tunnel hostname, in the documented
 * workflow. The SDK redacts error *params*, not portal prose, so even the
 * message is read before sending rather than trusted.
 */
function errorText(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error)
  }

  // The CODE first, because that is what a caller branches on and what tells
  // the three Pull send failures apart — `JSSDK_PULL_PUBLIC_IDS_UNAVAILABLE`
  // (nobody to send to), `JSSDK_PULL_SEND_REFUSED` (the transport would not
  // take it) and `JSSDK_PULL_PUBLISHING_DISABLED` (the portal forbids it). The
  // message alone reads the same for two of them.
  const code = (error as { code?: unknown }).code

  return typeof code === 'string' && code.length > 0
    ? `[${code}] ${error.message}`
    : error.message
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

/**
 * Structural comparison, insensitive to key order.
 *
 * The payload is re-serialised by PHP on the way through, and PHP is free to
 * hand the keys back in a different order. A plain `JSON.stringify` comparison
 * would call that a codec bug — the most expensive wrong answer this page can
 * give, since check 6 is the one people will read first.
 */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true
  }
  if (typeof a !== typeof b || a === null || b === null) {
    return false
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false
    }

    return a.every((item, index) => sameValue(item, b[index]))
  }
  if (typeof a === 'object') {
    const left = a as Record<string, unknown>
    const right = b as Record<string, unknown>
    const leftKeys = Object.keys(left).sort()
    const rightKeys = Object.keys(right).sort()
    if (leftKeys.length !== rightKeys.length || leftKeys.some((key, i) => key !== rightKeys[i])) {
      return false
    }

    return leftKeys.every(key => sameValue(left[key], right[key]))
  }

  return false
}

// endregion ////

// region raw frame capture ////

function toBase64(buffer: ArrayBuffer): string {
  const view = new Uint8Array(buffer)
  let binary = ''
  for (const byte of view) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
}

function onSocketFrame(event: MessageEvent): void {
  const binary = event.data instanceof ArrayBuffer
  if (binary) {
    sawBinaryFrame.value = true
  }

  if (!isCapturing.value || frames.value.length >= MAX_FRAMES) {
    return
  }

  if (binary) {
    const buffer = event.data as ArrayBuffer
    frames.value.push({
      ms: now(),
      binary: true,
      byteLength: buffer.byteLength,
      base64: toBase64(buffer)
    })
    log('frame', `captured ${buffer.byteLength} raw bytes (${frames.value.length}/${MAX_FRAMES})`)
  }
}

/**
 * Listen alongside the SDK rather than in front of it.
 *
 * `addEventListener` does not displace the connector's own handler, so the
 * client keeps working exactly as it would without the lab. The socket is
 * replaced on every reconnect, hence the identity check on each refresh.
 */
function attachFrameTap(): void {
  const socket = (pull?.connector as unknown as { socket?: WebSocket } | null)?.socket ?? null
  if (!socket || socket === tappedSocket) {
    return
  }

  tappedSocket?.removeEventListener('message', onSocketFrame)
  tappedSocket?.removeEventListener('close', onSocketClose)
  socket.addEventListener('message', onSocketFrame)
  // Always, never gated on the capture toggle: a close code is a few bytes and
  // is the single most informative thing this page can collect.
  socket.addEventListener('close', onSocketClose)
  tappedSocket = socket
}

function onSocketClose(event: Event): void {
  const closed = event as CloseEvent
  const name = CloseReasons[closed.code] ?? 'unknown'
  // The server's own text, bounded. It is the only string in this report that
  // the page did not author, and it goes into a file people paste into chats.
  const reason = String(closed.reason ?? '').slice(0, MAX_REASON_CHARS)
  socketClosures.value.push({
    ms: Date.now() - startedAt,
    code: closed.code,
    name,
    frameRefusal: isFrameRefusalCloseCode(closed.code),
    reason
  })
  if (socketClosures.value.length > MAX_CLOSURES) {
    socketClosures.value.splice(0, socketClosures.value.length - MAX_CLOSURES)
  }
  log('note', `socket closed: ${closed.code} ${name}${reason ? ` — ${reason}` : ''}`)
}

function toggleCapture(): void {
  isCapturing.value = !isCapturing.value
  log('note', isCapturing.value
    ? `capturing raw frames — this records EVERY frame on the connection, including other applications' events`
    : 'raw frame capture stopped')
}

function clearFrames(): void {
  frames.value = []
  log('note', 'captured frames discarded')
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
  options: { to?: string | null, toUserId?: number, envelopeId?: string } = {}
): Promise<LabEnvelope> {
  const envelope: LabEnvelope = {
    id: options.envelopeId ?? Text.getUuidRfc4122(),
    from: tabId.value,
    fromCodec: codec.value,
    to: options.to ?? null,
    seq: ++seq,
    sentAt: Date.now(),
    payload
  }

  // `> 0` rather than a truthiness test: a `userId` of 0 would silently omit
  // USER_ID and publish to the SHARED channel while the check above it claimed
  // to be testing the private one.
  const toPrivate = typeof options.toUserId === 'number' && options.toUserId > 0
  const params: Record<string, unknown> = {
    COMMAND: command,
    MODULE_ID: MODULE_ID,
    PARAMS: { lab: envelope }
  }
  if (toPrivate) {
    params.USER_ID = options.toUserId
  }

  const response = await $b24.actions.v2.call.make({
    method: 'pull.application.event.add',
    params,
    // Descriptive rather than a bare uuid: these show up in portal-side logs,
    // and `pull-lab/...` is searchable where a uuid is not.
    requestId: `pull-lab/${tabId.value}/${command}/${envelope.seq}`
  })

  if (!response.isSuccess) {
    throw new Error(response.getErrorMessages().join('; '))
  }

  log('sent', `${command} → ${toPrivate ? 'private' : 'shared'} channel`, {
    id: envelope.id,
    seq: envelope.seq,
    // UTF-16 code units, not bytes — named honestly because the byte/character
    // distinction is the very thing some of these checks are about.
    chars: JSON.stringify(envelope.payload).length
  })

  return envelope
}

/**
 * Send, then wait for that exact envelope to come back through Pull.
 *
 * The waiter is registered BEFORE the send. The push frame and the REST
 * response are independent paths and the portal publishes before it answers, so
 * registering afterwards loses any reply that beats the HTTP response — which
 * is the ordinary case on a healthy portal, and would be reported as "nothing
 * came back" for a codec that worked perfectly.
 */
async function sendAndAwait(
  command: string,
  payload: unknown,
  options: { toUserId?: number, timeout?: number } = {}
): Promise<{ envelope: LabEnvelope, ms: number }> {
  const timeout = options.timeout ?? AWAIT_MS
  const envelopeId = Text.getUuidRfc4122()

  let resolveFn: (envelope: LabEnvelope) => void = () => {}
  const received = new Promise<LabEnvelope>((resolve) => {
    resolveFn = resolve
  })
  pending.set(envelopeId, resolveFn)

  const startedWaiting = Date.now()
  let timer = 0
  try {
    await send(command, payload, { toUserId: options.toUserId, envelopeId })

    const expired = new Promise<null>((resolve) => {
      timer = window.setTimeout(() => resolve(null), timeout)
    })
    const winner = await Promise.race([received, expired])
    if (winner === null) {
      throw new Error(`nothing came back within ${timeout} ms`)
    }

    return { envelope: winner, ms: Date.now() - startedWaiting }
  } finally {
    // Otherwise every successful wait leaves a live timer and its closure.
    if (timer) {
      window.clearTimeout(timer)
    }
    pending.delete(envelopeId)
  }
}

// endregion ////

// region receiving ////

function onPullMessage(message: TypePullMessage): void {
  const envelope = message.params?.lab as LabEnvelope | undefined
  if (!envelope || typeof envelope.id !== 'string') {
    log('received', `${message.command} (not a lab message)`)
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
      log('note', 'pong failed: ' + errorText(error))
    })
  }

  if (message.command === 'lab_pong' && envelope.to === tabId.value) {
    log('note', `pong from ${envelope.from} (${envelope.fromCodec})`)
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
  // Per-run, like the check states below. It used to be derived from check 9's
  // verdict, which reset itself; a sticky ref would report a PREVIOUS run's
  // fact on a run where check 9 skipped or never got to run at all.
  encodePathExercised.value = false
  socketClosures.value = []
  encodeWindow.value = null
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
    if (pull.status !== PullStatus.Online) {
      setCheck('connect', 'fail', `status stuck at ${pull.status}`, Date.now() - connectedAt)
      return
    }
    setCheck('connect', 'pass', `status=${pull.status}, transport=${connectionType.value}`, Date.now() - connectedAt)

    // ---- 2 · protobuf observed, not assumed --------------------------------
    setCheck('mode', 'running', '')
    const codecOnPath = pull.isProtobufSupported() && !pull.isJsonRpc()
    const observed = sawBinaryFrame.value
      ? 'and a binary frame was observed on the socket'
      : `and no binary frame was observed — expected under long-polling, which this page cannot tap (transport: ${connectionType.value})`
    if (codecOnPath) {
      setCheck('mode', 'pass', `isProtobufSupported() && !isJsonRpc() ${observed}`)
    } else {
      setCheck(
        'mode',
        'fail',
        `the protobuf path is off (isProtobufSupported()=${pull.isProtobufSupported()}, isJsonRpc()=${pull.isJsonRpc()}). Neither codec runs, so everything below tells you about the portal, not about the codec.`
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
      setCheck('shared', 'fail', errorText(error))
    }

    // ---- 5 · private channel -----------------------------------------------
    setCheck('private', 'running', '')
    if (userId.value <= 0) {
      setCheck('private', 'fail', 'no user id — without it the probe would go to the SHARED channel and pass while testing nothing')
    } else {
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
        setCheck('private', 'fail', errorText(error))
      }
    }

    // ---- 6 · payload fidelity ----------------------------------------------
    setCheck('fidelity', 'running', '')
    const battery = {
      emptyString: '',
      // Multi-byte UTF-8 on the way back is `TextDecoder`'s job; these are here
      // to confirm the body survives the portal, not to test the codec deeply.
      cyrillic: 'Проверка кодека',
      emoji: '🚀 конец 🇷🇺',
      // Not a varint-boundary probe, despite the sizes: the length prefix
      // covers the WHOLE body, and the envelope alone (a uuid, the tab id, the
      // counters) already carries it past 127 bytes. Check 7 is what reaches a
      // prefix boundary. These two are here for bulk, honestly labelled.
      shortish: 'x'.repeat(100),
      longer: 'y'.repeat(200),
      zero: 0,
      negative: -42,
      big: 2_147_483_647,
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
      setCheck('fidelity', 'fail', errorText(error))
    }

    // ---- 7 · large body ------------------------------------------------------
    setCheck('large', 'running', '')
    const large = { blob: 'ab'.repeat(10_000) }
    try {
      const result = await sendAndAwait('lab_probe', large, { timeout: 30_000 })
      const returned = (result.envelope.payload as { blob?: string })?.blob?.length ?? 0
      setCheck(
        'large',
        sameValue(result.envelope.payload, large) ? 'pass' : 'fail',
        sameValue(result.envelope.payload, large)
          ? `${JSON.stringify(large).length} chars returned intact in ${result.ms} ms`
          : `returned but corrupted (${returned} chars instead of 20000)`,
        result.ms
      )
    } catch (error) {
      setCheck('large', 'fail', errorText(error))
    }

    // ---- 8 · sequence ---------------------------------------------------------
    setCheck('burst', 'running', '')
    const count = 10
    const arrived: number[] = []
    let sendFailures = 0
    let lost = 0
    for (let index = 1; index <= count; index++) {
      try {
        // Sequential on purpose: concurrent sends have no defined send order,
        // so an ordering assertion over them would be measuring HTTP racing.
        const result = await sendAndAwait('lab_probe', { burst: index }, { timeout: 20_000 })
        arrived.push((result.envelope.payload as { burst: number }).burst)
      } catch (error) {
        if (errorText(error).startsWith('nothing came back')) {
          lost++
        } else {
          // A REST refusal (rate limit, scope) is not a delivery failure, and
          // reporting it as one would point the reader at the codec.
          sendFailures++
          log('note', `burst #${index} was never sent: ${errorText(error)}`)
        }
      }
    }
    const ordered = arrived.every((value, index) => value === index + 1)
    if (sendFailures > 0) {
      setCheck('burst', 'warn', `${sendFailures} of ${count} could not be SENT (a portal or rate-limit problem, not a delivery one); ${arrived.length} of the rest arrived`)
    } else if (arrived.length === count && ordered) {
      setCheck('burst', 'pass', `all ${count} arrived in order`)
    } else if (arrived.length === count) {
      setCheck('burst', 'warn', `all ${count} arrived, out of order: ${arrived.join(',')}`)
    } else {
      setCheck('burst', 'fail', `${lost} lost; arrived: ${arrived.join(',')}`)
    }

    // ---- 9 · the encode path ---------------------------------------------------
    setCheck('encode', 'running', '')
    if (pull.isJsonRpc()) {
      // `isPublishingEnabled()` is `version > 3`, so it is ALSO true on
      // push-server 5+, where `sendMessage()` branches into the JSON-RPC
      // adapter before `sendMessageBatch` and no codec runs at all. Gating
      // only on publishing let this check send successfully on such a portal
      // and then report that the codec had encoded the batch.
      setCheck(
        'encode',
        'skip',
        'this portal speaks JSON-RPC (push-server 5+), so sendMessage() does not go through either codec. The encode half is UNREACHABLE here, not merely untested — say so when reporting.'
      )
    } else if (!pull.isPublishingEnabled()) {
      setCheck(
        'encode',
        'skip',
        'publish_enabled is off on this portal, so PullClient.sendMessage() is refused and encodeRequestBatch cannot be reached. The encode half of the codec is UNTESTED by this run — say so when reporting.'
      )
    } else {
      const envelopeId = Text.getUuidRfc4122()
      let resolveFn: (envelope: LabEnvelope) => void = () => {}
      const received = new Promise<LabEnvelope>((resolve) => {
        resolveFn = resolve
      })
      pending.set(envelopeId, resolveFn)
      let timer = 0
      const startedWaiting = Date.now()
      encodeWindow.value = { fromMs: startedWaiting - startedAt, toMs: 0 }
      try {
        // This is the call that runs encodeRequestBatch under the chosen codec.
        await pull.sendMessage([userId.value], MODULE_ID, 'lab_probe', {
          lab: {
            id: envelopeId,
            from: tabId.value,
            fromCodec: codec.value,
            to: null,
            seq: ++seq,
            sentAt: Date.now(),
            payload: { probe: 'encode', text: 'Проверка кодека 🚀', pad: 'z'.repeat(200) }
          } satisfies LabEnvelope
        })
        // `sendMessage()` RETURNING is, since 3.0.0, a statement about the
        // encoder and the socket: the batch was encoded and the connector
        // accepted the frame. Anything short of that throws — on this branch,
        // which is why the JSON-RPC portals are sent to `skip` above.
        //
        // It says the encoder RAN. It says nothing about whether the bytes it
        // produced were right.
        encodePathExercised.value = true
        const expired = new Promise<null>((resolve) => {
          timer = window.setTimeout(() => resolve(null), AWAIT_MS)
        })
        const winner = await Promise.race([received, expired])
        if (winner === null) {
          // NOT a fail, and not a clean bill of health either.
          //
          // The old text, "accepted but nothing came back", described the
          // pre-3.0.0 client, where `sendMessage()` resolved before the channel
          // lookup had answered and an unsent message looked exactly like this
          // one. It no longer can, so that reading is gone.
          //
          // What replaced it must not overclaim in the other direction. A
          // missing echo does NOT clear the encoder: the push server drops a
          // frame it cannot address or cannot parse without a word, so a real
          // encode bug — a wrong length prefix, a mis-encoded receiver id —
          // produces this exact symptom. Encoded and accepted by the transport
          // is all that can be asserted here.
          setCheck(
            'encode',
            'warn',
            `the batch was encoded by the "${codec.value}" codec and the connector accepted the frame — that is what a returning sendMessage() means since 3.0.0 — but no echo reached this page within ${AWAIT_MS} ms. The encoder RAN; whether its bytes were CORRECT is exactly what a missing echo cannot tell you. Check socketClosures against encodeWindow in the report: a frameRefusal closure inside the window names the reason, and no closure at all means nothing either way, since a frame that parses but addresses the wrong field is dropped without a word.`
          )
        } else {
          setCheck('encode', 'pass', `encoded by the "${codec.value}" codec and returned in ${Date.now() - startedWaiting} ms`, Date.now() - startedWaiting)
        }
      } catch (error) {
        // The code in the text is the whole point of reporting it:
        // `JSSDK_PULL_PUBLIC_IDS_UNAVAILABLE` means the encoder never ran,
        // while `JSSDK_PULL_SEND_REFUSED` is thrown AFTER `encodeMessageBatch`
        // — the transport refused a frame the codec had already produced. The
        // flag follows that fact rather than the verdict, which is the whole
        // reason it stopped being derived from the verdict.
        if ((error as { code?: unknown } | null)?.code === 'JSSDK_PULL_SEND_REFUSED') {
          encodePathExercised.value = true
        }
        setCheck('encode', 'fail', errorText(error))
      } finally {
        if (timer) {
          window.clearTimeout(timer)
        }
        if (encodeWindow.value) {
          encodeWindow.value.toMs = Date.now() - startedAt
        }
        pending.delete(envelopeId)
      }
    }
    // ---- 10 · the lone surrogate, on its own ----------------------------------
    setCheck('surrogate', 'running', '')
    try {
      const probe = { loneSurrogate: '\uD800' }
      const result = await sendAndAwait('lab_probe', probe, { timeout: 20_000 })
      setCheck(
        'surrogate',
        sameValue(result.envelope.payload, probe) ? 'pass' : 'warn',
        sameValue(result.envelope.payload, probe)
          ? 'survived the round trip unchanged'
          : `came back changed: ${JSON.stringify(result.envelope.payload)}`,
        result.ms
      )
    } catch (error) {
      setCheck(
        'surrogate',
        'warn',
        `did not travel: ${errorText(error)} — expected, and a transport fact rather than a codec one`
      )
    }
  } finally {
    refreshConnection()
    isRunning.value = false
  }
}

// endregion ////

// region cross-tab ////

async function pingOtherTab(): Promise<void> {
  // `onPullMessage` already sees every frame, so the reply is picked up there
  // rather than through a second subscription that has to be cleaned up.
  try {
    await send('lab_ping', { token: Text.getUuidRfc4122() })
    log('note', 'ping sent — a pong line will appear below if another tab answers')
  } catch (error) {
    log('note', 'ping failed: ' + errorText(error))
  }
}

async function sendChat(): Promise<void> {
  const text = chatDraft.value.trim()
  if (!text) {
    return
  }

  chatDraft.value = ''
  try {
    await send('lab_chat', { text })
  } catch (error) {
    log('note', 'chat failed: ' + errorText(error))
  }
}

// endregion ////

// region connection panel ////

function refreshConnection(): void {
  if (!pull) {
    return
  }

  status.value = pull.status
  serverVersion.value = pull.getServerVersion()
  publishingEnabled.value = pull.isPublishingEnabled()
  const info = pull.getDebugInfo() as Record<string, unknown>
  debugInfo.value = info
  wsMode.value = String(info['WebSocket mode'] ?? '-')
  // The client keeps its connection type private, but the debug dump says
  // whether the WebSocket is the one that is up — which is the same answer.
  connectionType.value = info['WebSocket connected'] === 'Y'
    ? 'webSocket'
    : (pull.isConnected() ? 'longPolling' : '-')
  attachFrameTap()
}

// endregion ////

// region export ////

/**
 * The SDK masks the push JWT and the private channel id, but not everything.
 *
 * `Path` still carries the push-server host and, in shared mode, `clientId` —
 * a portal-scoped identifier that is not in the SDK's redaction list. Neither
 * is an access credential, but this file is destined for a chat log, so they
 * are removed here rather than explained away.
 */
function scrubDebugInfo(info: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...info }
  if (typeof copy.Path === 'string') {
    copy.Path = copy.Path
      .replace(/^[a-z]+:\/\/[^/]+/i, '<push-host>')
      .replace(/([?&]clientId=)[^&]*/gi, '$1<redacted>')
  }
  // Always serialises as `{}` — it is a MapIterator, not data.
  delete copy['Watch tags']

  return copy
}

const report = computed(() => ({
  generatedAt: new Date().toISOString(),
  readBeforeSending: [
    'This file is a portal fingerprint, not just a debug dump. Read it before you send it.',
    'It contains: your portal user id, the push-server version, whether the portal is cloud or on-premise, timings, and any portal error text a failed check produced.',
    'The push JWT, the private channel id, the push host and clientId are masked.',
    'Captured raw frames, if any, are EVERY frame on this connection — including other applications\' events. Check them before sharing.',
    'socketClosures[].reason is the SERVER\'s own text, not this page\'s. It is truncated but not masked, so read it before sending.'
  ],
  tabId: tabId.value,
  codec: codec.value,
  connection: {
    status: status.value,
    transport: connectionType.value,
    webSocketModeReported: wsMode.value,
    binaryFrameObserved: sawBinaryFrame.value,
    serverVersion: serverVersion.value,
    publishingEnabled: publishingEnabled.value,
    // Reported from what actually happened, not from the verdict: the check
    // can end in `warn` with the encoder having run, which is precisely the
    // case `pull-protobuf.md` asks about.
    encodePathExercised: encodePathExercised.value
  },
  /**
   * Read this FIRST when check 9 did not pass, and read it with `encodeWindow`
   * beside it: an entry whose `ms` falls between `fromMs` and `toMs`, with
   * `frameRefusal: true`, is the best explanation this page can offer for a
   * missing echo. An entry with `frameRefusal: false` is almost certainly an
   * ordinary reconnect and means nothing here. An EMPTY list means nothing
   * either way — see the comment on `socketClosures` in the source.
   */
  encodeWindow: encodeWindow.value,
  socketClosures: socketClosures.value,
  debugInfo: scrubDebugInfo(debugInfo.value),
  checks: checks.map(check => ({
    id: check.id,
    title: check.title,
    why: check.why,
    state: check.state,
    detail: check.detail,
    ms: check.ms
  })),
  latencyMs: latencies.value,
  rawFrames: frames.value,
  events: events.value
}))

const reportText = computed(() => pretty(report.value))
const reversedEvents = computed(() => [...events.value].reverse())
const isReportOpen = ref(false)

async function copyReport(): Promise<void> {
  try {
    await navigator.clipboard.writeText(reportText.value)
    log('note', 'report copied to the clipboard')
  } catch {
    log('note', 'clipboard refused — open the report below and copy it manually')
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
  // A codec is chosen when the client is constructed, so the page reloads —
  // and a reload skips Vue's unmount hooks, hence the explicit teardown.
  pull?.destroy()
  void router.replace({ query: { ...route.query, codec: next } }).then(() => {
    window.location.reload()
  })
}

// endregion ////

onMounted(async () => {
  try {
    tabId.value = Math.random().toString(36).slice(2, 7)
    // Deliberately no `installFinish()` here, unlike some repro harnesses:
    // completing an application's installation is not something a diagnostic
    // page should do as a side effect of being opened.
    $b24 = await $initializeB24Frame()

    const profile = await $b24.actions.v2.call.make({
      method: 'profile',
      params: {},
      requestId: `pull-lab/${tabId.value}/profile`
    })
    userId.value = Number((profile.getData()?.result as { ID?: number | string })?.ID ?? 0)
    if (!Number.isFinite(userId.value) || userId.value <= 0) {
      throw new Error('the profile call returned no user ID — the Pull client cannot start without one')
    }

    pull = new B24PullClientManager({
      b24: $b24,
      restApplication: $b24.auth.getUniq('pull-lab'),
      userId: userId.value,
      protobufCodec: codec.value
    })

    // BOTH subscription types, and the second one is not optional here.
    //
    // `subscribe()` defaults `type` to `SubscriptionType.Server`, and
    // `broadcastMessage` routes on the frame's own `extra.sender.type`: a
    // message the BACK END published (`pull.application.event.add`, which is
    // how checks 4-8 send) arrives as `Server`, while one a CLIENT published
    // (`sendMessage()`, which is the only way to reach the encoder, and so the
    // only thing check 9 can use) arrives as `Client` and is emitted on a
    // different channel entirely.
    //
    // With the server subscription alone, check 9's echo was unroutable by
    // construction: the frame could come back perfectly decoded and still
    // never reach this page. It timed out every time, and the page blamed the
    // push server for it.
    unsubscribers = [
      pull.subscribe({ type: SubscriptionType.Server, moduleId: MODULE_ID, callback: onPullMessage }),
      pull.subscribe({ type: SubscriptionType.Client, moduleId: MODULE_ID, callback: onPullMessage })
    ]
    await pull.start()

    log('note', `tab ${tabId.value} started on the "${codec.value}" codec as user ${userId.value}`)
    refreshConnection()
    refreshTimer = window.setInterval(refreshConnection, 2000)
    isInit.value = true
  } catch (error) {
    initError.value = errorText(error)
    $logger.error('pull lab init failed', { error })
  }
})

onUnmounted(() => {
  if (refreshTimer) {
    window.clearInterval(refreshTimer)
  }
  tappedSocket?.removeEventListener('message', onSocketFrame)
  tappedSocket?.removeEventListener('close', onSocketClose)
  tappedSocket = null
  pending.clear()
  for (const off of unsubscribers) {
    off()
  }
  unsubscribers = []
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
      <B24Alert
        color="air-primary-alert"
        description="Test portals only. Every check from 4 onwards publishes to the SHARED application channel, which reaches every user who currently has this application open — including anything you type in the message box."
      />

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
        v-if="isInit && serverVersion > 0 && serverVersion !== 4"
        color="air-primary-alert"
        :description="`Push-server version is ${serverVersion}. The protobuf path is only used on version 4 — on 5 and above the client speaks JSON-RPC and neither codec runs, so nothing here would say anything about them.`"
      />

      <!-- Connection -->
      <div class="rounded-lg border border-(--ui-border) p-3">
        <div class="mb-2 font-bold">
          Connection
        </div>
        <div class="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs md:grid-cols-3">
          <div>status: <b>{{ status }}</b></div>
          <div>transport: <b>{{ connectionType }}</b></div>
          <div>ws mode (reported): <b>{{ wsMode }}</b></div>
          <div>binary frame seen: <b>{{ sawBinaryFrame ? 'yes' : 'no' }}</b></div>
          <div>server version: <b>{{ serverVersion }}</b></div>
          <div>publishing: <b>{{ publishingEnabled ? 'enabled' : 'disabled' }}</b></div>
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
                'opacity-50': check.state === 'idle' || check.state === 'running' || check.state === 'skip',
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

      <!-- Raw frames: the artefact the codec decision is actually waiting on -->
      <div class="rounded-lg border border-(--ui-border) p-3">
        <div class="mb-2 font-bold">
          Raw frames — {{ frames.length }}/{{ MAX_FRAMES }} captured
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <B24Button
            :label="isCapturing ? '■ Stop capturing' : '● Capture raw frames'"
            :color="isCapturing ? 'air-primary-alert' : 'air-secondary'"
            @click="toggleCapture"
          />
          <B24Button
            label="Discard"
            color="air-tertiary-no-accent"
            :disabled="frames.length === 0"
            @click="clearFrames"
          />
        </div>
        <div class="mt-2 text-xs opacity-60">
          These bytes are what `pull-protobuf.md` asks for before the vendored library can be
          deleted — the decoded results above cannot settle it, because both codecs were built
          from the same schema. <b>The tap records every frame on this connection, including other
            applications' events.</b> Look at what you captured before you share the report.
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
            v-for="event in reversedEvents"
            :key="event.id"
            class="flex gap-2"
            :class="{
              'text-(--ui-color-success-text)': event.kind === 'received',
              'opacity-70': event.kind === 'sent',
              'opacity-50': event.kind === 'note' || event.kind === 'frame'
            }"
          >
            <span class="w-16 shrink-0 text-right opacity-60">{{ event.ms }}ms</span>
            <span class="w-16 shrink-0">{{ event.kind }}</span>
            <span class="break-all">{{ event.text }}</span>
          </div>
        </div>
      </div>

      <!-- The thing to hand back -->
      <div class="rounded-lg border border-(--ui-border) p-3">
        <B24Button
          :label="isReportOpen ? 'Hide the report' : 'Show the report (JSON) — read it before you send it'"
          color="air-tertiary-no-accent"
          size="xs"
          @click="isReportOpen = !isReportOpen"
        />
        <pre
          v-if="isReportOpen"
          class="mt-2 max-h-96 overflow-auto font-mono text-xs whitespace-pre-wrap break-words"
        >{{ reportText }}</pre>
      </div>
    </div>
  </ClientOnly>
</template>
