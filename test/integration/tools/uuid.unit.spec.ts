import { describe, it, expect } from 'vitest'
import { Text } from '../../../packages/jssdk/src/'

describe('tools UUID v7 Generator', () => {
  it('should generate valid UUID v7', () => {
    const uuid = Text.getUuidRfc4122()
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })

  it('should generate unique values', () => {
    const uuids = new Map()
    for (let i = 0; i < 1000; i++) {
      uuids.set(Text.getUuidRfc4122(), true)
    }
    expect(uuids.size).toStrictEqual(1000)
  })
})
