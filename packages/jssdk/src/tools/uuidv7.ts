/**
 * uuid v7
 *
 * @link https://github.com/uuidjs/uuid ver 11.1.0
 */

import { randomFillSync } from 'node:crypto'

type V7State = {
  // time, milliseconds
  msecs?: number
  // sequence number (32-bits)
  seq?: number
}

const _state: V7State = {}

const isBrowser = typeof window !== 'undefined'

function initRng () {
  try {
    const rnds8Pool = new Uint8Array(256) // # of random values to pre-allocate
    let poolPtr = rnds8Pool.length

    return {
      rng: () => {
        if (poolPtr > rnds8Pool.length - 16) {
          randomFillSync(rnds8Pool)
          poolPtr = 0
        }
        return rnds8Pool.slice(poolPtr, (poolPtr += 16))
      }
    }
  } catch {
    throw new Error('Node.js crypto module not available');
  }
}

function initRngBrowser () {
  const crypto = window.crypto || (window as any).msCrypto
  if (!crypto?.getRandomValues) {
    throw new Error('Web Crypto API not available')
  }

  return {
    rng: () => {
      const rnds8 = new Uint8Array(16)
      return crypto.getRandomValues(rnds8)
    }
  }
}

const byteToHex: string[] = []
for (let i = 0; i < 256; ++i) {
  byteToHex.push((i + 0x100).toString(16).slice(1))
}

function updateV7State(state: V7State, now: number, randoms: Uint8Array) {
  state.msecs ??= -Infinity
  state.seq ??= 0

  if (now > state.msecs) {
    // Time has moved on! Pick a new random sequence number
    state.seq =
      (randoms[6] << 23) | (randoms[7] << 16) | (randoms[8] << 8) | randoms[9]
    state.msecs = now
  } else {
    // Bump sequence counter w/ 32-bit rollover
    state.seq = Math.trunc(state.seq + 1)

    // In case of rollover, bump timestamp to preserve monotonicity. This is
    // allowed by the RFC and should self-correct as the system clock catches
    // up. See https://www.rfc-editor.org/rfc/rfc9562.html#section-6.2-9.4
    if (state.seq === 0) {
      state.msecs++
    }
  }

  return state
}

function v7Bytes(
  randoms: Uint8Array,
  msecs?: number,
  seq?: number,
  buf?: Uint8Array,
  offset = 0
) {
  if (!buf) {
    buf = new Uint8Array(16)
    offset = 0
  }

  // Defaults
  msecs ??= Date.now()
  seq ??=
    ((randoms[6] * 0x7f) << 24) |
    (randoms[7] << 16) |
    (randoms[8] << 8) |
    randoms[9]

  // byte 0-5: timestamp (48 bits)
  buf[offset++] = (msecs / 0x10000000000) & 0xff
  buf[offset++] = (msecs / 0x100000000) & 0xff
  buf[offset++] = (msecs / 0x1000000) & 0xff
  buf[offset++] = (msecs / 0x10000) & 0xff
  buf[offset++] = (msecs / 0x100) & 0xff
  buf[offset++] = msecs & 0xff

  // byte 6: `version` (4 bits) | sequence bits 28-31 (4 bits)
  buf[offset++] = 0x70 | ((seq >>> 28) & 0x0f)

  // byte 7: sequence bits 20-27 (8 bits)
  buf[offset++] = (seq >>> 20) & 0xff

  // byte 8: `variant` (2 bits) | sequence bits 14-19 (6 bits)
  buf[offset++] = 0x80 | ((seq >>> 14) & 0x3f)

  // byte 9: sequence bits 6-13 (8 bits)
  buf[offset++] = (seq >>> 6) & 0xff

  // byte 10: sequence bits 0-5 (6 bits) | random (2 bits)
  buf[offset++] = ((seq << 2) & 0xff) | (randoms[10] & 0x03)

  // bytes 11-15: random (40 bits)
  buf[offset++] = randoms[11]
  buf[offset++] = randoms[12]
  buf[offset++] = randoms[13]
  buf[offset++] = randoms[14]
  buf[offset++] = randoms[15]

  return buf
}

function unsafeStringify(arr: Uint8Array, offset = 0): string {
  // Note: Be careful editing this code!  It's been tuned for performance
  // and works in ways you may not expect.
  //
  // Note to future-self: No, you can't remove the `toLowerCase()` call.
  return (
    byteToHex[arr[offset]] +
    byteToHex[arr[offset + 1]] +
    byteToHex[arr[offset + 2]] +
    byteToHex[arr[offset + 3]] +
    '-' +
    byteToHex[arr[offset + 4]] +
    byteToHex[arr[offset + 5]] +
    '-' +
    byteToHex[arr[offset + 6]] +
    byteToHex[arr[offset + 7]] +
    '-' +
    byteToHex[arr[offset + 8]] +
    byteToHex[arr[offset + 9]] +
    '-' +
    byteToHex[arr[offset + 10]] +
    byteToHex[arr[offset + 11]] +
    byteToHex[arr[offset + 12]] +
    byteToHex[arr[offset + 13]] +
    byteToHex[arr[offset + 14]] +
    byteToHex[arr[offset + 15]]
  ).toLowerCase()
}

// Main export
export default function uuidv7(): string {
  const buf = undefined
  const offset = undefined

  let rngFunction: () => Uint8Array

  const now = Date.now()
  if (isBrowser) {
    const { rng } = initRngBrowser()
    rngFunction = rng
  } else {
    const { rng } = initRng()
    rngFunction = rng
  }

  const randoms = rngFunction()
  updateV7State(_state, now, randoms)

  const bytes: Uint8Array = v7Bytes(
    randoms,
    _state.msecs,
    _state.seq,
    buf,
    offset
  )

  return unsafeStringify(bytes)
}
