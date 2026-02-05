import { describe, it, expect } from 'vitest'
import { setupB24Tests } from '../../0_setup/hooks-integration-jssdk'

describe('parentMessage', () => {
  const { getB24Frame } = setupB24Tests()

  it('FirstTest', async () => {
    const b24 = getB24Frame()

    const method = 'im:setTextareaContent'
    const requestId = `test@coreTools/${method}`
    const response = await b24.parent.message.send(
      method,
      {
        isRawValue: true,
        isSafely: true,
        safelyTime: 500,
        requestId,
        text: 'Text for insertion'
      }
    )

    expect(response).toBeTruthy()
  })
})
