/**
 * What the CLIENT does with a damaged frame, as opposed to what the codec does.
 *
 * `*.unit.spec.ts` (testing.md's exception): hand-built frames and a private
 * method, nothing to reach a portal for.
 *
 * The lite codec now decodes a damaged frame as far as it goes instead of
 * rejecting it (#559). Two things had to follow in `extractProtobufMessages`,
 * and the fuzz differential cannot see either because it never reaches the
 * client:
 *
 *  - the damage must still be LOGGED. The tolerant decode removed the only sign
 *    a frame was broken; a push server or proxy cutting frames short would
 *    otherwise have become invisible;
 *  - a message whose `sender` was cut off must not take the rest of the batch
 *    with it — that, damage confined inside one message, is the case the
 *    tolerant decode actually rescues; a frame cut short at the END is not,
 *    and the last case below says why. The client read `message.sender.type` inside the batch-wide
 *    `try`, so one missing sender dropped every message after it — the exact
 *    loss the tolerant decode exists to prevent, one layer further up.
 */
import { describe, it, expect } from 'vitest'
import { JsonRpc } from '../../../packages/jssdk/src/pullClient/json-rpc'
import { PullClient } from '../../../packages/jssdk/src/pullClient/client'
import { SenderType } from '../../../packages/jssdk/src/types/pull'
import type { TypePullClientParams } from '../../../packages/jssdk/src/types/pull'

type Logged = { level: string, message: string, context: unknown, args: unknown[] }

function build(logged: Logged[], protobufCodec: 'lite' | 'vendored' = 'lite') {
  // Records EVERY argument. An earlier version kept only the first two, so a
  // frame passed as a third argument would have leaked into the log unseen.
  const logger = new Proxy({}, {
    get: (_target, level: string) => (...args: unknown[]) => {
      logged.push({ level, message: String(args[0]), context: args[1], args })
      return Promise.resolve()
    }
  })
  const b24 = { getLogger: () => logger } as unknown as TypePullClientParams['b24']
  const client = new PullClient({ b24, userId: 1, skipStorageInit: true, protobufCodec })
  client.setLogger(logger as never)

  return client
}

function extract(client: PullClient, frame: Uint8Array) {
  return (client as unknown as {
    extractProtobufMessages: (event: ArrayBuffer) => Array<{ mid: string, text: Record<string, any> }>
  }).extractProtobufMessages(frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength) as ArrayBuffer)
}

const utf8 = new TextEncoder()

/** A varint, so a nested list longer than 127 bytes still gets a correct length prefix. */
function varint(value: number): number[] {
  const out: number[] = []
  let rest = value
  while (rest > 0x7F) {
    out.push((rest & 0x7F) | 0x80)
    rest >>>= 7
  }
  out.push(rest)

  return out
}

/** A length-delimited field: tag, length, payload. */
function field(fieldNumber: number, payload: Uint8Array): number[] {
  return [(fieldNumber << 3) | 2, ...varint(payload.length), ...payload]
}

/**
 * An OutgoingMessage: id (1), body (2), a backend `sender` (5) as a real push
 * server always sends, and optionally raw trailing bytes — used to plant a
 * damaged sender after the good fields.
 */
function outgoing(id: number, command: string, trailing: number[] = [], withSender = true): Uint8Array {
  const body = utf8.encode(JSON.stringify({ module_id: 'main', command, params: {} }))
  // Sender { type = Backend (2) }
  const sender = withSender && trailing.length === 0 ? field(5, Uint8Array.from([0x08, SenderType.Backend])) : []

  return Uint8Array.from([
    ...field(1, Uint8Array.from([id])),
    ...field(2, body),
    ...sender,
    ...trailing
  ])
}

/** An OutgoingMessage whose body is the given raw text, with a backend sender. */
function outgoingRaw(id: number, body: string): Uint8Array {
  return Uint8Array.from([
    ...field(1, Uint8Array.from([id])),
    ...field(2, utf8.encode(body)),
    ...field(5, Uint8Array.from([0x08, SenderType.Backend]))
  ])
}

/** ResponseBatch { responses: [ Response { outgoingMessages: { messages } } ] } */
function batchOf(messages: Uint8Array[]): Uint8Array {
  const list = Uint8Array.from(messages.flatMap(message => field(1, message)))
  const response = Uint8Array.from(field(1, list))

  return Uint8Array.from(field(1, response))
}

describe('pull: the client on a damaged frame', () => {
  it('keeps the messages around one whose sender was cut off, and drops that one', () => {
    // The middle message carries a `sender` (field 5) whose length prefix
    // claims 127 bytes and supplies none. The codec stops reading THAT message
    // and leaves `sender` unset; the other two are untouched.
    //
    // The middle one is DROPPED, not repaired. `sender.type` decides who a
    // message is for, and inventing one would route a client-published
    // message to server subscribers — or, as `module_id: 'pull'`, to the
    // internal command handler. An earlier version filled in `Unknown` and did
    // exactly that.
    const logged: Logged[] = []
    const frame = batchOf([
      outgoing(1, 'first'),
      outgoing(2, 'second', [(5 << 3) | 2, 0x7F]),
      outgoing(3, 'third')
    ])

    const events = extract(build(logged), frame)

    expect(events.map(event => event.text.command)).toEqual(['first', 'third'])
    for (const event of events) {
      expect(event.text.extra.sender.type).not.toBe(SenderType.Unknown)
    }
  })

  it('drops a message with no sender at all, rather than throwing away the batch', () => {
    // Well-formed, just sender-less. protobuf.js puts `sender = null` on the
    // prototype, so this threw inside the batch-wide `try` in BOTH codecs and
    // took every message after it. Real servers always send a sender; this
    // pins that one missing is contained to its own message.
    for (const codec of ['lite', 'vendored'] as const) {
      const logged: Logged[] = []
      const events = extract(build(logged, codec), batchOf([
        outgoing(1, 'first'),
        outgoing(2, 'no-sender', [], false),
        outgoing(3, 'third')
      ]))

      expect(events.map(event => event.text.command), codec).toEqual(['first', 'third'])

      // Not silently. That a real server always sends a sender is inferred,
      // not observed; if it is ever wrong for a system command, this warning
      // is the only trace a skipped CHANNEL_EXPIRE would leave.
      const skipped = logged.filter(entry => entry.message.includes('no sender'))
      expect(skipped, codec).toHaveLength(1)
      expect(skipped[0]!.args, codec).toEqual([skipped[0]!.message, { responseIndex: 0, moduleId: 'main' }])
    }
  })

  it('delivers a sender whose type is 0, which is well-formed and not missing', () => {
    // `SenderType.Unknown` is 0, and so is an empty `sender {}`. Both are
    // well-formed and were always delivered. The guard tests for an ABSENT
    // sender; testing `!sender?.type` instead would have dropped these too.
    const logged: Logged[] = []
    const events = extract(build(logged), batchOf([
      outgoing(1, 'type-zero', [(5 << 3) | 2, 0x02, 0x08, 0x00]),
      outgoing(2, 'empty-sender', [(5 << 3) | 2, 0x00])
    ]))

    expect(events.map(event => event.text.command)).toEqual(['type-zero', 'empty-sender'])
    for (const event of events) {
      expect(event.text.extra.sender.type).toBe(SenderType.Unknown)
      // An empty id is still an id: `''`, not absent. A tidy-up testing the id's
      // length instead of its type would drop it.
      expect(event.text.extra.sender.id).toBe('')
    }
    expect(logged.filter(entry => entry.message.includes('no sender'))).toHaveLength(0)
  })

  it('skips a body that is JSON but not an object, and keeps the rest of the batch', () => {
    // #562. Every one of these parses; none is an object. Reading `.extra` off
    // `null`, or assigning it onto a primitive, threw inside the batch-wide
    // `try` and took the good message after it too. Now only the bad one goes,
    // on both codecs, and it is logged with its type — never its content.
    for (const codec of ['lite', 'vendored'] as const) {
      for (const [body, bodyType] of [['null', 'null'], ['5', 'number'], ['"x"', 'string'], ['true', 'boolean']] as const) {
        const logged: Logged[] = []
        const events = extract(build(logged, codec), batchOf([
          outgoing(1, 'first'),
          outgoingRaw(2, body),
          outgoing(3, 'third')
        ]))

        expect(events.map(event => event.text.command), `${codec} ${body}`).toEqual(['first', 'third'])
        const skipped = logged.filter(entry => entry.message.includes('not a JSON object'))
        expect(skipped, `${codec} ${body}`).toHaveLength(1)
        expect(skipped[0]!.args, `${codec} ${body}`).toEqual([skipped[0]!.message, { responseIndex: 0, bodyType }])
      }
    }
  })

  it('still delivers a body that is a JSON array, as it always has', () => {
    // Arrays are objects: `extra` is set on them and nothing throws. Not what
    // any real payload looks like, but the guard must not narrow what passed.
    const logged: Logged[] = []
    const events = extract(build(logged), batchOf([outgoingRaw(1, '[]')]))

    expect(events).toHaveLength(1)
    expect(logged.filter(entry => entry.message.includes('not a JSON object'))).toHaveLength(0)
  })

  it('replaces an `extra` that is not an object, and keeps the rest of the batch', () => {
    // #564. `extra.sender = …` onto a primitive threw inside the batch-wide
    // `try` and took the good message after it too. `extra` is now replaced.
    for (const codec of ['lite', 'vendored'] as const) {
      for (const extra of ['5', '"x"', 'true', 'null']) {
        const events = extract(build([], codec), batchOf([
          outgoing(1, 'first'),
          outgoingRaw(2, `{"command":"second","extra":${extra}}`),
          outgoing(3, 'third')
        ]))

        expect(events.map(event => event.text.command), `${codec} ${extra}`).toEqual(['first', 'second', 'third'])
        expect(events[1]!.text.extra.sender, `${codec} ${extra}`).toBeDefined()
      }
    }
  })

  it('keeps an `extra` that is an object', () => {
    // `server_time_unix` feeds the staleness check; the guard must not reset it.
    const events = extract(build([]), batchOf([outgoingRaw(1, '{"command":"a","extra":{"server_time_unix":7}}')]))
    expect(events[0]!.text.extra.server_time_unix).toBe(7)
  })

  it('logs that the frame was damaged, with its length and nothing from inside it', () => {
    const logged: Logged[] = []
    const frame = batchOf([
      outgoing(1, 'first'),
      outgoing(2, 'second', [(5 << 3) | 2, 0x7F])
    ])

    extract(build(logged), frame)

    const warning = logged.find(entry => entry.level === 'warning' && entry.message.includes('damaged'))
    expect(warning, 'a damaged frame must not pass silently').toBeDefined()
    // The frame may carry other applications' events, so only its size is
    // logged — never its content (#43). Checked across EVERY argument, since a
    // leak is a leak whichever position it is passed in.
    expect(warning!.args).toEqual([warning!.message, { byteLength: frame.byteLength }])
    // The text itself, since operators search for it. It starts with a date.
    expect(warning!.message).toMatch(/: Pull: a protobuf frame was damaged; whatever could not be read was dropped$/)
  })

  it('logs nothing of the kind for a sound frame', () => {
    const logged: Logged[] = []
    const events = extract(build(logged), batchOf([outgoing(1, 'only')]))

    expect(events).toHaveLength(1)
    expect(logged.filter(entry => entry.message.includes('damaged'))).toHaveLength(0)
  })

  it('recovers NOTHING from a frame cut short at the end, and says so', () => {
    // Pinned because it is the case people will assume is covered, and it is
    // not. A frame truncated at the end breaks every ENCLOSING length prefix —
    // the batch's, the response's, the list's — before it reaches a single
    // message, so the top level stops first and nothing is delivered. Measured:
    // 0 of 235 end-truncations of a five-message frame yielded any message, in
    // either codec. What the tolerant decode does rescue is damage confined to
    // ONE message whose own length prefix is intact, as in the first case.
    //
    // Clamping an overrunning length to the bytes that remain would recover
    // this case, and was rejected: an inflated prefix mid-frame would then read
    // the NEXT message's bytes as the current one's `id`, and deliver a message
    // under a wrong id. That breaks de-duplication and `mack`, which is worse
    // than losing it.
    const logged: Logged[] = []
    const frame = batchOf([outgoing(1, 'first'), outgoing(2, 'second')])

    const events = extract(build(logged), frame.slice(0, frame.length - 5))

    expect(events).toEqual([])
    expect(logged.some(entry => entry.message.includes('damaged')), 'lost, but not silently').toBe(true)
  })
})

describe('pull: the client on a JSON-RPC batch with a bad message', () => {
  // #564. `handleRpcIncomingMessage` runs inside the JSON-RPC batch loop with
  // no per-command catch: a throw lost every command after the bad one.
  function rpcBatch(bodies: unknown[], extraParams: Record<string, unknown> = {}): { commands: string[], logged: Logged[], delivered: any[] } {
    const logged: Logged[] = []
    const client = build(logged)
    const commands: string[] = []
    const delivered: any[] = []
    ;(client as any).broadcastMessage = (message: { command: string }) => {
      commands.push(message.command)
      delivered.push(message)
    }
    const frame = bodies.map((body, i) => ({
      jsonrpc: '2.0', method: 'incoming.message', id: i + 1,
      params: { mid: `m${i}`, sender: { type: 1 }, body, ...extraParams }
    }))
    // The adapter is created in `init()`; wire one the same way it does.
    const rpc = new JsonRpc({
      connector: { send: () => {} } as never,
      handlers: { 'incoming.message': (client as any).handleRpcIncomingMessage.bind(client) }
    })
    rpc.parseJsonRpcMessage(JSON.stringify(frame))
    return { commands, logged, delivered }
  }

  it('keeps an `extra` that is an object', () => {
    // `server_time_unix` feeds the staleness check; the guard must not reset it.
    const { delivered } = rpcBatch([{ command: 'a', extra: { server_time_unix: 7 } }])
    expect(delivered[0].extra.server_time_unix).toBe(7)
  })

  it('replaces an `extra` that is not an object, and keeps the rest of the batch', () => {
    for (const extra of [5, 'x', true, null]) {
      const { commands } = rpcBatch([{ command: 'first' }, { command: 'second', extra }, { command: 'third' }])
      expect(commands, String(extra)).toEqual(['first', 'second', 'third'])
    }
  })

  it('skips a body that is not an object, logs its type, and keeps the rest of the batch', () => {
    for (const [body, bodyType] of [[null, 'null'], [5, 'number'], ['x', 'string']] as const) {
      const { commands, logged } = rpcBatch([{ command: 'first' }, body, { command: 'third' }])
      expect(commands, String(body)).toEqual(['first', 'third'])
      const skipped = logged.filter(entry => entry.message.includes('rpc message body was not an object'))
      expect(skipped[0]?.args[1], String(body)).toEqual({ bodyType })
    }
  })

  it('merges user_params and dictionary into a non-object `params`, and keeps the rest of the batch', () => {
    // #566. A missing or null `params` threw and lost every later command; a
    // primitive one silently dropped the merged values.
    for (const key of ['user_params', 'dictionary']) {
      for (const params of [undefined, null, 5]) {
        const { commands, delivered } = rpcBatch(
          [{ command: 'first', params: {} }, { command: 'second', params }, { command: 'third', params: {} }],
          { [key]: { a: 1 } }
        )
        expect(commands, `${key} ${params}`).toEqual(['first', 'second', 'third'])
        expect(delivered[1].params, `${key} ${params}`).toEqual({ a: 1 })
      }
    }
  })

  it('leaves a primitive `params` untouched when there is nothing to merge', () => {
    const { delivered } = rpcBatch([{ command: 'a', params: 5 }])
    expect(delivered[0].params).toBe(5)
  })

  it('leaves an object `params` in place when merging into it', () => {
    const { delivered } = rpcBatch([{ command: 'a', params: { b: 2 } }], { user_params: { a: 1 } })
    expect(delivered[0].params).toEqual({ b: 2, a: 1 })
  })
})
