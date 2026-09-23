/**
 * The differential, driven by a generator instead of by hand.
 *
 * `protobuf-lite-differential.unit.spec.ts` is the same comparison on inputs
 * somebody wrote down. That is a sample, and #559 makes the point that the
 * boundaries most likely to diverge are exactly the ones nobody thinks to
 * write down. This file generates them.
 *
 * `*.unit.spec.ts` (testing.md's exception): the oracle is the vendored
 * library, not a portal, so it runs in CI where the live suites cannot.
 *
 * Three risks, three sections, in the order `.github/contributing/pull-protobuf.md`
 * numbers them:
 *
 *  - **R2 encode** — the bytes the lite codec produces must equal the bytes
 *    protobuf.js produces, for everything `client.ts` can build.
 *  - **R2 decode** — what the lite codec reads out of library-produced bytes
 *    must equal what the library reads out of them.
 *  - **R3** — on MALFORMED input, the lite codec must never throw where the
 *    library returns. The property is ASYMMETRIC on purpose, and working out
 *    why was most of the value of writing this file.
 *
 *    `extractProtobufMessages` catches around the whole decode, so a throw
 *    does not lose one message, it loses the batch — including the messages
 *    that had already parsed cleanly. Being MORE tolerant than the library
 *    therefore delivers a valid prefix where the library delivers nothing,
 *    which is an improvement and not a defect. Being LESS tolerant is the
 *    regression, and it is the one `readSender` shipped: it threw inside
 *    `decodeId` on a frame the library read without complaint.
 *
 *    Requiring identical outcomes would mean reimplementing protobuf.js's
 *    error model byte for byte, which buys the client nothing. The test
 *    reports the tolerant direction as a count so a swing in it is visible,
 *    and fails only on the direction that costs messages.
 *
 * The seed is fixed. A fuzz test that finds a new failure on every CI run is
 * not a gate, it is a lottery — and a failure nobody can reproduce is not a
 * bug report. To widen the search, raise `RUNS` or change `SEED` deliberately
 * and commit the value that found something.
 */
import { describe, it, expect } from 'vitest'
import { IncomingMessage, Receiver, RequestBatch, ResponseBatch } from '../../../packages/jssdk/src/pullClient/protobuf'
import { decodeResponseBatch, encodeRequestBatch } from '../../../packages/jssdk/src/pullClient/protobuf-lite/messages'
import type { LiteIncomingMessage } from '../../../packages/jssdk/src/pullClient/protobuf-lite/messages'

const SEED = 0x5EED_1234
const RUNS = 2000

const hex = (view: Uint8Array) => [...view].map(b => b.toString(16).padStart(2, '0')).join(' ')

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

/** Boundaries first, then a random value — the middle of a range finds nothing. */
function pickLength(random: () => number): number {
  const boundaries = [0, 1, 2, 127, 128, 129, 16_383, 16_384, 16_385]
  if (random() < 0.7) {
    return boundaries[Math.floor(random() * boundaries.length)]!
  }

  return Math.floor(random() * 300)
}

/** Where a varint changes width, and `uint32`'s own edge. */
function pickExpiry(random: () => number): number {
  const boundaries = [
    0, 1, 127, 128, 16_383, 16_384, 2_097_151, 2_097_152,
    268_435_455, 268_435_456, 4_294_967_295
  ]
  if (random() < 0.8) {
    return boundaries[Math.floor(random() * boundaries.length)]!
  }

  return Math.floor(random() * 100_000)
}

function randomBytes(random: () => number, length: number): Uint8Array {
  const view = new Uint8Array(length)
  for (let index = 0; index < length; index++) {
    view[index] = Math.floor(random() * 256)
  }

  return view
}

/**
 * Bodies that are awkward on purpose.
 *
 * The recorded portal fixture is ASCII throughout, so multi-byte UTF-8 has no
 * real-bytes coverage anywhere; and a lone surrogate is the one string JS will
 * hand an encoder that is not valid UTF-16, let alone UTF-8.
 */
function pickBody(random: () => number): string {
  const kind = random()
  const length = pickLength(random)
  if (kind < 0.35) {
    return 'x'.repeat(length)
  }
  if (kind < 0.55) {
    return 'ё'.repeat(Math.ceil(length / 2))
  }
  if (kind < 0.7) {
    return '🙂'.repeat(Math.ceil(length / 4))
  }
  if (kind < 0.8) {
    return JSON.stringify({ module_id: 'main', command: 'ping', params: { pad: 'p'.repeat(length) } })
  }
  if (kind < 0.9) {
    return '\u0000\u0001\u007F'
  }

  return String.fromCodePoint(...Array.from({ length: Math.min(length, 64) }, () => Math.floor(random() * 0x4E00) + 0x20))
}

function makeMessage(random: () => number): LiteIncomingMessage {
  const message: LiteIncomingMessage = {}

  const receiverCount = random() < 0.1 ? 0 : Math.floor(random() * 4) + 1
  if (receiverCount > 0 || random() < 0.5) {
    message.receivers = Array.from({ length: receiverCount }, () => {
      const receiver: Record<string, unknown> = {}
      if (random() < 0.95) {
        receiver.id = randomBytes(random, Math.min(pickLength(random), 64))
      }
      if (random() < 0.2) {
        receiver.isPrivate = random() < 0.5
      }
      if (random() < 0.9) {
        receiver.signature = randomBytes(random, Math.min(pickLength(random), 64))
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
    message.type = random() < 0.5 ? '' : pickBody(random).slice(0, 32)
  }
  if (random() < 0.25) {
    message.sender = {
      ...(random() < 0.9 ? { type: Math.floor(random() * 3) } : {}),
      ...(random() < 0.7 ? { id: randomBytes(random, Math.min(pickLength(random), 32)) } : {})
    }
  }

  return message
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

/** What either codec hands the client, normalised so the two are comparable. */
function shapeBatch(batch: unknown) {
  const responses = (batch as { responses?: Array<Record<string, any>> }).responses ?? []

  return responses.map(response => ({
    // `undefined` and absent must not be smoothed together: proto2 presence is
    // the property a proto2 codec gets wrong.
    outgoing: response.outgoingMessages === undefined || response.outgoingMessages === null
      ? null
      : (response.outgoingMessages.messages ?? []).map((message: Record<string, any>) => ({
          id: message.id === undefined || message.id === null ? null : [...message.id],
          body: message.body,
          expiry: message.expiry,
          created: message.created,
          senderType: message.sender === undefined || message.sender === null ? null : message.sender.type
        }))
  }))
}

/** Outcome, not value: this is what R3 compares. */
function outcomeOf(run: () => unknown): 'threw' | 'returned' {
  try {
    run()

    return 'returned'
  } catch {
    return 'threw'
  }
}

describe('pull protobuf-lite — R2, encode agrees with the library', () => {
  it(`produces identical bytes across ${RUNS} generated batches (seed ${SEED})`, () => {
    const random = makeRandom(SEED)
    let compared = 0

    for (let run = 0; run < RUNS; run++) {
      const messages = Array.from(
        { length: random() < 0.15 ? 0 : Math.floor(random() * 3) + 1 },
        () => makeMessage(random)
      )

      const fromLite = encodeRequestBatch(messages)
      const fromVendored = encodeWithVendored(messages)

      expect(hex(fromLite), `run ${run}: ${JSON.stringify(messages, (_key, value) =>
        value instanceof Uint8Array ? `bytes(${value.length})` : value)}`)
        .toBe(hex(fromVendored))
      compared++
    }

    // A generator that silently produced nothing would pass every assertion
    // above by never making one.
    expect(compared).toBe(RUNS)
  })

  it('covers the boundaries it claims to, not just their neighbourhood', () => {
    // The generator is weighted, not guaranteed. If a refactor drops the
    // boundary list this suite would still pass while testing only the middle,
    // which is the failure mode of every fuzz test that is not checked.
    const random = makeRandom(SEED)
    const bodyLengths = new Set<number>()
    const expiries = new Set<number>()

    for (let run = 0; run < RUNS; run++) {
      const message = makeMessage(random)
      if (message.body !== undefined) {
        bodyLengths.add(new TextEncoder().encode(message.body).length)
      }
      if (message.expiry !== undefined) {
        expiries.add(message.expiry)
      }
    }

    // Where the length prefix grows from one byte to two, and two to three.
    expect([...bodyLengths].some(length => length >= 128), 'a body past a one-byte prefix').toBe(true)
    expect([...bodyLengths].some(length => length >= 16_384), 'a body past a two-byte prefix').toBe(true)
    expect(bodyLengths.has(0), 'an empty body').toBe(true)
    expect(expiries.has(0), 'expiry 0').toBe(true)
    expect([...expiries].some(value => value > 2_097_151), 'expiry past three varint bytes').toBe(true)
  })
})

describe('pull protobuf-lite — R2, decode agrees with the library', () => {
  it(`reads library-produced frames identically across ${RUNS} runs (seed ${SEED})`, () => {
    const random = makeRandom(SEED ^ 0x1111)
    let compared = 0

    for (let run = 0; run < RUNS; run++) {
      // Build a RESPONSE, which is the direction the client actually decodes,
      // and which the encode section above cannot reach at all.
      const messages = Array.from({ length: Math.floor(random() * 3) + 1 }, () => ({
        id: randomBytes(random, Math.min(pickLength(random), 32)),
        body: pickBody(random),
        expiry: pickExpiry(random),
        created: Math.floor(random() * 4_294_967_295),
        ...(random() < 0.5 ? { sender: { type: Math.floor(random() * 3) } } : {})
      }))

      const frame = ResponseBatch.encode(ResponseBatch.create({
        responses: [{ outgoingMessages: { messages } }]
      })).finish()

      expect(shapeBatch(decodeResponseBatch(frame)), `run ${run}`)
        .toStrictEqual(shapeBatch(ResponseBatch.decode(frame)))
      compared++
    }

    expect(compared).toBe(RUNS)
  })

  it('agrees on the oneof discriminator, whichever branch the server sent', () => {
    // Reading a statistics response as a message list would hand the client
    // messages it never received, and the recorded fixture has never contained
    // one — so this branch has no real-bytes coverage anywhere else.
    for (const build of [
      () => ResponseBatch.create({ responses: [{ channelStats: {} }] }),
      () => ResponseBatch.create({ responses: [{ serverStats: {} }] }),
      () => ResponseBatch.create({ responses: [{ outgoingMessages: { messages: [] } }] })
    ]) {
      const frame = ResponseBatch.encode(build()).finish()
      expect(shapeBatch(decodeResponseBatch(frame))).toStrictEqual(shapeBatch(ResponseBatch.decode(frame)))
    }
  })
})

describe('pull protobuf-lite — R4, the divergences that are deliberate', () => {
  // Pinned rather than smoothed away, like `Sender.id` in the differential
  // suite: the moment one of these stops being true, in either direction,
  // somebody has changed something they should be told about. They are kept
  // OUT of the generator above so a known difference cannot drown a new one.
  it('writes a lone surrogate as U+FFFD where the library writes WTF-8', () => {
    // `TextEncoder` substitutes; protobuf.js emits the unpaired code point as
    // three bytes of WTF-8, which is not valid UTF-8 and which a server doing
    // `JSON.parse` on the body has no reason to accept. Both are three bytes,
    // so no length prefix shifts and nothing downstream desynchronises.
    //
    // Unreachable from `client.ts`: the only strings it encodes are
    // `JSON.stringify` output, and that has escaped lone surrogates since
    // ES2019. The lite behaviour is the safer of the two, which is why this is
    // recorded as accepted rather than fixed.
    const messages = [{ receivers: [{ id: Uint8Array.from([1]) }], body: 'a\uD83Db' }]
    const fromLite = hex(encodeRequestBatch(messages))
    const fromVendored = hex(encodeWithVendored(messages))

    expect(fromLite).toContain('ef bf bd')
    expect(fromVendored).toContain('ed a0 bd')
    expect(fromLite).not.toBe(fromVendored)
    expect(encodeRequestBatch(messages).length).toBe(encodeWithVendored(messages).length)
  })

  it('reads WTF-8 back as replacement characters, where the library restores the surrogate', () => {
    // The decode half of the same difference. It only arises for bytes the
    // library itself produced, since a lone surrogate cannot survive
    // `JSON.stringify` and a correct server never emits WTF-8.
    const frame = ResponseBatch.encode(ResponseBatch.create({
      responses: [{ outgoingMessages: { messages: [{ id: Uint8Array.from([1]), body: 'a\uD83Db', expiry: 0, created: 0 }] } }] }
    )).finish()

    const fromLite = (decodeResponseBatch(frame).responses[0]!.outgoingMessages!.messages[0]!.body)
    const fromVendored = (ResponseBatch.decode(frame) as unknown as {
      responses: Array<Record<string, any>>
    }).responses[0]!.outgoingMessages.messages[0].body

    expect(fromLite).toBe('a\uFFFD\uFFFD\uFFFDb')
    expect(fromVendored).toBe('a\uD83Db')
  })
})

describe('pull protobuf-lite — R3, it is never less tolerant than the library', () => {
  it(`ends the same way on ${RUNS} malformed frames (seed ${SEED})`, () => {
    const random = makeRandom(SEED ^ 0x2222)
    const regressions: string[] = []
    let moreTolerant = 0

    for (let run = 0; run < RUNS; run++) {
      const messages = Array.from({ length: Math.floor(random() * 2) + 1 }, () => ({
        id: randomBytes(random, 8),
        body: pickBody(random).slice(0, 64),
        expiry: pickExpiry(random),
        created: Math.floor(random() * 4_294_967_295)
      }))
      const good = ResponseBatch.encode(ResponseBatch.create({
        responses: [{ outgoingMessages: { messages } }]
      })).finish()

      const broken = damage(good, random)

      const fromLite = outcomeOf(() => decodeResponseBatch(broken))
      const fromVendored = outcomeOf(() => ResponseBatch.decode(broken))

      if (fromLite === 'threw' && fromVendored === 'returned') {
        regressions.push(`run ${run}: lite threw where the library returned — ${hex(broken).slice(0, 120)}`)
      } else if (fromLite === 'returned' && fromVendored === 'threw') {
        moreTolerant++
      }
    }

    // Reported together rather than on the first one: a single failing case
    // says nothing about whether the divergence is systematic, and that is the
    // question worth answering.
    expect(regressions, regressions.slice(0, 5).join('\n')).toHaveLength(0)

    // Not an assertion about the number, which will move with the seed — an
    // assertion that the malformed corpus is actually malformed. A generator
    // producing well-formed frames would leave this at zero and the case above
    // would pass while testing nothing.
    expect(moreTolerant, 'the damaged frames must actually damage something').toBeGreaterThan(0)
  })

  it('survives the degenerate frames a fuzzer rarely reaches', () => {
    // These are cheap, specific, and each one has a story: an empty buffer, a
    // lone tag with no payload, a length prefix that overruns, a varint that
    // never terminates, and a field of every wire type the schema never uses.
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
      // Same asymmetry: the library throwing is fine, the lite codec throwing
      // where the library copes is not.
      if (outcomeOf(() => ResponseBatch.decode(frame)) === 'returned') {
        expect(outcomeOf(() => decodeResponseBatch(frame)), name).toBe('returned')
      }
    }
  })
})

/** One mutation, chosen to be the kind a real wire fault produces. */
function damage(frame: Uint8Array, random: () => number): Uint8Array {
  const copy = Uint8Array.from(frame)
  const kind = random()

  if (kind < 0.3 && copy.length > 1) {
    // Truncation, at a boundary as often as in the middle.
    return copy.slice(0, Math.floor(random() * copy.length))
  }
  if (kind < 0.6 && copy.length > 0) {
    // A flipped byte, which is what a length prefix or a tag going wrong
    // actually looks like.
    const index = Math.floor(random() * copy.length)
    copy[index] = (copy[index]! ^ (1 << Math.floor(random() * 8))) & 0xFF

    return copy
  }
  if (kind < 0.8 && copy.length > 0) {
    // A length prefix inflated past the end of the buffer.
    const index = Math.floor(random() * copy.length)
    copy[index] = 0x7F

    return copy
  }

  // Trailing garbage, which a decoder must not read as a field.
  return Uint8Array.from([...copy, ...randomBytes(random, Math.floor(random() * 8) + 1)])
}
