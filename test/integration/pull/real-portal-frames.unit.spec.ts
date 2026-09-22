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
 * The library hands back message instances carrying prototype defaults and the
 * lite codec plain objects, so a raw deep-equal would compare the shape of two
 * implementations rather than the content of one frame.
 */
function shape(batch: unknown) {
  const responses = (batch as { responses: Array<Record<string, any>> }).responses

  return responses.map(response => ({
    command: response.command,
    messages: (response.outgoingMessages?.messages ?? []).map((message: Record<string, any>) => ({
      id: [...(message.id ?? [])],
      body: message.body ?? '',
      expiry: message.expiry ?? 0,
      created: message.created ?? 0,
      sender: message.sender
        ? { type: message.sender.type ?? 0, id: [...(message.sender.id ?? [])] }
        : undefined
    }))
  }))
}

describe('pull: frames recorded from a live portal', () => {
  it('the fixture is what it claims to be', () => {
    // A fixture that silently emptied would make every case below vacuous.
    expect(fixture.portal.serverVersion).toBe(4)
    expect(fixture.portal.webSocketMode).toBe('protobuf')
    expect(fixture.frames.length).toBeGreaterThanOrEqual(5)
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
    // ordinary traffic never reaches it. Without this the fixture would only
    // ever exercise the one-and-two-byte forms.
    const largest = Math.max(...fixture.frames.map(frame => frame.byteLength))

    expect(largest).toBeGreaterThan(16_384)
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
