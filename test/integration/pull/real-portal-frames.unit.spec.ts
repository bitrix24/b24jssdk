/**
 * Frames recorded from a live portal, decoded by both codecs.
 *
 * `.github/contributing/pull-protobuf.md` names this as the exit criterion for
 * deleting the vendored library, and says why the differential suite is not it:
 * both codecs were derived from the same descriptors, so that suite proves they
 * AGREE, not that either is RIGHT. A wrong field number is reproduced
 * identically on both sides and stays green.
 *
 * These bytes were produced by a Bitrix24 push server — nothing in this
 * repository wrote them — and captured by `/pull-lab` in the Nuxt playground on
 * a push-server v4 portal over a binary WebSocket. Decoding them is the one
 * check that can catch a schema error, because the encoder was the server.
 *
 * `*.unit.spec.ts` (testing.md's exception): it reads a committed fixture and
 * touches no portal, so it runs in CI where the live suites cannot.
 *
 * The fixture carries one substitution, made in place and equal in length: the
 * portal hostname inside `extra.server_name`, which has no business being
 * published. Every length prefix and every other byte is the server's — see the
 * `note` field in the fixture, and the size assertions below, which would fail
 * if the substitution had shifted anything.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ResponseBatch } from '../../../packages/jssdk/src/pullClient/protobuf'
import { decodeResponseBatch } from '../../../packages/jssdk/src/pullClient/protobuf-lite/messages'

type Fixture = {
  portal: { serverVersion: number, transport: string, webSocketMode: string }
  frames: Array<{ byteLength: number, base64: string }>
}

const fixture = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./fixtures/response-batch-frames.json', import.meta.url)),
    'utf8'
  )
) as Fixture

const bytesOf = (frame: { base64: string }) =>
  Uint8Array.from(Buffer.from(frame.base64, 'base64'))

/**
 * What the client actually reads off a decoded batch.
 *
 * The library hands back message instances whose unset fields live on the
 * prototype; the lite codec hands back plain objects that materialise the same
 * defaults. A raw deep-equal would compare those two representations rather
 * than the content of one frame.
 *
 * The normalisation is deliberately NARROW. An earlier version coalesced every
 * field with `??`, which erased proto2 *presence* — exactly the property a
 * proto2 codec gets wrong — and reported agreement on frames where the two
 * codecs genuinely differ (`Sender.id` is absent on the wire in all five:
 * protobuf.js reports it absent, the lite codec materialises an empty
 * `Uint8Array`). Deleting the lite codec's whole default initialiser also left
 * the suite green. So the scalars are compared WITHOUT defaulting, and the
 * known divergence is pinned by its own case below instead of being smoothed
 * away here.
 */
function shape(batch: unknown) {
  const responses = (batch as { responses: Array<Record<string, any>> }).responses

  return responses.map(response => ({
    command: response.command,
    messages: (response.outgoingMessages?.messages ?? []).map((message: Record<string, any>) => ({
      // `null` where the field is absent, so absent and empty stay distinct.
      id: message.id === undefined ? null : [...message.id],
      body: message.body,
      expiry: message.expiry,
      created: message.created,
      senderType: message.sender === undefined ? null : message.sender.type
    }))
  }))
}

describe('pull: frames recorded from a live portal', () => {
  it('the fixture is what it claims to be', () => {
    // A fixture that silently emptied would make every case below vacuous.
    expect(fixture.portal.serverVersion).toBe(4)
    expect(fixture.portal.webSocketMode).toBe('protobuf')
    // Two frames, not five: the other three were byte-near-copies of the
    // first and exercised an identical path. What matters is one small frame
    // and one whose body passes the three-byte length prefix.
    expect(fixture.frames.length).toBeGreaterThanOrEqual(2)
    for (const frame of fixture.frames) {
      expect(bytesOf(frame).byteLength).toBe(frame.byteLength)
    }
  })

  it('both codecs decode every frame to the same thing', () => {
    // THE check this file exists for.
    for (const [index, frame] of fixture.frames.entries()) {
      const bytes = bytesOf(frame)

      expect(shape(decodeResponseBatch(bytes)), `frame #${index}`)
        .toStrictEqual(shape(ResponseBatch.decode(bytes)))
    }
  })

  it('the decoded bodies are the JSON the client goes on to parse', () => {
    // Agreement on garbage would also be agreement. This pins that what comes
    // out is a well-formed Pull envelope, which is what `broadcastMessage`
    // requires — a decode that returned an empty body for every field would
    // otherwise satisfy the case above.
    let seen = 0
    for (const frame of fixture.frames) {
      for (const response of decodeResponseBatch(bytesOf(frame)).responses) {
        for (const message of response.outgoingMessages?.messages ?? []) {
          const body = JSON.parse(message.body ?? '') as Record<string, unknown>
          expect(body.module_id).toBe('application')
          expect(typeof body.command).toBe('string')
          seen++
        }
      }
    }
    expect(seen).toBeGreaterThan(0)
  })

  it('covers a body past the three-byte length prefix', () => {
    // 16 384 bytes is where a varint length prefix grows to three bytes, and
    // ordinary traffic never reaches it. The assertion is on the decoded BODY,
    // not on the frame: a frame can exceed 16 384 bytes as many small messages
    // with no three-byte prefix anywhere, so the frame size proves nothing.
    const bodies = fixture.frames.flatMap(frame =>
      decodeResponseBatch(bytesOf(frame)).responses.flatMap(
        response => (response.outgoingMessages?.messages ?? []).map(message => (message.body ?? '').length)
      )
    )

    expect(Math.max(...bodies)).toBeGreaterThanOrEqual(16_384)
  })

  it('pins the one place the two codecs deliberately differ', () => {
    // `Sender.id` is absent on the wire in every frame. protobuf.js leaves it
    // absent; the lite codec materialises an empty `Uint8Array`, on purpose —
    // #552 made it do that because `decodeId(undefined)` threw and, since the
    // catch wraps the whole loop, dropped the entire batch.
    //
    // So this is a KNOWN divergence, not a defect. It is pinned rather than
    // normalised away, because the moment it stops being true — in either
    // direction — somebody has changed something they should be told about.
    const bytes = bytesOf(fixture.frames[0]!)
    const fromLibrary = (ResponseBatch.decode(bytes) as unknown as {
      responses: Array<Record<string, any>>
    }).responses[0]!.outgoingMessages.messages[0]
    const fromLite = decodeResponseBatch(bytes).responses[0]!.outgoingMessages!.messages[0]!

    expect(Object.hasOwn(fromLibrary.sender, 'id')).toBe(false)
    expect(Object.hasOwn(fromLite.sender as object, 'id')).toBe(true)
    expect((fromLite.sender!.id as Uint8Array).byteLength).toBe(0)

    // Every one of these IS on the wire in all five frames, so their presence
    // here says nothing about the codec's defaults — pinning those needs a
    // message with a field absent, which no recorded frame supplies. That case
    // lives in the differential spec, where synthetic frames belong.
    for (const key of ['id', 'body', 'expiry', 'created'] as const) {
      expect(fromLite[key], key).toBeDefined()
    }
  })

  it('reads `created` as fixed32, not as a varint', () => {
    // Trap 2 from pull-protobuf.md, and the one a shared-schema error would
    // hide: read as a varint, `created` yields a plausible wrong number rather
    // than an error. These frames were stamped by the server within minutes of
    // being recorded, so a misread shows up as a wildly wrong date.
    const recorded = Math.floor(new Date(fixture.frames.length ? '2026-09-22T00:00:00Z' : 0).getTime() / 1000)
    let checked = 0
    for (const frame of fixture.frames) {
      for (const response of decodeResponseBatch(bytesOf(frame)).responses) {
        for (const message of response.outgoingMessages?.messages ?? []) {
          expect(message.created).toBeGreaterThan(recorded)
          expect(message.created).toBeLessThan(recorded + 86_400 * 2)
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(0)
  })
})
