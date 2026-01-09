import { ParamsFactory, B24Hook, EnumCrmEntityTypeId, Logger, LogLevel, NullLogger, ConsoleHandler, TelegramHandler } from '@bitrix24/b24jssdk'
import { defineCommand } from 'citty'

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
 * node -r dotenv/config ./cli/index.mjs make loadTesting --total=1000 --example=1 --limiter=default
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

    const logger = Logger.create('loadTesting')
      .pushHandler(new ConsoleHandler(LogLevel.DEBUG))

    // region Initialize Bitrix24 connection ////
    const hookPath = process.env?.B24_HOOK || ''
    if (!hookPath) {
      logger.error('🚨 B24_HOOK environment variable is not set! Please configure it in your .env file')
      process.exit(1)
    }

    const b24 = B24Hook.fromWebhookUrl(hookPath)
    logger.info(`Connected to Bitrix24: ${b24.getTargetOrigin()}`)

    const loggerForDebugB24 = Logger.create('b24')
      .pushHandler(new ConsoleHandler(LogLevel.NOTICE))

    const tgBotToken = process.env?.TG_BOT_TOKEN || ''
    const tgChatId = process.env?.TG_CHAT_ID || ''
    let telegramHandler
    if (tgBotToken && tgChatId) {
      telegramHandler = new TelegramHandler(LogLevel.ERROR, {
        botToken: tgBotToken,
        chatId: tgChatId,
        parseMode: 'HTML',
        disableNotification: true,
        disableWebPagePreview: false,
        warnInBrowser: false // Not warn in browser
      })
      loggerForDebugB24.pushHandler(telegramHandler)
    } else {
      telegramHandler = new NullLogger()
    }

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
        logger.debug(`call|${method}`, { requestId: commandNumber })

        const response = await b24.callMethod(method, params, commandNumber)

        if (!response.isSuccess) {
          throw new Error(response.getErrorMessages().join(';\n'))
        }

        const data = response.getData()
        logger.debug('response', {
          requestId: commandNumber,
          method,
          operatingStats: b24.getHttpClient().getStats().operatingStats,
          operating: data.time.operating,
          data: typeof data.result.items === 'undefined'
            ? data.result
            : data.result.items.map(item => item.id).slice(0, 10).join(',')
        })

        return { success: true, data }
      } catch (error) {
        const errorMessage = `Error calling command ${commandNumber}:\n${error.message}`
        errors.push(errorMessage)
        logger.error(`❌ ${errorMessage}`, { error })
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

        logger.debug(`callBatch|array`, {
          requestId: commandNumber
        })

        const response = await b24.callBatch(batchCalls, { isHaltOnError: true, returnAjaxResult: true, returnTime: true, requestId: commandNumber })

        if (!response.isSuccess) {
          throw new Error(response.getErrorMessages().join(';\n'))
        }

        const data = response.getData()

        logger.debug('response', {
          requestId: commandNumber,
          method: 'callBatch|array',
          operatingStats: b24.getHttpClient().getStats().operatingStats,
          self: data.time.operating,
          inner: data.result.map(responseAjax => responseAjax.getData().time.operating).join(', '),
          data: data.result.slice(0, 2).map(responseAjax => typeof responseAjax.getData().result?.items === 'undefined' ? responseAjax.getData().result : responseAjax.getData().result.items.map(item => item.id).slice(0, 5).join(', '))
        })

        return { success: true, data }
      } catch (error) {
        const errorMessage = `Error calling command ${commandNumber}:\n${error.message}`
        errors.push(errorMessage)
        logger.error(`❌ ${errorMessage}`, { error })
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

        logger.debug(`callBatch|object`, {
          requestId: commandNumber
        })

        const response = await b24.callBatch(batchCalls, { isHaltOnError: true, returnAjaxResult: true, returnTime: true, requestId: commandNumber })

        if (!response.isSuccess) {
          throw new Error(response.getErrorMessages().join(';\n'))
        }

        const data = response.getData()

        logger.debug('response', {
          requestId: commandNumber,
          method: 'callBatch|object',
          operatingStats: b24.getHttpClient().getStats().operatingStats,
          self: data.time.operating,
          inner: Object.values(data.result).map(responseAjax => responseAjax.getData().time.operating).join(', '),
          data: Object.values(data.result).slice(0, 2).map(responseAjax => typeof responseAjax.getData().result?.items === 'undefined' ? responseAjax.getData().result : responseAjax.getData().result.items.map(item => item.id).slice(0, 5).join(', '))
        })

        return { success: true, data }
      } catch (error) {
        const errorMessage = `Error calling command ${commandNumber}:\n${error.message}`
        errors.push(errorMessage)
        logger.error(`❌ ${errorMessage}`, { error })
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

        logger.debug(`callBatchByChunk|array`, {
          requestId: commandNumber
        })

        const response = await b24.callBatchByChunk(batchCalls, { isHaltOnError: true, requestId: commandNumber })

        if (!response.isSuccess) {
          throw new Error(response.getErrorMessages().join(';\n'))
        }

        const data = response.getData()

        logger.debug('response', {
          requestId: commandNumber,
          method: 'callBatchByChunk|array',
          operatingStats: b24.getHttpClient().getStats().operatingStats,
          data: data.slice(0, 2).map(row => typeof row.items === 'undefined' ? row : row.items.map(item => item.id).slice(0, 5).join(', '))
        })

        return { success: true, data }
      } catch (error) {
        const errorMessage = `Error calling command ${commandNumber}:\n${error.message}`
        errors.push(errorMessage)
        logger.error(`❌ ${errorMessage}`, { error })
        return { success: false, error: errorMessage }
      } finally {
        commandsCount++
      }
    }

    /**
     * Main function for calling random commands
     */
    async function callRandomCommands() {
      logger.debug('🚀 Starting calling of random commands in Bitrix24')
      logger.debug(`📊 Planned to calling: ${args.total} commands`)

      const healthCheckData = await b24.healthCheck('healthCheck')
      logger.debug(`📊 health check: ${healthCheckData ? 'success' : 'fail'}`)
      if (!healthCheckData) {
        return
      }

      const pingData = await b24.ping('ping')
      logger.debug(`📊 ping: ${pingData} ms.`)
      logger.debug('─'.repeat(50))

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

      logger.debug('\n\n' + '─'.repeat(50))
      logger.debug('✅ Completed!')
      logger.debug(`📈 Successfully calling: ${commandsCount} commands`)
      logger.debug(`⏱️ Total execution time: ${duration} seconds`)
      logger.debug(`📊 Average time per command: ${(duration / args.total).toFixed(2)} seconds`)

      if (errors.length > 0) {
        logger.debug(`❌ Errors encountered: ${errors.length}`)
        logger.debug('\nList of errors:')
        if (errors.length <= 10) {
          logger.debug('\nError details:')
          errors.forEach((error, index) => {
            logger.debug(`${index + 1}. ${error}`)
          })
        } else {
          logger.debug(`\nFirst 10 errors (out of ${errors.length}):`)
          errors.slice(0, 10).forEach((error, index) => {
            logger.debug(`${index + 1}. ${error}`)
          })
        }
      } else {
        logger.debug('🎉 No errors encountered during creation process!')
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
