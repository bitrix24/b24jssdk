/**
 * The differential, driven by a generator instead of by hand.
 *
 * `protobuf-lite-differential.unit.spec.ts` is the same comparison on inputs
 * somebody wrote down. That is a sample, and the boundaries most likely to
 * diverge are exactly the ones nobody thinks to write down (#559). This file
 * generates them.
 *
 * `*.unit.spec.ts` (testing.md's exception): the oracle is the vendored
 * library, not a portal, so it runs in CI where the live suites cannot.
 *
 * Sections follow the risks `.github/contributing/pull-protobuf.md` numbers:
 *
 *  - **R2 encode** — the bytes the lite codec produces equal the bytes
 *    protobuf.js produces.
 *  - **R2 decode** — what the lite codec reads out of library-produced bytes
 *    equals what the library reads out of them, sender and `oneof` included.
 *  - **R3** — on DAMAGED input, the lite codec never throws where the library
 *    returns; bytes appended to a sound frame change nothing before them; and
 *    every frame cut short is reported as damaged.
 *  - **R4** — the two deliberate divergences, pinned so either one changing is
 *    noticed.
 *
 * What a green run means, stated so it is not over-read: no divergence was
 * found on this corpus. It is a dense, boundary-weighted SAMPLE of the input
 * space, not an enumeration of it, and the seed is fixed so that a failure is
 * a reproducible bug report rather than a lottery ticket. To search wider,
 * raise `RUNS` or change `SEED` deliberately and commit the value that found
 * something.
 *
 * Every one of these tests needs `model.js` as its oracle and will be deleted
 * with it. What must survive the deletion is recorded in the contributing doc.
 */
import { describe, it, expect } from 'vitest'
import { IncomingMessage, Receiver, RequestBatch, ResponseBatch } from '../../../packages/jssdk/src/pullClient/protobuf'
import { decodeResponseBatch, encodeRequestBatch } from '../../../packages/jssdk/src/pullClient/protobuf-lite/messages'
import type { LiteIncomingMessage } from '../../../packages/jssdk/src/pullClient/protobuf-lite/messages'

const SEED = 0x5EED_1234
const RUNS = 2000
/** The encode section is the slow one; this is its own ceiling, not the suite's. */
const SLOW = 30_000

const hex = (view: Uint8Array) => [...view].map(b => b.toString(16).padStart(2, '0')).join(' ')

/** Byte equality, cheap enough to run on every iteration; `hex` is kept for the failure message. */
function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false
  }
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) {
      return false
    }
  }

  return true
}
const utf8 = new TextEncoder()

/**
 * mulberry32 — 32 bits of state, and the same sequence everywhere.
 *
 * `Math.random()` cannot be used: a failure has to be reproducible from the
 * seed alone, which is the whole reason this file is allowed to exist.
 */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0

  return () => {
    state = (state + 0x6D2B_79F5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

const pick = <T>(random: () => number, values: readonly T[]): T =>
  values[Math.floor(random() * values.length)]!

/**
 * Where a length prefix changes width — one byte up to 127, two up to 16383,
 * three beyond. These are asserted to be HIT EXACTLY by the encode section.
 */
const LENGTH_BOUNDARIES = [0, 1, 127, 128, 129, 16_383, 16_384, 16_385] as const

/**
 * Every varint width, `uint32`'s ceiling, and the values a caller can pass to
 * the public `sendMessage()` that are not a valid `uint32` at all — negative,
 * fractional, too large, not a number. Both codecs were checked to agree on
 * all of them before they were put here.
 */
const EXPIRY_VALUES = [
  0, 1, 127, 128, 16_383, 16_384, 2_097_151, 2_097_152,
  268_435_455, 268_435_456, 4_294_967_295,
  -1, -300, 1.5, 4_294_967_296, 2 ** 40, Number.NaN, Number.POSITIVE_INFINITY
] as const

function pickExpiry(random: () => number): number {
  return random() < 0.85 ? pick(random, EXPIRY_VALUES) : Math.floor(random() * 100_000)
}

/** For ids and signatures: small, but crossing the one-byte prefix. */
const ID_LENGTHS = [0, 1, 2, 16, 20, 32, 127, 128, 129, 200] as const

function randomBytes(random: () => number, length: number): Uint8Array {
  const view = new Uint8Array(length)
  for (let index = 0; index < length; index++) {
    view[index] = Math.floor(random() * 256)
  }

  return view
}

/** One-, two-, three- and four-byte UTF-8, plus the characters JSON escapes. */
const ALPHABET = ['x', '"', '\\', '\n', 'ё', 'ä', '中', '€', '🙂', '𝄞'] as const
/** Measured once: encoding each character on every draw made the suite 4x slower. */
const WIDTH = new Map(ALPHABET.map(char => [char, utf8.encode(char).length]))

/**
 * A string of EXACTLY `targetBytes` UTF-8 bytes.
 *
 * Building to a character count instead missed the boundaries that matter:
 * 'ё' is two bytes and '🙂' four, so a body of them lands on 128 and 16384 but
 * never on 127 or 16383, which is where a one- or two-byte length prefix is at
 * its last value. Filling with mixed widths and topping up with ASCII hits the
 * byte count exactly whatever the mix.
 */
function bodyOfBytes(random: () => number, targetBytes: number): string {
  const parts: string[] = []
  let bytes = 0
  while (bytes < targetBytes) {
    const candidate = pick(random, ALPHABET)
    const width = WIDTH.get(candidate)!
    if (width <= targetBytes - bytes) {
      parts.push(candidate)
      bytes += width
    } else {
      parts.push('x')
      bytes += 1
    }
  }

  return parts.join('')
}

function pickBody(random: () => number): string {
  const kind = random()
  if (kind < 0.75) {
    return bodyOfBytes(random, pick(random, LENGTH_BOUNDARIES))
  }
  if (kind < 0.9) {
    // What `client.ts` actually encodes: `JSON.stringify` output, escapes and all.
    return JSON.stringify({ module_id: 'main', command: 'ping', params: { text: bodyOfBytes(random, Math.floor(random() * 200)) } })
  }

  return bodyOfBytes(random, Math.floor(random() * 300))
}

function makeMessage(random: () => number): LiteIncomingMessage {
  const message: LiteIncomingMessage = {}

  const receiverCount = random() < 0.1 ? 0 : Math.floor(random() * 8) + 1
  if (receiverCount > 0 || random() < 0.5) {
    message.receivers = Array.from({ length: receiverCount }, () => {
      const receiver: Record<string, unknown> = {}
      if (random() < 0.95) {
        receiver.id = randomBytes(random, pick(random, ID_LENGTHS))
      }
      if (random() < 0.2) {
        receiver.isPrivate = random() < 0.5
      }
      if (random() < 0.9) {
        receiver.signature = randomBytes(random, pick(random, ID_LENGTHS))
      }

      return receiver
    })
  }

  if (random() < 0.9) {
    message.body = pickBody(random)
  }
  if (random() < 0.9) {
    message.expiry = pickExpiry(random)
  }
  // Neither is set by `client.ts` today, which is exactly why they are
  // generated: an encoder nobody exercises is an encoder nobody has checked.
  if (random() < 0.25) {
    message.type = random() < 0.5 ? '' : bodyOfBytes(random, Math.floor(random() * 40))
  }
  if (random() < 0.25) {
    message.sender = makeSender(random)
  }

  return message
}

/** Every shape a sender can take: empty, type only, id only, both. */
function makeSender(random: () => number): { type?: number, id?: Uint8Array } {
  const shape = Math.floor(random() * 4)

  return {
    ...(shape === 1 || shape === 3 ? { type: Math.floor(random() * 3) } : {}),
    ...(shape === 2 || shape === 3 ? { id: randomBytes(random, pick(random, ID_LENGTHS)) } : {})
  }
}

/** The vendored path, exactly as `client.ts` drives it. */
function encodeWithVendored(messages: LiteIncomingMessage[]): Uint8Array {
  const built = messages.map(message => IncomingMessage.create({
    receivers: (message.receivers ?? []).map(receiver => Receiver.create({
      ...(receiver.id === undefined ? {} : { id: receiver.id }),
      ...(receiver.isPrivate === undefined ? {} : { isPrivate: receiver.isPrivate }),
      ...(receiver.signature === undefined ? {} : { signature: receiver.signature })
    })),
    ...(message.sender === undefined ? {} : { sender: message.sender }),
    ...(message.body === undefined ? {} : { body: message.body }),
    ...(message.expiry === undefined ? {} : { expiry: message.expiry }),
    ...(message.type === undefined ? {} : { type: message.type })
  }))

  return RequestBatch.encode(
    RequestBatch.create({ requests: [{ incomingMessages: { messages: built } }] })
  ).finish()
}

/** A response message, as the server would build one. */
function makeOutgoing(random: () => number) {
  return {
    id: randomBytes(random, pick(random, ID_LENGTHS)),
    body: pickBody(random),
    expiry: Math.floor(random() * 4_294_967_296),
    created: pick(random, [0, 1, 2_147_483_647, 2_147_483_648, 4_294_967_295, Math.floor(random() * 4_294_967_296)]),
    ...(random() < 0.6 ? { sender: makeSender(random) } : {})
  }
}

/**
 * The oneof key protobuf.js actually set, read off the decoded instance.
 *
 * The library exposes it as a virtual property; reading which sub-message is
 * present works on both what it returns and on plain objects.
 */
function commandOf(response: Record<string, any>): string | null {
  if (typeof response.command === 'string') {
    return response.command
  }
  for (const key of ['outgoingMessages', 'channelStats', 'serverStats']) {
    if (response[key] !== undefined && response[key] !== null) {
      return key
    }
  }

  return null
}

/**
 * What either codec hands the client, normalised so the two are comparable.
 *
 * Everything the client reads is here — `command`, and on each message `id`,
 * `body`, `expiry`, `created`, and the sender's `type` AND `id`. An earlier
 * version kept only `senderType`, and three mutations to the sender decoder
 * survived it, including the very `{}`-instead-of-defaults bug #552 fixed.
 */
function shapeBatch(batch: unknown) {
  const responses = (batch as { responses?: Array<Record<string, any>> }).responses ?? []

  return responses.map(response => ({
    command: commandOf(response),
    outgoing: response.outgoingMessages === undefined || response.outgoingMessages === null
      ? null
      : (response.outgoingMessages.messages ?? []).map(shapeMessage)
  }))
}

function shapeMessage(message: Record<string, any>) {
  const sender = message.sender === undefined || message.sender === null ? null : message.sender

  return {
    id: message.id === undefined || message.id === null ? null : [...message.id],
    body: message.body,
    expiry: message.expiry,
    created: message.created,
    senderType: sender === null ? null : (sender.type ?? 0),
    senderId: sender === null || sender.id === undefined || sender.id === null ? null : [...sender.id]
  }
}

/** Outcome, not value: the first thing R3 compares. */
function outcomeOf(run: () => unknown): 'threw' | 'returned' {
  try {
    run()

    return 'returned'
  } catch {
    return 'threw'
  }
}

describe('pull protobuf-lite — R2, encode agrees with the library', () => {
  it(`produces identical bytes across ${RUNS} generated batches, hitting every length boundary exactly (seed ${SEED})`, () => {
    const random = makeRandom(SEED)
    const bodyLengths = new Set<number>()
    const idLengths = new Set<number>()
    const expiries = new Set<number>()
    let compared = 0

    for (let run = 0; run < RUNS; run++) {
      const messages = Array.from(
        { length: random() < 0.15 ? 0 : Math.floor(random() * 3) + 1 },
        () => makeMessage(random)
      )

      // Measured on the corpus actually compared below, not on a second one
      // drawn separately — an earlier version did that, and its coverage
      // check described bytes the encode loop never sent.
      for (const message of messages) {
        if (message.body !== undefined) {
          bodyLengths.add(utf8.encode(message.body).length)
        }
        if (message.expiry !== undefined) {
          expiries.add(message.expiry)
        }
        for (const receiver of message.receivers ?? []) {
          if (receiver.id) {
            idLengths.add(receiver.id.length)
          }
        }
      }

      const fromLite = encodeRequestBatch(messages)
      const fromVendored = encodeWithVendored(messages)
      if (!sameBytes(fromLite, fromVendored)) {
        expect(hex(fromLite), `run ${run}`).toBe(hex(fromVendored))
      }
      compared++
    }

    expect(compared).toBe(RUNS)
    for (const boundary of LENGTH_BOUNDARIES) {
      expect(bodyLengths.has(boundary), `a body of exactly ${boundary} bytes`).toBe(true)
    }
    expect(idLengths.has(128), 'an id needing a two-byte length prefix').toBe(true)
    for (const value of [-1, 4_294_967_295, 4_294_967_296]) {
      expect(expiries.has(value), `expiry ${value}`).toBe(true)
    }
    expect([...expiries].some(Number.isNaN), 'a NaN expiry').toBe(true)
  }, SLOW)
})

describe('pull protobuf-lite — R2, decode agrees with the library', () => {
  it(`reads library-produced frames identically across ${RUNS} runs (seed ${SEED})`, () => {
    const random = makeRandom(SEED ^ 0x1111)
    const senderShapes = new Set<string>()

    for (let run = 0; run < RUNS; run++) {
      const messages = Array.from({ length: Math.floor(random() * 3) + 1 }, () => makeOutgoing(random))
      for (const message of messages) {
        senderShapes.add(message.sender === undefined ? 'absent' : Object.keys(message.sender).sort().join('+') || 'empty')
      }

      const frame = ResponseBatch.encode(ResponseBatch.create({
        responses: [{ outgoingMessages: { messages } }]
      })).finish()

      const fromLite = decodeResponseBatch(frame)
      expect(fromLite.damaged, `run ${run}: a library-produced frame is never damaged`).toBe(false)
      expect(shapeBatch(fromLite), `run ${run}`).toStrictEqual(shapeBatch(ResponseBatch.decode(frame)))
    }

    // Each sender shape reached, or the sender decoder was not really tested.
    for (const shape of ['absent', 'empty', 'type', 'id', 'id+type']) {
      expect(senderShapes.has(shape), `a sender shaped ${shape}`).toBe(true)
    }
  }, SLOW)

  it('agrees on the oneof discriminator, whichever branch the server sent', () => {
    // Reading a statistics response as a message list would hand the client
    // messages it never received. `command` is compared — an earlier version
    // compared only the message list, and a decoder that labelled every
    // branch `outgoingMessages` passed it.
    for (const build of [
      () => ResponseBatch.create({ responses: [{ channelStats: {} }] }),
      () => ResponseBatch.create({ responses: [{ serverStats: {} }] }),
      () => ResponseBatch.create({ responses: [{ outgoingMessages: { messages: [] } }] })
    ]) {
      const frame = ResponseBatch.encode(build()).finish()
      const fromLite = shapeBatch(decodeResponseBatch(frame))
      expect(fromLite).toStrictEqual(shapeBatch(ResponseBatch.decode(frame)))
      expect(fromLite[0]!.command).not.toBeNull()
    }
  })

  it('masks an expiry wider than 32 bits the way the library does', () => {
    // The library's encoder will not write one, so the generator cannot reach
    // it; a server could. Built by hand: an OutgoingMessage whose `expiry` is
    // the five-byte varint for 2^32, which `uint32` reads back as 0.
    const message = Uint8Array.from([0x18, 0x80, 0x80, 0x80, 0x80, 0x10])
    const frame = Uint8Array.from([
      0x0A, message.length + 4,
      0x0A, message.length + 2,
      0x0A, message.length, ...message
    ])

    const fromLite = shapeBatch(decodeResponseBatch(frame))
    expect(fromLite).toStrictEqual(shapeBatch(ResponseBatch.decode(frame)))
    expect(fromLite[0]!.outgoing![0]!.expiry).toBe(0)
  })
})

describe('pull protobuf-lite — R4, the divergences that are deliberate', () => {
  it('skips a known field arriving with the wrong wire type, where the library reads it anyway', () => {
    // The third deliberate divergence, found by the R3 fuzz. protobuf.js
    // switches on the field number alone and reads by the DECLARED type; the
    // lite codec checks the wire type and treats a mismatch as an unknown
    // field, which is what the protobuf spec asks of a decoder. Reachable only
    // from a damaged frame, or from a server that changed a field's type — in
    // which case skipping is the safe reading and the library's is garbage.
    //
    // `body` (field 2, length-delimited) arriving as a varint:
    const message = Uint8Array.from([0x0A, 0x01, 0x07, 0x10, 0x05])
    const frame = Uint8Array.from([0x0A, message.length + 4, 0x0A, message.length + 2, 0x0A, message.length, ...message])

    const fromLite = decodeResponseBatch(frame)
    expect(fromLite.responses[0]!.outgoingMessages!.messages[0]!.body).toBe('')
    expect(fromLite.damaged).toBe(false)
    expect(outcomeOf(() => ResponseBatch.decode(frame))).toBe('threw')
  })

  // Pinned rather than smoothed away, like `Sender.id` in the differential
  // suite: the moment one of these stops being true, in either direction,
  // somebody has changed something they should be told about. Lone surrogates
  // are kept OUT of the generator above so a known difference cannot drown a
  // new one.
  it('writes a lone surrogate as U+FFFD where the library writes WTF-8, and differs in nothing else', () => {
    // `TextEncoder` substitutes; protobuf.js emits the unpaired code point as
    // three bytes of WTF-8, which is not valid UTF-8. Both are three bytes, so
    // no length prefix shifts. What the push server does with the library's
    // version has not been measured.
    //
    // Unreachable from `client.ts` on any ES2019+ engine: the only strings it
    // encodes are `JSON.stringify` output, which escapes lone surrogates.
    const messages = [{ receivers: [{ id: Uint8Array.from([1]) }], body: 'a\uD83Db' }]
    const fromLite = hex(encodeRequestBatch(messages))
    const fromVendored = hex(encodeWithVendored(messages))

    expect(fromVendored).toContain('ed a0 bd')
    // Exactly that substitution and nothing else.
    expect(fromLite).toBe(fromVendored.replace('ed a0 bd', 'ef bf bd'))
  })

  it('reads WTF-8 back as replacement characters, where the library restores the surrogate', () => {
    const frame = ResponseBatch.encode(ResponseBatch.create({
      responses: [{ outgoingMessages: { messages: [{ id: Uint8Array.from([1]), body: 'a\uD83Db', expiry: 0, created: 0 }] } }] }
    )).finish()

    const fromLite = decodeResponseBatch(frame).responses[0]!.outgoingMessages!.messages[0]!.body
    const fromVendored = (ResponseBatch.decode(frame) as unknown as {
      responses: Array<Record<string, any>>
    }).responses[0]!.outgoingMessages.messages[0].body

    expect(fromLite).toBe('a���b')
    expect(fromVendored).toBe('a\uD83Db')
  })
})

type DamageKind = 'truncate' | 'flip' | 'inflate' | 'append'

/** One mutation, of the kind a real wire fault produces, and which one it was. */
function damage(frame: Uint8Array, random: () => number): { frame: Uint8Array, kind: DamageKind } {
  const kind = pick(random, ['truncate', 'flip', 'inflate', 'append'] as const)
  const copy = Uint8Array.from(frame)

  switch (kind) {
    case 'truncate':
      return { kind, frame: copy.slice(0, Math.floor(random() * copy.length)) }
    case 'flip': {
      const index = Math.floor(random() * copy.length)
      copy[index] = (copy[index]! ^ (1 << Math.floor(random() * 8))) & 0xFF

      return { kind, frame: copy }
    }
    case 'inflate': {
      // A byte forced to a large length-prefix value. Chosen so it always
      // CHANGES the byte: writing 0x7F over an existing 0x7F was a no-op the
      // previous version counted as damage.
      const index = Math.floor(random() * copy.length)
      copy[index] = copy[index] === 0x7F ? 0x7E : 0x7F

      return { kind, frame: copy }
    }
    case 'append':
      return { kind, frame: Uint8Array.from([...copy, ...randomBytes(random, Math.floor(random() * 8) + 1)]) }
  }
}

describe('pull protobuf-lite — R3, it is never less tolerant than the library', () => {
  // The property is ASYMMETRIC, on purpose. `extractProtobufMessages` catches
  // around the whole decode, so a throw costs the batch — including messages
  // that had already parsed. Being more tolerant than the library delivers a
  // valid prefix where the library delivers nothing, which is an improvement;
  // being LESS tolerant is the regression. Requiring identical outcomes would
  // mean reimplementing protobuf.js's error model byte for byte and would buy
  // the client nothing.
  //
  // But "does not throw" alone is weak — a decoder returning an empty batch on
  // any damage would pass it. So the VALUES are checked too, and only where
  // there is something true to check them against.
  //
  // That rules out comparing with the library on a frame whose bytes were
  // CHANGED. The library switches on the field number alone and reads by the
  // declared type, so a flipped wire-type bit makes it read garbage — or throw;
  // the lite codec validates the wire type and skips the field as unknown.
  // Neither result is correct, so neither is an oracle. An earlier draft
  // compared them anyway and reported 393 "mismatches" that were two different
  // kinds of garbage. The reference is the UNDAMAGED frame, which exists for
  // truncation and for appended bytes, and does not for the others.
  it(`on ${RUNS} damaged frames: never throws where the library returns, and reports what it could not read (seed ${SEED})`, () => {
    const random = makeRandom(SEED ^ 0x2222)
    const regressions: string[] = []
    const unreportedCuts: string[] = []
    const appendViolations: string[] = []
    const kinds: Record<DamageKind, number> = { truncate: 0, flip: 0, inflate: 0, append: 0 }

    for (let run = 0; run < RUNS; run++) {
      const messages = Array.from({ length: Math.floor(random() * 3) + 1 }, () => makeOutgoing(random))
      const good = ResponseBatch.encode(ResponseBatch.create({
        responses: [{ outgoingMessages: { messages } }]
      })).finish()

      const { frame: broken, kind } = damage(good, random)
      kinds[kind]++

      const fromVendored = outcomeOf(() => ResponseBatch.decode(broken))
      let lite: ReturnType<typeof decodeResponseBatch> | null = null
      try {
        lite = decodeResponseBatch(broken)
      } catch {
        // counted below
      }

      if (lite === null) {
        if (fromVendored === 'returned') {
          regressions.push(`run ${run} (${kind}): lite threw where the library returned — ${hex(broken).slice(0, 90)}`)
        }
        continue
      }

      // A frame cut short must be REPORTED, since it cannot be rescued: a cut
      // at the end breaks every enclosing length prefix before it reaches a
      // message, so nothing is recovered in either codec (measured: 0 of 235
      // cuts of a five-message frame). An earlier version asserted a "prefix"
      // property here instead — and passed only because the prefix it checked
      // was always empty.
      if (kind === 'truncate' && broken.length > 0 && !lite.damaged) {
        unreportedCuts.push(`run ${run}: a frame cut to ${broken.length} of ${good.length} bytes was not reported as damaged`)
      }

      // Bytes appended after a sound frame leave the frame itself intact, so
      // its first response must decode exactly as it did before. The garbage
      // may add or break things AFTER it; it may not change what came first.
      if (kind === 'append') {
        const before = shapeBatch(decodeResponseBatch(good))[0]
        const after = shapeBatch(lite)[0]
        if (JSON.stringify(after) !== JSON.stringify(before)) {
          appendViolations.push(`run ${run}: the intact response changed when bytes were appended after it`)
        }
      }
    }

    expect(regressions, regressions.slice(0, 5).join('\n')).toHaveLength(0)
    expect(unreportedCuts, unreportedCuts.slice(0, 5).join('\n')).toHaveLength(0)
    expect(appendViolations, appendViolations.slice(0, 5).join('\n')).toHaveLength(0)

    // Each kind of damage present in real numbers, or a section of the corpus
    // has quietly stopped existing. The previous version asserted only that
    // the tolerant direction was non-zero, which one damaged frame in two
    // thousand would have satisfied.
    for (const [kind, count] of Object.entries(kinds)) {
      expect(count, `${kind} damage`).toBeGreaterThan(RUNS / 8)
    }
  }, SLOW)

  it('reports damage, and does not report it on a sound frame', () => {
    // The tolerant decode removed the only sign a frame was broken; `damaged`
    // is what puts it back, and what `extractProtobufMessages` logs.
    const good = ResponseBatch.encode(ResponseBatch.create({
      responses: [{ outgoingMessages: { messages: [{ id: Uint8Array.from([1]), body: '{}', expiry: 0, created: 0 }] } }]
    })).finish()

    expect(decodeResponseBatch(good).damaged).toBe(false)
    expect(decodeResponseBatch(good.slice(0, good.length - 2)).damaged).toBe(true)
  })

  it('survives the degenerate frames a fuzzer rarely reaches', () => {
    const cases: [string, Uint8Array][] = [
      ['empty', Uint8Array.from([])],
      ['a tag and nothing else', Uint8Array.from([0x0A])],
      ['a length that overruns the buffer', Uint8Array.from([0x0A, 0x7F, 0x01])],
      ['a varint with no terminator', Uint8Array.from([0x0A, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF])],
      ['an unknown field at the top level', Uint8Array.from([0x7A, 0x01, 0x00])],
      ['a fixed64 where the schema has none', Uint8Array.from([0x09, 1, 2, 3, 4, 5, 6, 7, 8])],
      ['a group start, which protobuf removed', Uint8Array.from([0x0B, 0x0C])],
      ['field number zero, which is illegal', Uint8Array.from([0x00, 0x01])]
    ]

    for (const [name, frame] of cases) {
      if (outcomeOf(() => ResponseBatch.decode(frame)) === 'returned') {
        expect(outcomeOf(() => decodeResponseBatch(frame)), name).toBe('returned')
      }
    }
  })
})
