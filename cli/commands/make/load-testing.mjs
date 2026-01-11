import { ParamsFactory, B24Hook, ApiVersion, EnumCrmEntityTypeId, Logger, LogLevel, LineFormatter, ConsoleHandler, TelegramHandler } from '@bitrix24/b24jssdk'
import { defineCommand } from 'citty'

// Arrays for generating commands

const commandsListVer3 = [
  // error - v2 notation - BITRIX_REST_V3_EXCEPTION_VALIDATION_REQUESTVALIDATIONEXCEPTION
  // { method: 'tasks.task.get', params: { taskId: 1, select: ['ID', 'TITLE'] } },
  // error - BITRIX_REST_V3_EXCEPTION_UNKNOWNDTOPROPERTYEXCEPTION
  // { method: 'tasks.task.get', params: { id: 1, select: ['ID', 'TITLE'] } },
  // error - wring filter
  { method: 'tasks.task.list', params: { filter: { id: 1 }, select: ['id', 'title'] } },
  // normal
  // { method: 'tasks.task.list', params: { filter: [['id', 'in', [1]]], select: ['id', 'title'] } },
  // normal
  // { method: 'tasks.task.get', params: { id: 1, select: ['id', 'title'] } },
  // error - BITRIX_REST_V3_EXCEPTION_ENTITYNOTFOUNDEXCEPTION
  // { method: 'tasks.task.get', params: { id: 2, select: ['id', 'title'] } }
]

const commandsListVer2 = [
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

    // region Logger ////
    const logger = Logger.create('loadTesting')
    const handler = new ConsoleHandler(LogLevel.DEBUG, { useStyles: false })
    handler.setFormatter(new LineFormatter('[{channel}] {levelName}: {message}'))
    logger.pushHandler(handler)
    // endregion ////

    // region Initialize Bitrix24 connection ////
    const hookPath = process.env?.B24_HOOK || ''
    if (!hookPath) {
      logger.emergency('🚨 B24_HOOK environment variable is not set! Please configure it in your .env file')
      process.exit(1)
    }

    const options = {
      restrictionParams: undefined
    }

    // region B24->RestrictionManager ////
    if (args?.limiter === 'default') {
      logger.info('RestrictionManager', { limiter: 'Default' })
      options.restrictionParams = ParamsFactory.getDefault()
    } else if (args?.limiter === 'realtime') {
      logger.info('RestrictionManager', { limiter: 'Realtime' })
      options.restrictionParams = ParamsFactory.getRealtime()
    } else { // args?.limiter === 'batch'
      logger.info('RestrictionManager', { limiter: 'BatchProcessing' })
      options.restrictionParams = ParamsFactory.getBatchProcessing()
    }
    // endregion ////

    const b24 = B24Hook.fromWebhookUrl(hookPath, options)
    logger.info(`Connected to Bitrix24`, { target: b24.getTargetOrigin() })

    // region B24->Logger ////
    const loggerForDebugB24 = Logger.create('b24')
    const handlerForDebugB24 = new ConsoleHandler(LogLevel.NOTICE, { useStyles: false })
    handlerForDebugB24.setFormatter(new LineFormatter('[{channel}] {levelName}: {message}'))
    loggerForDebugB24.pushHandler(handlerForDebugB24)

    const tgBotToken = process.env?.TG_BOT_TOKEN || ''
    const tgChatId = process.env?.TG_CHAT_ID || ''
    if (tgBotToken && tgChatId) {
      loggerForDebugB24.pushHandler(new TelegramHandler(LogLevel.ERROR, {
        botToken: tgBotToken,
        chatId: tgChatId,
        parseMode: 'HTML',
        disableNotification: true,
        disableWebPagePreview: true,
        warnInBrowser: false // Not warn in browser
      }))
    }

    b24.setLogger(loggerForDebugB24)
    // endregion ////
    // endregion ////

    /**
     * Calling a single command
     */
    async function callCommand(example, commandNumber) {
      switch (example) {
        case 1:
          return callCommand1V3(commandNumber)
        case 2:
          return callCommand2(commandNumber)
        case 3:
          return callCommand3(commandNumber)
        case 4:
          return callCommand4(commandNumber)
      }

      return callCommand1V2(commandNumber)
    }

    async function callCommand1V3(commandNumber) {
      try {
        const { method, params } = commandsListVer3[Math.floor(Math.random() * commandsListVer3.length)]
        logger.debug(`call|${method}`, { requestId: commandNumber })

        const response = await b24.callV3(method, params, commandNumber)

        if (!response.isSuccess) {
          throw new Error(response.getErrorMessages().join(';\n'))
        }

        const data = response.getData()
        logger.debug('response', {
          requestId: commandNumber,
          method,
          apiVersion: ApiVersion.v3,
          operatingStats: b24.getHttpClient(ApiVersion.v3).getStats().operatingStats,
          operating: data.time.operating,
          data: typeof data.result.tasks === 'undefined'
            ? data.result
            : data.result.tasks.map(item => item.id).slice(0, 10).join(',')
        })

        return { success: true, data }
      } catch (error) {
        const errorMessage = `${error.message}`
        errors.push(errorMessage)
        logger.error(`❌ ${errorMessage}`, {
          requestId: commandNumber,
          apiVersion: ApiVersion.v3,
          error: {
            code: error.code ?? '?',
            message: error.message ?? error
          }
        })
        return { success: false, error: errorMessage }
      } finally {
        commandsCount++
      }
    }

    async function callCommand1V2(commandNumber) {
      try {
        const { method, params } = commandsListVer2[Math.floor(Math.random() * commandsListVer2.length)]
        logger.debug(`call|${method}`, { requestId: commandNumber })

        const response = await b24.callV2(method, params, commandNumber)

        if (!response.isSuccess) {
          throw new Error(response.getErrorMessages().join(';\n'))
        }

        const data = response.getData()
        logger.debug('response', {
          requestId: commandNumber,
          method,
          apiVersion: ApiVersion.v2,
          operatingStats: b24.getHttpClient(ApiVersion.v2).getStats().operatingStats,
          operating: data.time.operating,
          data: typeof data.result.items === 'undefined'
            ? data.result
            : data.result.items.map(item => item.id).slice(0, 10).join(',')
        })

        return { success: true, data }
      } catch (error) {
        const errorMessage = `${error.message}`
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

        const response = await b24.callBatchV2(batchCalls, { isHaltOnError: true, returnAjaxResult: true, returnTime: true, requestId: commandNumber })

        if (!response.isSuccess) {
          throw new Error(response.getErrorMessages().join(';\n'))
        }

        const data = response.getData()

        logger.debug('response', {
          requestId: commandNumber,
          method: 'callBatch|array',
          apiVersion: ApiVersion.v2,
          operatingStats: b24.getHttpClient(ApiVersion.v2).getStats().operatingStats,
          self: data.time.operating,
          inner: data.result.map(responseAjax => responseAjax.getData().time.operating).join(', '),
          data: data.result.slice(0, 2).map(responseAjax => typeof responseAjax.getData().result?.items === 'undefined' ? responseAjax.getData().result : responseAjax.getData().result.items.map(item => item.id).slice(0, 5).join(', '))
        })

        return { success: true, data }
      } catch (error) {
        const errorMessage = `${error.message}`
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

        const response = await b24.callBatchV2(batchCalls, { isHaltOnError: true, returnAjaxResult: true, returnTime: true, requestId: commandNumber })

        if (!response.isSuccess) {
          throw new Error(response.getErrorMessages().join(';\n'))
        }

        const data = response.getData()

        logger.debug('response', {
          requestId: commandNumber,
          method: 'callBatch|object',
          apiVersion: ApiVersion.v2,
          operatingStats: b24.getHttpClient(ApiVersion.v2).getStats().operatingStats,
          self: data.time.operating,
          inner: Object.values(data.result).map(responseAjax => responseAjax.getData().time.operating).join(', '),
          data: Object.values(data.result).slice(0, 2).map(responseAjax => typeof responseAjax.getData().result?.items === 'undefined' ? responseAjax.getData().result : responseAjax.getData().result.items.map(item => item.id).slice(0, 5).join(', '))
        })

        return { success: true, data }
      } catch (error) {
        const errorMessage = `${error.message}`
        errors.push(errorMessage)
        logger.error(`❌ ${errorMessage}`, { error })
        return { success: false, error: errorMessage }
      } finally {
        commandsCount++
      }
    }

    async function callCommand4(commandNumber) {
      try {
        const { method, params } = commandsListVer2[Math.floor(Math.random() * commandsListVer2.length)]

        const batchCalls = Array.from({ length: 150 }, () => [
          method,
          params
        ])

        logger.debug(`callBatchByChunk|array`, {
          requestId: commandNumber
        })

        const response = await b24.callBatchByChunkV2(batchCalls, { isHaltOnError: true, requestId: commandNumber })

        if (!response.isSuccess) {
          throw new Error(response.getErrorMessages().join(';\n'))
        }

        const data = response.getData()

        logger.debug('response', {
          requestId: commandNumber,
          method: 'callBatchByChunk|array',
          apiVersion: ApiVersion.v2,
          operatingStats: b24.getHttpClient(ApiVersion.v2).getStats().operatingStats,
          data: data.slice(0, 2).map(row => typeof row.items === 'undefined' ? row : row.items.map(item => item.id).slice(0, 5).join(', '))
        })

        return { success: true, data }
      } catch (error) {
        const errorMessage = `${error.message}`
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
      logger.notice('🚀 Starting calling of random commands in Bitrix24')
      logger.notice(`Planned to calling: ${args.total} commands`)

      const healthCheckData = await b24.healthCheck('healthCheck')
      logger.notice(`Health check: ${healthCheckData ? 'success' : 'fail'}`)
      if (!healthCheckData) {
        return
      }

      const pingData = await b24.ping('ping')
      logger.notice(`Ping: ${pingData} ms.`)
      logger.notice('─'.repeat(50))

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

      logger.notice('─'.repeat(50))
      logger.notice('✅ Completed!')
      logger.notice(`📈 Successfully calling: ${commandsCount} commands`)
      logger.notice(`⏱️ Total execution time: ${duration} seconds`)
      logger.notice(`📊 Average time per command: ${(duration / args.total).toFixed(2)} seconds`)

      if (errors.length > 0) {
        logger.notice('❌ Errors', {
          encountered: errors.length,
          first10: errors.slice(0, 10).map((error, index) => `${index + 1}. ${error}`)
        })
      } else {
        logger.notice('🎉 No errors encountered during creation process!')
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
