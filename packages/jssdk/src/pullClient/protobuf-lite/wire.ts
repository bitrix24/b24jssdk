/**
 * The protobuf wire primitives this codec needs, and nothing else.
 *
 * The schema it serves has no `required` fields, no packed repeats, no maps and
 * no 64-bit numbers — only `bytes`, `string`, `bool`, `uint32`, one `fixed32`
 * and nested messages. That is why 4.5 kB minified replaces the 94 kB vendored
 * `protobuf/` directory (79 kB of it is protobuf.js itself, the rest is the
 * generated model); it is also why this file must never grow to cover protobuf
 * in general. If a new field type appears in `pull.proto`, add it here
 * deliberately. The doc records how those figures are measured.
 *
 * Restored from the box's own descriptors (`modules/pull/lib/protobuf/*.php`),
 * not reverse-engineered from traffic — see `.github/contributing/pull-protobuf.md`.
 */

export const WIRE_VARINT = 0
export const WIRE_BYTES = 2
export const WIRE_FIXED32 = 5

/** `key = (fieldNumber << 3) | wireType`, the tag every field is prefixed with. */
export function tag(fieldNumber: number, wireType: number): number {
  return (fieldNumber << 3) | wireType
}

export class Writer {
  // A growing `Uint8Array`, not a `number[]`. The array version was measurably
  // superlinear: each of the four nesting levels copied its child byte by byte
  // through `push`, and `Uint8Array.from` then copied the lot again — 106 ms for
  // a 1000-message batch against protobuf.js's 3.4 ms, and 267 ms for a 2 MB
  // body. Irrelevant for the single-message batches this client usually sends,
  // and a main-thread stall for the ones it occasionally does.
  #buffer = new Uint8Array(64)
  #length = 0

  get length(): number {
    return this.#length
  }

  #reserve(extra: number): void {
    const needed = this.#length + extra
    if (needed <= this.#buffer.length) {
      return
    }
    let size = this.#buffer.length * 2
    while (size < needed) {
      size *= 2
    }
    const grown = new Uint8Array(size)
    grown.set(this.#buffer.subarray(0, this.#length))
    this.#buffer = grown
  }

  #push(byte: number): void {
    this.#reserve(1)
    this.#buffer[this.#length++] = byte
  }

  varint(value: number): this {
    // Values written here are lengths, tags, `uint32` fields and booleans — all
    // non-negative and within 32 bits, so no zig-zag and no 64-bit path. A
    // negative would be written as its unsigned 32-bit form rather than
    // sign-extended to ten bytes the way protobuf.js writes `int32`; nothing in
    // this schema has a signed field whose values go negative (`SenderType` is
    // 0/1/2), and that difference is recorded in `pull-protobuf.md`.
    let rest = value >>> 0
    while (rest > 0x7F) {
      this.#push((rest & 0x7F) | 0x80)
      rest >>>= 7
    }
    this.#push(rest)

    return this
  }

  fixed32(value: number): this {
    const v = value >>> 0
    this.#reserve(4)
    this.#buffer[this.#length++] = v & 0xFF
    this.#buffer[this.#length++] = (v >>> 8) & 0xFF
    this.#buffer[this.#length++] = (v >>> 16) & 0xFF
    this.#buffer[this.#length++] = (v >>> 24) & 0xFF

    return this
  }

  bytes(value: Uint8Array): this {
    this.varint(value.length)
    this.#reserve(value.length)
    this.#buffer.set(value, this.#length)
    this.#length += value.length

    return this
  }

  string(value: string): this {
    // `TextEncoder` replaces an unpaired surrogate with U+FFFD, where
    // protobuf.js emits the code point as WTF-8. Unreachable from this client —
    // the only strings encoded are `JSON.stringify` output, which escapes lone
    // surrogates since ES2019 — but it is a real difference from the oracle and
    // is written down rather than left to be discovered.
    return this.bytes(new TextEncoder().encode(value))
  }

  finish(): Uint8Array {
    return this.#buffer.slice(0, this.#length)
  }
}

export class Reader {
  #view: Uint8Array
  #pos = 0

  constructor(view: Uint8Array) {
    this.#view = view
  }

  get done(): boolean {
    return this.#pos >= this.#view.length
  }

  /**
   * A varint of up to ten bytes — protobuf's full legal width.
   *
   * The ceiling was 35 bits, which made this codec LESS forward-compatible than
   * the library it replaces: an unknown `uint64` field above 2^35 threw, and
   * because `extractProtobufMessages` swallows the throw, the whole frame was
   * dropped where protobuf.js would have skipped the field and carried on. The
   * symptom would have been "connected, no events".
   *
   * Above 2^53 the value is no longer exact. That is acceptable only because
   * every caller either masks it (`uint32`) or discards it (`skip`); nothing in
   * this schema is a 64-bit field.
   */
  varint(): number {
    let result = 0
    let shift = 0
    for (;;) {
      if (this.done) {
        throw new Error('pull protobuf: truncated varint')
      }
      const byte = this.#view[this.#pos++]!
      result += (byte & 0x7F) * 2 ** shift
      if ((byte & 0x80) === 0) {
        return result
      }
      shift += 7
      if (shift >= 70) {
        throw new Error('pull protobuf: varint longer than ten bytes')
      }
    }
  }

  /**
   * A `uint32` field, truncated the way protobuf.js truncates it.
   *
   * Without the mask a wire value of 2^32 read back as 4294967296 where the
   * library gives 0 — the two codecs disagreeing on a well-formed frame.
   */
  uint32(): number {
    return this.varint() >>> 0
  }

  fixed32(): number {
    if (this.#pos + 4 > this.#view.length) {
      throw new Error('pull protobuf: truncated fixed32')
    }
    const v = this.#view[this.#pos]! | (this.#view[this.#pos + 1]! << 8)
      | (this.#view[this.#pos + 2]! << 16) | (this.#view[this.#pos + 3]! << 24)
    this.#pos += 4

    return v >>> 0
  }

  bytes(): Uint8Array {
    const length = this.varint()
    if (this.#pos + length > this.#view.length) {
      throw new Error('pull protobuf: length-delimited field runs past the end')
    }
    const out = this.#view.subarray(this.#pos, this.#pos + length)
    this.#pos += length

    return out
  }

  string(): string {
    return new TextDecoder().decode(this.bytes())
  }

  /**
   * Skip a field this codec does not model — the statistics branches, and
   * anything a future server adds. Unknown fields are ordinary protobuf, not an
   * error: the vendored library ignored them silently and so must this.
   */
  skip(wireType: number): void {
    switch (wireType) {
      case WIRE_VARINT: {
        this.varint()
        break
      }
      case WIRE_BYTES: {
        this.bytes()
        break
      }
      case WIRE_FIXED32: {
        this.fixed32()
        break
      }
      case 1: {
        // 64-bit. Nothing in this schema uses it; skipped rather than thrown so
        // an unknown future field cannot break a working connection. Bounds are
        // checked so a truncated frame fails here rather than silently ending
        // the loop and reporting an empty batch.
        if (this.#pos + 8 > this.#view.length) {
          throw new Error('pull protobuf: truncated 64-bit field')
        }
        this.#pos += 8
        break
      }
      default: {
        throw new Error(`pull protobuf: unsupported wire type ${wireType}`)
      }
    }
  }
}
