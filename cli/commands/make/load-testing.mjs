import { ParamsFactory, B24Hook, EnumCrmEntityTypeId, LoggerType } from '@bitrix24/b24jssdk'
import { defineCommand } from 'citty'
import { LoggerConsola } from './../../tools/logger.mjs'

// Arrays for generating commands

const commandsList = [
  { method: 'server.time', params: {} },
  { method: 'crm.item.list', params: { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>id': 2 } } },
  { method: 'crm.item.list', params: { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>id': 200 } } },
  { method: 'crm.item.list', params: { entityTypeId: EnumCrmEntityTypeId.contact, select: ['id'], filter: { '>id': 2 } } },
  { method: 'crm.item.list', params: { entityTypeId: EnumCrmEntityTypeId.contact, select: ['id'], filter: { '>id': 200 } } },
  { method: 'crm.item.list', params: { entityTypeId: EnumCrmEntityTypeId.deal, select: ['id'], filter: { '>id': 2 } } },
  { method: 'crm.item.list', params: { entityTypeId: EnumCrmEntityTypeId.deal, select: ['id'], filter: { '>id': 200 } } }
]

/**
 * Command for Bitrix24 REST API load testing
 * Usage:
 * node -r dotenv/config ./cli/index.mjs make loadTesting --total=1000
 * node -r dotenv/config ./cli/index.mjs make loadTesting --total=1000 --example=1
 * node -r dotenv/config ./cli/index.mjs make loadTesting --total=1000 --example=2
 * node -r dotenv/config ./cli/index.mjs make loadTesting --total=1000 --limiter=batch
 * node -r dotenv/config ./cli/index.mjs make loadTesting --total=1000 --limiter=realtime
 * node -r dotenv/config ./cli/index.mjs make loadTesting --total=1000 --limiter=default
 * node -r dotenv/config ./cli/index.mjs make loadTesting --total=60 --async
 */
export default defineCommand({
  meta: {
    name: 'loadTesting',
    description: 'REST API load testing'
  },
  args: {
    total: {
      description: 'Number of commands to execute',
      required: true
    },
    example: {
      description: 'Номер примера 1...4 (def: 1)',
      required: false
    },
    limiter: {
      description: 'Какие настройки использовать (def: batch)',
      required: false
    },
    async: {
      description: 'Работать в асинхронном режиме (def: false)',
      required: false
    }
  },
  async setup({ args }) {
    let commandsCount = 0
    let errors = []

    const logger = LoggerConsola.build('loadTesting|', true)

    // region Initialize Bitrix24 connection ////
    const hookPath = process.env?.B24_HOOK || ''
    if (!hookPath) {
      logger.error('🚨 B24_HOOK environment variable is not set! Please configure it in your .env file')
      process.exit(1)
    }

    const b24 = B24Hook.fromWebhookUrl(hookPath)
    logger.info(`Connected to Bitrix24: ${b24.getTargetOrigin()}`)

    const loggerForDebugB24 = LoggerConsola.build('b24|')
    loggerForDebugB24.setConfig({
      [LoggerType.desktop]: false,
      [LoggerType.log]: false,
      [LoggerType.info]: true,
      [LoggerType.warn]: true,
      [LoggerType.error]: true,
      [LoggerType.trace]: false
    })

    b24.setLogger(loggerForDebugB24)

    if (args?.limiter === 'default') {
      logger.info('🚨 Default')
      b24.getHttpClient().setRestrictionManagerParams(ParamsFactory.getDefault())
    } else if (args?.limiter === 'realtime') {
      logger.info('🚨 Realtime')
      b24.getHttpClient().setRestrictionManagerParams(ParamsFactory.getRealtime())
    } else { // args?.limiter === 'batch'
      logger.info('🚨 BatchProcessing')
      b24.getHttpClient().setRestrictionManagerParams(ParamsFactory.getBatchProcessing())
    }
    // endregion ////

    /**
     * Calling a single command
     */
    async function callCommand(example, commandNumber) {
      switch (example) {
        case 1:
          return callCommand1(commandNumber)
        case 2:
          return callCommand2(commandNumber)
        case 3:
          return callCommand3(commandNumber)
        case 4:
          return callCommand4(commandNumber)
      }

      return callCommand1(commandNumber)
    }

    async function callCommand1(commandNumber) {
      try {
        const { method, params } = commandsList[Math.floor(Math.random() * commandsList.length)]
        logger.info('callMethod >>>', method)

        const response = await b24.callMethod(method, params, commandNumber)

        logger.info(`📈 operating stats:`, b24.getHttpClient().getStats().operatingStats)

        if (!response.isSuccess) {
          throw new Error(response.getErrorMessages().join(';\n'))
        }

        const data = response.getData()
        logger.log('[DEBUG] callMethod: operating', data.time.operating)
        logger.log('[DEBUG] callMethod: data', typeof data.result.items === 'undefined'
          ? data.result
          : data.result.items.map(item => item.id).slice(0, 10).join(',')
        )

        return { success: true, data }
      } catch (error) {
        const errorMessage = `Error calling command ${commandNumber}:\n${error.message}`
        errors.push(errorMessage)
        logger.error(`❌ ${errorMessage}`)
        return { success: false, error: errorMessage }
      } finally {
        commandsCount++
      }
    }

    async function callCommand2(commandNumber) {
      try {
        const batchCalls = [
          ['server.time', {}],
          ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>id': 2 } }],
          ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>id': 200 } }],
          ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.contact, select: ['id'], filter: { '>id': 2 } }],
          ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.contact, select: ['id'], filter: { '>id': 200 } }]
        ]

        logger.info(`callBatch|array[${batchCalls.length}] >>>`, ['server.time', 'crm.item.list', '...'])

        const response = await b24.callBatch(batchCalls, { isHaltOnError: true, returnAjaxResult: true, returnTime: true, requestId: commandNumber })

        logger.info(`📈 operating stats:`, b24.getHttpClient().getStats().operatingStats)

        if (!response.isSuccess) {
          throw new Error(response.getErrorMessages().join(';\n'))
        }

        const data = response.getData()

        logger.log('[DEBUG] callBatch|array: _self.operating:', data.time.operating)
        logger.log('[DEBUG] callBatch|array: inner.operating:', data.result.map(responseAjax => responseAjax.getData().time.operating).join(', '))
        logger.log('[DEBUG] callBatch|array:', data.result.slice(0, 2).map(responseAjax => typeof responseAjax.getData().result?.items === 'undefined' ? responseAjax.getData().result : responseAjax.getData().result.items.map(item => item.id).slice(0, 5).join(', ')))

        return { success: true, data }
      } catch (error) {
        const errorMessage = `Error calling command ${commandNumber}:\n${error.message}`
        errors.push(errorMessage)
        logger.error(`❌ ${errorMessage}`)
        return { success: false, error: errorMessage }
      } finally {
        commandsCount++
      }
    }

    async function callCommand3(commandNumber) {
      try {
        const batchCalls = {
          cmd1: {
            method: 'server.time',
            params: {}
          },
          cmd2: {
            method: 'crm.item.list',
            params: { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>id': 2 } }
          },
          cmd3: {
            method: 'crm.item.list',
            params: { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: { '>id': 200 } }
          },
          cmd4: {
            method: 'crm.item.list',
            params: { entityTypeId: EnumCrmEntityTypeId.contact, select: ['id'], filter: { '>id': 2 } }
          },
          cmd5: {
            method: 'crm.item.list',
            params: { entityTypeId: EnumCrmEntityTypeId.contact, select: ['id'], filter: { '>id': 200 } }
          }
        }

        logger.info('callBatch|object >>>', { cmd1: batchCalls.cmd1.method, cmd2: batchCalls.cmd2.method, cmd3: '...' })

        const response = await b24.callBatch(batchCalls, { isHaltOnError: true, returnAjaxResult: true, returnTime: true, requestId: commandNumber })

        logger.info(`📈 operating stats:`, b24.getHttpClient().getStats().operatingStats)

        if (!response.isSuccess) {
          throw new Error(response.getErrorMessages().join(';\n'))
        }

        const data = response.getData()

        logger.log('[DEBUG] callBatch|object: _self.operating:', data.time.operating)
        logger.log('[DEBUG] callBatch|object: inner.operating:', Object.values(data.result).map(responseAjax => responseAjax.getData().time.operating).join(', '))
        logger.log('[DEBUG] callBatch|object:', Object.values(data.result).slice(0, 2).map(responseAjax => typeof responseAjax.getData().result?.items === 'undefined' ? responseAjax.getData().result : responseAjax.getData().result.items.map(item => item.id).slice(0, 5).join(', ')))

        return { success: true, data }
      } catch (error) {
        const errorMessage = `Error calling command ${commandNumber}:\n${error.message}`
        errors.push(errorMessage)
        logger.error(`❌ ${errorMessage}`)
        return { success: false, error: errorMessage }
      } finally {
        commandsCount++
      }
    }

    async function callCommand4(commandNumber) {
      try {
        const { method, params } = commandsList[Math.floor(Math.random() * commandsList.length)]

        const batchCalls = Array.from({ length: 150 }, () => [
          method,
          params
        ])

        logger.info(`callBatchByChunk|array[${batchCalls.length}] >>>`, [method, method, '...'])

        const response = await b24.callBatchByChunk(batchCalls, { isHaltOnError: true, requestId: commandNumber })

        logger.info(`📈 operating stats:`, b24.getHttpClient().getStats().operatingStats)

        if (!response.isSuccess) {
          throw new Error(response.getErrorMessages().join(';\n'))
        }

        const data = response.getData()

        logger.log('[DEBUG] callBatchByChunk|array:', data.slice(0, 2).map(row => typeof row.items === 'undefined' ? row : row.items.map(item => item.id).slice(0, 5).join(', ')))

        return { success: true, data }
      } catch (error) {
        const errorMessage = `Error calling command ${commandNumber}:\n${error.message}`
        errors.push(errorMessage)
        logger.error(`❌ ${errorMessage}`)
        return { success: false, error: errorMessage }
      } finally {
        commandsCount++
      }
    }

    /**
     * Main function for calling random commands
     */
    async function callRandomCommands() {
      logger.log('🚀 Starting calling of random commands in Bitrix24')
      logger.log(`📊 Planned to calling: ${args.total} commands`)

      const healthCheckData = await b24.healthCheck()
      logger.log(`📊 health check: ${healthCheckData ? 'success' : 'fail'}`)
      if (!healthCheckData) {
        return
      }

      const pingData = await b24.ping()
      logger.log(`📊 ping: ${pingData} ms.`)

      logger.log('─'.repeat(50))

      const startTime = Date.now()

      if (args?.async) {
        logger.info(`Паралельные запросы:`)
        for (let i = 0; i <= args.total; i++) {
          setTimeout(async () => {
            await callCommand(args?.example ?? 1, i + 1)

            showProgress()
          }, i * 100)
        }
      } else {
        for (let i = 0; i < args.total; i++) {
          await callCommand(args?.example ?? 1, i + 1)
          showProgress()
        }
      }

      const endTime = Date.now()
      const duration = ((endTime - startTime) / 1000).toFixed(2)

      logger.log('\n\n' + '─'.repeat(50))
      logger.log('✅ Completed!')
      logger.log(`📈 Successfully calling: ${commandsCount} commands`)
      logger.log(`⏱️ Total execution time: ${duration} seconds`)
      logger.log(`📊 Average time per command: ${(duration / args.total).toFixed(2)} seconds`)

      if (errors.length > 0) {
        logger.log(`❌ Errors encountered: ${errors.length}`)
        logger.log('\nList of errors:')
        if (errors.length <= 10) {
          logger.log('\nError details:')
          errors.forEach((error, index) => {
            logger.log(`${index + 1}. ${error}`)
          })
        } else {
          logger.log(`\nFirst 10 errors (out of ${errors.length}):`)
          errors.slice(0, 10).forEach((error, index) => {
            logger.log(`${index + 1}. ${error}`)
          })
        }
      } else {
        logger.log('🎉 No errors encountered during creation process!')
      }
    }

    /**
     * Displays calling progress
     */
    function showProgress() {
      const percentage = Math.round((commandsCount / args.total) * 100)
      process.stdout.write(`\rProgress: ${percentage}% (${commandsCount}/${args.total})\n\r`)
    }

    await callRandomCommands()
  }
})
