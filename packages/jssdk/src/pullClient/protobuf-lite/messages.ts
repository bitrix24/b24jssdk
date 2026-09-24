/**
 * The four structures the Pull client sends and the four it receives.
 *
 * Field numbers come from the box's descriptors, restored into
 * `.github/contributing/pull-protobuf.md`. Two of them are easy to get wrong
 * and are called out where they are used:
 *
 *  - **`OutgoingMessage` is not `IncomingMessage`.** The client SENDS
 *    `IncomingMessage` (receivers, sender, body, expiry, type) and RECEIVES
 *    `OutgoingMessage` (id, body, expiry, created, sender) — different layout,
 *    `sender` at a different number. The vendored library hid this because it
 *    resolved the type through the schema; here it has to be written out.
 *  - **`created` is `fixed32`**, the only one in the schema. Read as four
 *    little-endian bytes, not as a varint.
 */
import { Reader, Writer, WireError, tag, WIRE_BYTES, WIRE_FIXED32, WIRE_VARINT } from './wire'

export interface LiteReceiver { id?: Uint8Array, isPrivate?: boolean, signature?: Uint8Array }
export interface LiteSender { type?: number, id?: Uint8Array }
export interface LiteIncomingMessage {
  receivers?: LiteReceiver[]
  sender?: LiteSender
  body?: string
  expiry?: number
  type?: string
}
export interface LiteOutgoingMessage {
  id?: Uint8Array
  body?: string
  expiry?: number
  created?: number
  sender?: LiteSender
}
/**
 * What `decodeResponseBatch` returns.
 *
 * `damaged` is not decoration. A frame whose tail could not be read is now
 * decoded as far as it goes rather than rejected, which keeps the messages
 * that parsed — and removed the only signal a caller had that the frame was
 * broken at all. This puts it back: the caller logs it, and a push server or
 * proxy cutting frames short stays visible.
 */
export interface LiteResponseBatch {
  responses: LiteResponse[]
  /** True when any level stopped early on a tail it could not read. */
  damaged: boolean
}

export interface LiteResponse {
  /** The `oneof` discriminator the client switches on. */
  command?: 'outgoingMessages' | 'channelStats' | 'serverStats'
  outgoingMessages?: { messages: LiteOutgoingMessage[] }
}

// region encode ////

/**
 * Written only if the value is the object's OWN, and not null.
 *
 * This is protobuf.js's own rule (`message.f != null && hasOwnProperty(message, 'f')`),
 * and copying it is load-bearing rather than pedantic: `client.ts` builds
 * `Receiver.create(...)` / `IncomingMessage.create(...)` instances, and those
 * carry `isPrivate = false` and `type = ''` on the PROTOTYPE as defaults. A
 * plain `!== undefined` check sees them and writes two fields the library
 * omits. The differential test missed it, because it passes plain objects; the
 * switch test caught it.
 */
function has<T extends object, K extends keyof T>(source: T, key: K): boolean {
  return Object.hasOwn(source, key) && source[key] !== null && source[key] !== undefined
}

function writeReceiver(receiver: LiteReceiver): Uint8Array {
  const w = new Writer()
  if (has(receiver, 'id')) {
    w.varint(tag(1, WIRE_BYTES)).bytes(receiver.id!)
  }
  if (has(receiver, 'isPrivate')) {
    w.varint(tag(2, WIRE_VARINT)).varint(receiver.isPrivate ? 1 : 0)
  }
  if (has(receiver, 'signature')) {
    w.varint(tag(3, WIRE_BYTES)).bytes(receiver.signature!)
  }

  return w.finish()
}

function writeSender(sender: LiteSender): Uint8Array {
  const w = new Writer()
  if (has(sender, 'type')) {
    w.varint(tag(1, WIRE_VARINT)).varint(sender.type!)
  }
  if (has(sender, 'id')) {
    w.varint(tag(2, WIRE_BYTES)).bytes(sender.id!)
  }

  return w.finish()
}

function writeIncomingMessage(message: LiteIncomingMessage): Uint8Array {
  const w = new Writer()
  for (const receiver of message.receivers ?? []) {
    w.varint(tag(1, WIRE_BYTES)).bytes(writeReceiver(receiver))
  }
  if (has(message, 'sender')) {
    w.varint(tag(2, WIRE_BYTES)).bytes(writeSender(message.sender!))
  }
  if (has(message, 'body')) {
    w.varint(tag(3, WIRE_BYTES)).string(message.body!)
  }
  if (has(message, 'expiry')) {
    w.varint(tag(4, WIRE_VARINT)).varint(message.expiry!)
  }
  if (has(message, 'type')) {
    w.varint(tag(5, WIRE_BYTES)).string(message.type!)
  }

  return w.finish()
}

/**
 * `RequestBatch { requests: [ Request { incomingMessages: { messages } } ] }`,
 * the only shape the client ever sends.
 */
export function encodeRequestBatch(messages: LiteIncomingMessage[]): Uint8Array {
  const messagesRequest = new Writer()
  for (const message of messages) {
    messagesRequest.varint(tag(1, WIRE_BYTES)).bytes(writeIncomingMessage(message))
  }

  const request = new Writer()
  request.varint(tag(1, WIRE_BYTES)).bytes(messagesRequest.finish())

  const batch = new Writer()
  batch.varint(tag(1, WIRE_BYTES)).bytes(request.finish())

  return batch.finish()
}

// endregion ////

// region decode ////

/**
 * Walk the fields of one message, and stop at a tail that cannot be read.
 *
 * A message whose OWN length prefix is intact but whose contents are damaged —
 * a nested `sender` whose length overruns, a field that ends mid-varint — used
 * to throw from inside it. Because the `catch` in `extractProtobufMessages`
 * wraps the whole decode, that one bad message dropped every message in the
 * batch, including its sound neighbours. protobuf.js copes with several of
 * these; a fuzz differential against it found six in four hundred where this
 * codec threw and the library did not.
 *
 * So a malformed tail now ends THIS message instead of the batch, keeping what
 * was read. Be precise about the reach of that: it rescues damage confined to
 * one message. A frame cut short at the END is not rescued — the cut breaks
 * every enclosing length prefix before reaching any message, so the top level
 * stops first and nothing is recovered, in either codec. Clamping an overrun to
 * the bytes that remain would recover it, and was rejected: an inflated prefix
 * mid-frame would then read the next message's bytes as this one's `id` and
 * deliver a message under a wrong id, breaking de-duplication and `mack`.
 *
 * Only a `WireError` is caught. Anything else — a bug in a field handler, say —
 * propagates, so this cannot turn a defect into a silent truncation. And the
 * damage is reported through `flag`, so it is not silent either.
 */
function readFields(
  view: Uint8Array,
  flag: DamageFlag,
  onField: (field: number, wireType: number, r: Reader) => void
): void {
  const r = new Reader(view)
  while (!r.done) {
    try {
      const key = r.varint()
      onField(key >>> 3, key & 7, r)
    } catch (error) {
      if (!(error instanceof WireError)) {
        throw error
      }
      flag.damaged = true
      return
    }
  }
}

/** Shared by every level of one decode, so a nested truncation surfaces at the top. */
interface DamageFlag { damaged: boolean }

function readSender(view: Uint8Array, flag: DamageFlag): LiteSender {
  // Defaults, not `{}`. protobuf.js hands the caller a message whose unset
  // fields carry the schema's defaults; leaving them `undefined` here is what
  // made a frame without `id` throw inside `decodeId` and take the whole batch
  // with it (the catch in `extractProtobufMessages` is around the loop, not
  // around one message).
  const sender: LiteSender = { type: 0, id: new Uint8Array(0) }
  readFields(view, flag, (field, wireType, r) => {
    if (field === 1 && wireType === WIRE_VARINT) {
      sender.type = r.uint32()
    } else if (field === 2 && wireType === WIRE_BYTES) {
      sender.id = r.bytes()
    } else {
      r.skip(wireType)
    }
  })

  return sender
}

function readOutgoingMessage(view: Uint8Array, flag: DamageFlag): LiteOutgoingMessage {
  // See `readSender`: these are protobuf.js's defaults for the field types —
  // `bytes` empty, `string` empty, numbers zero. `sender` stays absent, as the
  // library leaves an unset message field null.
  const message: LiteOutgoingMessage = {
    id: new Uint8Array(0),
    body: '',
    expiry: 0,
    created: 0
  }
  readFields(view, flag, (field, wireType, r) => {
    if (field === 1 && wireType === WIRE_BYTES) {
      message.id = r.bytes()
    } else if (field === 2 && wireType === WIRE_BYTES) {
      message.body = r.string()
    } else if (field === 3 && wireType === WIRE_VARINT) {
      // `uint32`, masked the way the library masks it: a wire value of 2^32
      // reads back as 0 there and would read as 4294967296 here.
      message.expiry = r.uint32()
    } else if (field === 4 && wireType === WIRE_FIXED32) {
      // The schema's only fixed32.
      message.created = r.fixed32()
    } else if (field === 5 && wireType === WIRE_BYTES) {
      message.sender = readSender(r.bytes(), flag)
    } else {
      r.skip(wireType)
    }
  })

  return message
}

function readOutgoingMessagesResponse(view: Uint8Array, flag: DamageFlag): { messages: LiteOutgoingMessage[] } {
  const messages: LiteOutgoingMessage[] = []
  readFields(view, flag, (field, wireType, r) => {
    if (field === 1 && wireType === WIRE_BYTES) {
      messages.push(readOutgoingMessage(r.bytes(), flag))
    } else {
      r.skip(wireType)
    }
  })

  return { messages }
}

function readResponse(view: Uint8Array, flag: DamageFlag): LiteResponse {
  const response: LiteResponse = {}
  readFields(view, flag, (field, wireType, r) => {
    if (field === 1 && wireType === WIRE_BYTES) {
      response.outgoingMessages = readOutgoingMessagesResponse(r.bytes(), flag)
      response.command = 'outgoingMessages'
    } else if (field === 2 && wireType === WIRE_BYTES) {
      // Statistics. The client skips these by command name, so the payload is
      // not modelled — only the discriminator has to be right, because reading
      // it as `outgoingMessages` would hand the client a message list it never
      // received. `oneof` is last-one-wins on the wire, hence the overwrite.
      r.bytes()
      response.command = 'channelStats'
    } else if (field === 3 && wireType === WIRE_BYTES) {
      r.bytes()
      response.command = 'serverStats'
    } else {
      r.skip(wireType)
    }
  })

  return response
}

export function decodeResponseBatch(view: Uint8Array): LiteResponseBatch {
  const flag: DamageFlag = { damaged: false }
  const responses: LiteResponse[] = []
  readFields(view, flag, (field, wireType, r) => {
    if (field === 1 && wireType === WIRE_BYTES) {
      responses.push(readResponse(r.bytes(), flag))
    } else {
      r.skip(wireType)
    }
  })

  return { responses, damaged: flag.damaged }
}

// endregion ////
