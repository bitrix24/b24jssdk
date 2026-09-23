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
import { Reader, Writer, tag, WIRE_BYTES, WIRE_FIXED32, WIRE_VARINT } from './wire'

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
 * Protobuf is a stream of self-describing fields, so a frame damaged partway
 * through still has a valid prefix. protobuf.js delivers that prefix; this
 * codec used to throw the moment a length prefix overran or a varint ran out
 * of bytes — and because the `catch` in `extractProtobufMessages` wraps the
 * whole decode, ONE bad tail anywhere dropped every message in the batch,
 * including the ones that had already parsed cleanly. A fuzz differential
 * against the library found six such frames in four hundred.
 *
 * So a malformed tail ends the loop instead of ending the batch. What has been
 * read is kept, the cursor is rolled back to the start of the field that could
 * not be read, and nothing further is attempted at this level.
 *
 * This is deliberately NOT a general "ignore errors": it cannot hide a defect
 * on a well-formed frame, because a well-formed frame never reaches the catch,
 * and the byte-for-byte differential on well-formed input is what guards that.
 */
function readFields(view: Uint8Array, onField: (field: number, wireType: number, r: Reader) => void): void {
  const r = new Reader(view)
  while (!r.done) {
    const fieldStart = r.position
    try {
      const key = r.varint()
      onField(key >>> 3, key & 7, r)
    } catch {
      r.position = fieldStart
      return
    }
  }
}

function readSender(view: Uint8Array): LiteSender {
  // Defaults, not `{}`. protobuf.js hands the caller a message whose unset
  // fields carry the schema's defaults; leaving them `undefined` here is what
  // made a frame without `id` throw inside `decodeId` and take the whole batch
  // with it (the catch in `extractProtobufMessages` is around the loop, not
  // around one message).
  const sender: LiteSender = { type: 0, id: new Uint8Array(0) }
  readFields(view, (field, wireType, r) => {
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

function readOutgoingMessage(view: Uint8Array): LiteOutgoingMessage {
  // See `readSender`: these are protobuf.js's defaults for the field types —
  // `bytes` empty, `string` empty, numbers zero. `sender` stays absent, as the
  // library leaves an unset message field null.
  const message: LiteOutgoingMessage = {
    id: new Uint8Array(0),
    body: '',
    expiry: 0,
    created: 0
  }
  readFields(view, (field, wireType, r) => {
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
      message.sender = readSender(r.bytes())
    } else {
      r.skip(wireType)
    }
  })

  return message
}

function readOutgoingMessagesResponse(view: Uint8Array): { messages: LiteOutgoingMessage[] } {
  const messages: LiteOutgoingMessage[] = []
  readFields(view, (field, wireType, r) => {
    if (field === 1 && wireType === WIRE_BYTES) {
      messages.push(readOutgoingMessage(r.bytes()))
    } else {
      r.skip(wireType)
    }
  })

  return { messages }
}

function readResponse(view: Uint8Array): LiteResponse {
  const response: LiteResponse = {}
  readFields(view, (field, wireType, r) => {
    if (field === 1 && wireType === WIRE_BYTES) {
      response.outgoingMessages = readOutgoingMessagesResponse(r.bytes())
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

export function decodeResponseBatch(view: Uint8Array): { responses: LiteResponse[] } {
  const responses: LiteResponse[] = []
  readFields(view, (field, wireType, r) => {
    if (field === 1 && wireType === WIRE_BYTES) {
      responses.push(readResponse(r.bytes()))
    } else {
      r.skip(wireType)
    }
  })

  return { responses }
}

// endregion ////
