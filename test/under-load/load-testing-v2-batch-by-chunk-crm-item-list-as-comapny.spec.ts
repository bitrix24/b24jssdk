import { describe } from 'vitest'
import { setupB24Tests, LoadTesterV2, LoadTesterV3, testConfig, processTests } from '../0_setup/hooks-under-load-jssdk'
import { ApiVersion } from '../../packages/jssdk/src/index'

describe('crmItemListAsCompany batchByChunk @apiV2', () => {
  const { getB24Client } = setupB24Tests()
  const b24 = getB24Client()

  const testParams = testConfig.calls.batchByChunkCrmItemListAsCompanyV2

  const tester = testParams.apiVersion === ApiVersion.v3
    ? new LoadTesterV3(b24, testParams.method, testParams.params)
    : new LoadTesterV2(b24, testParams.method, testParams.params)

  processTests(tester, {
    parallel: testConfig.parallel,
    ttlCall: testConfig.ttlCall
  })
})
