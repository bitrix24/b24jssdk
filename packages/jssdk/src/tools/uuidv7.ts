/**
 * uuid v7
 */
const byteToHex: string[] = []
for (let i = 0; i < 256; ++i) {
  byteToHex.push((i + 0x100).toString(16).slice(1))
}

function sfc32(a: number, b: number, c: number, d: number) {
  return () => {
    // eslint-disable-next-line
    a |= 0; b |= 0; c |= 0; d |= 0;
    // eslint-disable-next-line
    const t = (a + b | 0) + d | 0;
    // eslint-disable-next-line
    d = d + 1 | 0;
    a = b ^ b >>> 9
    // eslint-disable-next-line
    b = c + (c << 3) | 0;
    // eslint-disable-next-line
    c = (c << 21 | c >>> 11) + t | 0;
    return t >>> 0
  }
}

export default function uuidv7(): string {
  const bytes = new Uint8Array(16)
  const timestamp = BigInt(Date.now())
  const perf = BigInt(Math.floor(performance.now() * 1000) % 0xFFFF)
  const combinedTime = (timestamp << 16n) | perf

  bytes[0] = Number((combinedTime >> 40n) & 0xFFn)
  bytes[1] = Number((combinedTime >> 32n) & 0xFFn)
  bytes[2] = Number((combinedTime >> 24n) & 0xFFn)
  bytes[3] = Number((combinedTime >> 16n) & 0xFFn)
  bytes[4] = Number((combinedTime >> 8n) & 0xFFn)
  bytes[5] = Number(combinedTime & 0xFFn)

  const seed = (Math.random() * 0xFFFFFFFF ^ Date.now() ^ performance.now()) >>> 0
  const rand = sfc32(0x9E3779B9, 0x243F6A88, 0xB7E15162, seed)
  const randView = new DataView(bytes.buffer)

  randView.setUint32(6, rand())
  randView.setUint32(10, rand())
  randView.setUint16(14, rand())

  bytes[6] = 0x70 | (bytes[6]! & 0x0F)
  bytes[8] = 0x80 | (bytes[8]! & 0x3F)

  return (
    byteToHex[bytes[0]!]
    + byteToHex[bytes[1]!]!
    + byteToHex[bytes[2]]
    + byteToHex[bytes[3]]
    + '-'
    + byteToHex[bytes[4]]
    + byteToHex[bytes[5]]
    + '-'
    + byteToHex[bytes[6]]
    + byteToHex[bytes[7]!]
    + '-'
    + byteToHex[bytes[8]]
    + byteToHex[bytes[9]!]
    + '-'
    + byteToHex[bytes[10]!]
    + byteToHex[bytes[11]!]
    + byteToHex[bytes[12]!]
    + byteToHex[bytes[13]!]
    + byteToHex[bytes[14]!]
    + byteToHex[bytes[15]!]
  ).toLowerCase()
}
