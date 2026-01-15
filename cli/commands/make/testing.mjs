import { ParamsFactory, B24Hook, EnumCrmEntityTypeId, ApiVersion, Logger, LogLevel, LineFormatter, ConsoleHandler } from '@bitrix24/b24jssdk'
import { defineCommand } from 'citty'

/**
 * For DEBUG
 *
 * Usage:
 * clear; node -r dotenv/config ./cli/index.mjs make testing
 *
 * @todo remove this
 */
export default defineCommand({
  meta: {
    name: 'testing',
    description: 'REST API testing'
  },
  args: {},
  async setup() {
    // region Logger ////
    const logger = Logger.create('loadTesting')
    const handler = new ConsoleHandler(LogLevel.DEBUG, { useStyles: false })
    handler.setFormatter(new LineFormatter('[{channel}] {levelName}: {message}'))
    logger.pushHandler(handler)
    // endregion ////

    // region Initialize Bitrix24 connection ////
    const hookPath = process.env?.B24_HOOK || ''
    if (!hookPath) {
      logger.emergency('B24_HOOK environment variable is not set! Please configure it in your .env file')
      process.exit(1)
    }

    const b24 = B24Hook.fromWebhookUrl(hookPath, {
      restrictionParams: ParamsFactory.getBatchProcessing()
    })
    logger.info(`Connected to Bitrix24`, { target: b24.getTargetOrigin() })

    const loggerForDebugB24 = Logger.create('b24')
    const handlerForDebugB24 = new ConsoleHandler(LogLevel.NOTICE, { useStyles: false })
    handlerForDebugB24.setFormatter(new LineFormatter('[{channel}] {levelName}: {message}'))
    loggerForDebugB24.pushHandler(handlerForDebugB24)
    b24.setLogger(loggerForDebugB24)
    // endregion ////

    async function callCommandV3() {
      const requestId = 'test-1'
      const apiVersion = ApiVersion.v3
      try {
        const method = 'server.time'
        const response = await b24.callV3(method, {}, requestId)
        if (!response.isSuccess) {
          throw new Error(response.getErrorMessages().join(';\n'))
        }
        const data = response.getData()
        logger.debug('response', {
          requestId,
          method,
          apiVersion,
          operatingStats: b24.getHttpClient(apiVersion).getStats().operatingStats,
          operating: data.time.operating,
          data: JSON.stringify(data.result)
        })
      } catch (error) {
        logger.error(`❌ ${error.message}`, {
          requestId,
          apiVersion,
          error: {
            code: error.code ?? '?',
            message: error.message ?? error
          }
        })
      }
    }

    async function callCommandV2() {
      const requestId = 'test-2'
      const apiVersion = ApiVersion.v2
      try {
        const method = 'server.time'
        const response = await b24.callV2(method, {}, requestId)
        if (!response.isSuccess) {
          throw new Error(response.getErrorMessages().join(';\n'))
        }
        const data = response.getData()
        logger.debug('response', {
          requestId,
          method,
          apiVersion,
          operatingStats: b24.getHttpClient(apiVersion).getStats().operatingStats,
          operating: data.time.operating,
          data: JSON.stringify(data.result)
        })
      } catch (error) {
        logger.error(`❌ ${error.message}`, {
          requestId,
          apiVersion,
          error: {
            code: error.code ?? '?',
            message: error.message ?? error
          }
        })
      }
    }

    async function callCommandV2Batch() {
      const requestId = 'test-3'
      const apiVersion = ApiVersion.v2
      try {
        const method = 'callBatch'
        /**
         * Automatically obtain the API version for Batch
         *
         * @todo test methods
         *   `[['crm.item.get', { entityTypeId: 3, id: 1 }]]`
         *   `[{ method: 'crm.item.get', params: { entityTypeId: 3, id: 1 } }]`
         *   `{ cmd1: { method: 'crm.item.get', params: { entityTypeId: 3, id: 1 } }, cmd2: ['crm.item.get', { entityTypeId: 2, id: 2 }] }`
         */
        const batchCallsAsArray = [
          ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>id': 2 } }],
          { method: 'crm.item.list', params: { entityTypeId: -1 * EnumCrmEntityTypeId.company, select: ['id'], filter: { '>id': 11 } } }
        ]
        const batchCallsAsObject = {
          cmd1: { method: 'crm.item.list', params: { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>id': 11 } } },
          cmd2: ['crm.item.list', { entityTypeId: -1 * EnumCrmEntityTypeId.company, select: ['id'], filter: { '=id': 3 } }]
        }
        const response = await b24.callBatchV2(
          batchCallsAsArray,
          { isHaltOnError: false, returnAjaxResult: true, returnTime: true, requestId }
        )
        // if (!response.isSuccess) {
        //   throw new Error(response.getErrorMessages().join(';\n'))
        // }
        const data = response.getData()
        logger.debug('response', {
          requestId,
          method,
          apiVersion,
          operatingStats: b24.getHttpClient(apiVersion).getStats().operatingStats,
          self: data.time.operating,
          asArray: 1 > 2 ? undefined : {
            inner: data.result.map(responseAjax => responseAjax.getData().time?.operating).join(', '),
            someData: data.result.map(responseAjax => responseAjax.getData().result.items?.map(item => item.id).slice(0, 5).join(', ') || responseAjax.getErrorMessages().join(','))
          },
          asObject: 1 > 0 ? undefined : {
            inner: Object.values(data.result).map(responseAjax => responseAjax.getData().time?.operating).join(', '),
            someData: Object.values(data.result).map(responseAjax => responseAjax.getData().result.items?.map(item => item.id).slice(0, 5).join(', ') || responseAjax.getErrorMessages().join(','))
          }
        })
      } catch (error) {
        logger.error(`❌ ${error.message}`, {
          requestId,
          apiVersion,
          error: {
            code: error.code ?? '?',
            message: error.message ?? error,
            ory: error
          }
        })
      }
    }

    async function callCommandV3Batch() {
      const requestId = 'test-4'
      const apiVersion = ApiVersion.v3
      try {
        const method = 'callBatch'
        /**
         * Automatically obtain the API version for Batch
         *
         * @todo test methods
         *   `[['crm.item.get', { entityTypeId: 3, id: 1 }]]`
         *   `[{ method: 'crm.item.get', params: { entityTypeId: 3, id: 1 } }]`
         *   `{ cmd1: { method: 'crm.item.get', params: { entityTypeId: 3, id: 1 } }, cmd2: ['crm.item.get', { entityTypeId: 2, id: 2 }] }`
         */
        const batchCallsAsArray = [
          ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>id': 2 } }],
          { method: 'crm.item.list', params: { entityTypeId: -1 * EnumCrmEntityTypeId.company, select: ['id'], filter: { '>id': 11 } } }
        ]
        const batchCallsAsObject = {
          cmd1: { method: 'crm.item.list', params: { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>id': 11 } } },
          cmd2: ['crm.item.list', { entityTypeId: -1 * EnumCrmEntityTypeId.company, select: ['id'], filter: { '=id': 3 } }]
        }
        const response = await b24.callBatchV3(
          batchCallsAsArray,
          { isHaltOnError: false, returnAjaxResult: true, returnTime: true, requestId }
        )
        // if (!response.isSuccess) {
        //   throw new Error(response.getErrorMessages().join(';\n'))
        // }
        const data = response.getData()
        logger.debug('response', {
          requestId,
          method,
          apiVersion,
          operatingStats: b24.getHttpClient(apiVersion).getStats().operatingStats,
          self: data.time.operating,
          asArray: 1 > 2 ? undefined : {
            inner: data.result.map(responseAjax => responseAjax.getData().time?.operating).join(', '),
            someData: data.result.map(responseAjax => responseAjax.getData().result.items?.map(item => item.id).slice(0, 5).join(', ') || responseAjax.getErrorMessages().join(','))
          },
          asObject: 1 > 0 ? undefined : {
            inner: Object.values(data.result).map(responseAjax => responseAjax.getData().time?.operating).join(', '),
            someData: Object.values(data.result).map(responseAjax => responseAjax.getData().result.items?.map(item => item.id).slice(0, 5).join(', ') || responseAjax.getErrorMessages().join(','))
          }
        })
      } catch (error) {
        logger.error(`❌ ${error.message}`, {
          requestId,
          apiVersion,
          error: {
            code: error.code ?? '?',
            message: error.message ?? error,
            ory: error
          }
        })
      }
    }

    async function main() {
      await callCommandV3Batch()
      logger.notice('✅ Completed!')

      // destroy b24 - this stop AuthRefresh
      b24.destroy()
    }

    await main()
  }
})
