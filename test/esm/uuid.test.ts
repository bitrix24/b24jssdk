import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Text } from '../../dist/esm/index.mjs'

describe('[ESM] UUID v7 Generator', () => {
  it('should generate valid UUID v7', () => {
    const uuid = Text.getUuidRfc4122()
    assert.match(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })

  it('should generate unique values', () => {
    const uuids = new Map()
    for (let i = 0; i < 1000; i++) {
      uuids.set(Text.getUuidRfc4122(), true)
    }
    assert.strictEqual(uuids.size, 1000)
  })
})
