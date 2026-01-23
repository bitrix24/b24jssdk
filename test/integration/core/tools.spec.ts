import { describe, it, expect } from 'vitest'
import { setupB24Tests } from '../../0_setup/hooks-integration-jssdk'

describe('coreTools', () => {
  const { getB24Client } = setupB24Tests()

  it('HealthCheck', async () => {
    const b24 = getB24Client()

    const method = 'healthCheck'
    const requestId = `test@coreTools/${method}`
    const response = await b24.tools.healthCheck.make({ requestId })
    expect(response).toBeTruthy()
  })

  it('Ping', async () => {
    const b24 = getB24Client()

    const method = 'Ping'
    const requestId = `test@coreTools/${method}`
    const response = await b24.tools.ping.make({ requestId })
    expect(response).toBeGreaterThan(0)
  })
})
