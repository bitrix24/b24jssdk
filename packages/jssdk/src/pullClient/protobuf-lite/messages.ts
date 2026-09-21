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

function readSender(view: Uint8Array): LiteSender {
  const r = new Reader(view)
  // Defaults, not `{}`. protobuf.js hands the caller a message whose unset
  // fields carry the schema's defaults; leaving them `undefined` here is what
  // made a frame without `id` throw inside `decodeId` and take the whole batch
  // with it (the catch in `extractProtobufMessages` is around the loop, not
  // around one message).
  const sender: LiteSender = { type: 0, id: new Uint8Array(0) }
  while (!r.done) {
    const key = r.varint()
    const field = key >>> 3
    const wireType = key & 7
    if (field === 1 && wireType === WIRE_VARINT) {
      sender.type = r.uint32()
    } else if (field === 2 && wireType === WIRE_BYTES) {
      sender.id = r.bytes()
    } else {
      r.skip(wireType)
    }
  }

  return sender
}

function readOutgoingMessage(view: Uint8Array): LiteOutgoingMessage {
  const r = new Reader(view)
  // See `readSender`: these are protobuf.js's defaults for the field types —
  // `bytes` empty, `string` empty, numbers zero. `sender` stays absent, as the
  // library leaves an unset message field null.
  const message: LiteOutgoingMessage = {
    id: new Uint8Array(0),
    body: '',
    expiry: 0,
    created: 0
  }
  while (!r.done) {
    const key = r.varint()
    const field = key >>> 3
    const wireType = key & 7
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
  }

  return message
}

function readOutgoingMessagesResponse(view: Uint8Array): { messages: LiteOutgoingMessage[] } {
  const r = new Reader(view)
  const messages: LiteOutgoingMessage[] = []
  while (!r.done) {
    const key = r.varint()
    const field = key >>> 3
    const wireType = key & 7
    if (field === 1 && wireType === WIRE_BYTES) {
      messages.push(readOutgoingMessage(r.bytes()))
    } else {
      r.skip(wireType)
    }
  }

  return { messages }
}

function readResponse(view: Uint8Array): LiteResponse {
  const r = new Reader(view)
  const response: LiteResponse = {}
  while (!r.done) {
    const key = r.varint()
    const field = key >>> 3
    const wireType = key & 7
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
  }

  return response
}

export function decodeResponseBatch(view: Uint8Array): { responses: LiteResponse[] } {
  const r = new Reader(view)
  const responses: LiteResponse[] = []
  while (!r.done) {
    const key = r.varint()
    const field = key >>> 3
    const wireType = key & 7
    if (field === 1 && wireType === WIRE_BYTES) {
      responses.push(readResponse(r.bytes()))
    } else {
      r.skip(wireType)
    }
  }

  return { responses }
}

// endregion ////
