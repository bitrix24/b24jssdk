/**
 * The protobuf wire primitives this codec needs, and nothing else.
 *
 * The schema it serves has no `required` fields, no packed repeats, no maps and
 * no 64-bit numbers — only `bytes`, `string`, `bool`, `uint32`, one `fixed32`
 * and nested messages. That is why 1.1 kB of code replaces a 94 kB library;
 * it is also why this file must never grow to cover protobuf in general. If a
 * new field type appears in `pull.proto`, add it here deliberately.
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
  #parts: number[] = []

  get length(): number {
    return this.#parts.length
  }

  varint(value: number): this {
    // Values here are lengths, tags, `uint32` fields and booleans — all
    // non-negative and well inside 2^32, so no zig-zag and no 64-bit path.
    let rest = value >>> 0
    while (rest > 0x7F) {
      this.#parts.push((rest & 0x7F) | 0x80)
      rest >>>= 7
    }
    this.#parts.push(rest)

    return this
  }

  fixed32(value: number): this {
    const v = value >>> 0
    this.#parts.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF)

    return this
  }

  bytes(value: Uint8Array): this {
    this.varint(value.length)
    for (const byte of value) {
      this.#parts.push(byte)
    }

    return this
  }

  string(value: string): this {
    return this.bytes(new TextEncoder().encode(value))
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.#parts)
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
      if (shift > 35) {
        throw new Error('pull protobuf: varint too long for this schema')
      }
    }
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
        // 64-bit. Nothing in this schema uses it; skipped rather than thrown
        // so an unknown future field cannot break a working connection.
        this.#pos += 8
        break
      }
      default: {
        throw new Error(`pull protobuf: unsupported wire type ${wireType}`)
      }
    }
  }
}
