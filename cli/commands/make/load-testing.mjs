import { ParamsFactory, B24Hook, ApiVersion, EnumCrmEntityTypeId, Logger, LogLevel, LineFormatter, ConsoleHandler, TelegramHandler, Text } from '@bitrix24/b24jssdk'
import { defineCommand } from 'citty'

// Arrays for generating commands

/**
 * New params
 * fields: Record<string, any>
 * filter:
 *  FilterRule[]
 *  FilterRule = [ filed , operation, value ]
 *  FilterRuleOr = {
 *    'logic' => 'OR',
 *    'rule1' => FilterRule,
 *    'rule2' => FilterRule
 *  }
 * pagination: { page: 0, limit: 200, offset: 0 }
 * cursor: { field: string, value: number, order: string }
 */
const commandsListVer3 = [
  // error:
  // BITRIX_REST_V3_EXCEPTION_VALIDATION_REQUESTVALIDATIONEXCEPTION
  // { method: 'tasks.task.get', params: { taskId: 1, select: ['ID', 'TITLE'] } },
  // BITRIX_REST_V3_EXCEPTION_UNKNOWNDTOPROPERTYEXCEPTION
  // { method: 'tasks.task.get', params: { id: 1, select: ['ID', 'TITLE'] } },
  // BITRIX_REST_V3_EXCEPTION_METHODNOTFOUNDEXCEPTION
  // { method: 'tasks.task.list', params: { filter: [['id', '=', 1]], select: ['id', 'title'] } },
  // BITRIX_REST_V3_EXCEPTION_INVALIDFILTEREXCEPTION
  // { method: 'main.eventlog.list', params: { filter: { id: 1 } } }
  // BITRIX_REST_V3_EXCEPTION_ENTITYNOTFOUNDEXCEPTION
  // { method: 'tasks.task.get', params: { id: 2, select: ['id', 'title'] } }
  // work, but not use
  // { method: 'scopes', params: { filterModule: 'main' } },
  // { method: 'rest.scope.list', params: { filterModule: 'tasks', _filterController: '', _filterMethod: '' } },
  // @todo test this
  // * { method: 'tasks.task.list', params: { filter: [['id', 'in', [1]]], select: ['id', 'title'] } },
  // success:
  // { method: 'main.eventlog.list', params: { order: { id: 'DESC' }, filter: [['id', '>', 0]], pagination: { page: 0, limit: 200, offset: 0 }, select: ['id', 'timestampX', 'requestUri', 'userAgent'] } },
  // { method: 'main.eventlog.tail', params: { cursor: { field: 'id', value: 200, order: 'ASC' }, filter: [], select: ['id', 'timestampX', 'requestUri', 'userAgent'] } },
  // { method: 'main.eventlog.get', params: { id: 207, select: ['id', 'timestampX', 'requestUri', 'userAgent'] } },
  { method: 'tasks.task.update', params: { id: 1, fields: { title: `TEST: [${Text.getDateForLog()}]` } } },
  { method: 'tasks.task.get', params: { id: 1, select: ['id', 'title', 'siteId'] } }

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
 * clear; node -r dotenv/config ./cli/index.mjs make loadTesting --total=1000
 * clear; node -r dotenv/config ./cli/index.mjs make loadTesting --total=1000 --api=3
 * clear; node -r dotenv/config ./cli/index.mjs make loadTesting --total=1000 --example=1
 * clear; node -r dotenv/config ./cli/index.mjs make loadTesting --total=1000 --limiter=batch
 * clear; node -r dotenv/config ./cli/index.mjs make loadTesting --total=1000 --api=2 --example=1 --limiter=default
 * clear; node -r dotenv/config ./cli/index.mjs make loadTesting --total=2    --api=3 --example=1 --limiter=batch
 * clear; node -r dotenv/config ./cli/index.mjs make loadTesting --total=60   --async
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
      description: 'Example number [1, 2, ..., 4] (def: 1)',
      required: false
    },
    limiter: {
      description: 'What settings to use [default, realtime, batch] (def: batch)',
      required: false
    },
    async: {
      description: 'Work in asynchronous mode (def: false)',
      required: false
    },
    api: {
      description: 'Work in asynchronous mode [1,2,3] (def: 2)',
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

    const apiVersion = Number.parseInt(args?.api) === 3 ? ApiVersion.v3 : ApiVersion.v2

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
      if (apiVersion === ApiVersion.v3) {
        switch (example) {
          case 1:
            return callCommand1V3(commandNumber)
          case 2:
            return callCommand2V3(commandNumber)
          case 3:
            return callCommand3V3(commandNumber)
          case 4:
            return callCommand4V3(commandNumber)
        }

        return callCommand1V3(commandNumber)
      }

      switch (example) {
        case 1:
          return callCommand1V2(commandNumber)
        case 2:
          return callCommand2V2(commandNumber)
        case 3:
          return callCommand3V2(commandNumber)
        case 4:
          return callCommand4V2(commandNumber)
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
          data: JSON.stringify(data.result)
          // data: typeof data.result.tasks === 'undefined'
          //   ? data.result
          //   : data.result.tasks.map(item => item.id).slice(0, 10).join(',')
        })

        // @todo chane to Result
        return { success: true, data }
      } catch (error) {
        // @todo chane to Result
        const errorMessage = `${error.message}`
        errors.push(`[${error.code ?? '?'}] ${errorMessage}`)
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
        errors.push(`[${error.code ?? '?'}] ${errorMessage}`)
        logger.error(`❌ ${errorMessage}`, {
          requestId: commandNumber,
          apiVersion: ApiVersion.v2,
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

    async function callCommand2V3(commandNumber) {
      try {
        const batchCalls = [
          // 'server.time', {}],
          ['tasks.task.get', { id: 1, select: ['id', 'title'] }],
          ['tasks.task.get', { id: 3, select: ['id', 'title'] }]
          // ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'], filter: [['id', '>', 2]] }]
        ]

        logger.debug(`callBatch|array`, {
          requestId: commandNumber
        })

        const response = await b24.callBatchV3(batchCalls, { isHaltOnError: true, returnAjaxResult: true, returnTime: true, requestId: commandNumber })

        if (!response.isSuccess) {
          throw new Error(response.getErrorMessages().join(';\n'))
        }

        const data = response.getData()

        logger.debug('response', {
          requestId: commandNumber,
          method: 'callBatch|array',
          apiVersion: ApiVersion.v3,
          operatingStats: b24.getHttpClient(ApiVersion.v3).getStats().operatingStats,
          self: data.time.operating,
          // @todo ! api ver3 waite docs - this fake
          inner: data.result.map(responseAjax => responseAjax.getData().time.operating).join(', '),
          someData: data.result.slice(0, 2).map(responseAjax => typeof responseAjax.getData().result?.items === 'undefined' ? JSON.stringify(responseAjax.getData().result) : responseAjax.getData().result.items.map(item => item.id).slice(0, 5).join(', '))
          // someData: data.result.slice(0, 2).map(responseAjax => typeof responseAjax.getData().result?.items === 'undefined' ? responseAjax.getData().result : responseAjax.getData().result.items.map(item => item.id).slice(0, 5).join(', '))
        })

        return { success: true, data }
      } catch (error) {
        const errorMessage = `${error.message}`
        errors.push(`[${error.code ?? '?'}] ${errorMessage}`)
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

    async function callCommand2V2(commandNumber) {
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
          someData: data.result.slice(0, 2).map(responseAjax => typeof responseAjax.getData().result?.items === 'undefined' ? responseAjax.getData().result : responseAjax.getData().result.items.map(item => item.id).slice(0, 5).join(', '))
        })

        return { success: true, data }
      } catch (error) {
        const errorMessage = `${error.message}`
        errors.push(`[${error.code ?? '?'}] ${errorMessage}`)
        logger.error(`❌ ${errorMessage}`, {
          requestId: commandNumber,
          apiVersion: ApiVersion.v2,
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

    /**
     * AjaxError::JSSDK_REST_V3_BATCH_FROM_OBJECT
     * @todo ! api ver3 waite docs
     */
    async function callCommand3V3(commandNumber) {
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
            method: 'tasks.task.get',
            params: { id: 1, select: ['id', 'title'] }
          },
          cmd4: {
            method: 'tasks.task.get',
            params: { id: 3, select: ['id', 'title'] }
          }
        }

        logger.debug(`callBatch|object`, {
          requestId: commandNumber
        })

        const response = await b24.callBatchV3(batchCalls, { isHaltOnError: true, returnAjaxResult: true, returnTime: true, requestId: commandNumber })

        if (!response.isSuccess) {
          throw new Error(response.getErrorMessages().join(';\n'))
        }

        const data = response.getData()

        logger.debug('response', {
          requestId: commandNumber,
          method: 'callBatch|object',
          apiVersion: ApiVersion.v3,
          operatingStats: b24.getHttpClient(ApiVersion.v3).getStats().operatingStats,
          self: data.time.operating,
          inner: Object.values(data.result).map(responseAjax => responseAjax.getData().time.operating).join(', '),
          someData: Object.values(data.result).slice(0, 2).map(responseAjax => typeof responseAjax.getData().result?.items === 'undefined' ? responseAjax.getData().result : responseAjax.getData().result.items.map(item => item.id).slice(0, 5).join(', '))
        })

        return { success: true, data }
      } catch (error) {
        const errorMessage = `${error.message}`
        errors.push(`[${error.code ?? '?'}] ${errorMessage}`)
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

    async function callCommand3V2(commandNumber) {
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
          someData: Object.values(data.result).slice(0, 2).map(responseAjax => typeof responseAjax.getData().result?.items === 'undefined' ? responseAjax.getData().result : responseAjax.getData().result.items.map(item => item.id).slice(0, 5).join(', '))
        })

        return { success: true, data }
      } catch (error) {
        const errorMessage = `${error.message}`
        errors.push(`[${error.code ?? '?'}] ${errorMessage}`)
        logger.error(`❌ ${errorMessage}`, {
          requestId: commandNumber,
          apiVersion: ApiVersion.v2,
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

    async function callCommand4V3(commandNumber) {
      try {
        const { method, params } = commandsListVer3[Math.floor(Math.random() * commandsListVer3.length)]

        const batchCalls = Array.from({ length: 60 }, () => [
          method,
          params
        ])

        logger.debug(`callBatchByChunk|array`, {
          requestId: commandNumber
        })

        const response = await b24.callBatchByChunkV3(batchCalls, { isHaltOnError: true, requestId: commandNumber })

        if (!response.isSuccess) {
          throw new Error(response.getErrorMessages().join(';\n'))
        }

        const data = response.getData()

        logger.debug('response', {
          requestId: commandNumber,
          method: 'callBatchByChunk|array',
          apiVersion: ApiVersion.v3,
          operatingStats: b24.getHttpClient(ApiVersion.v2).getStats().operatingStats,
          someData: data.slice(0, 2).map(row => typeof row.items === 'undefined' ? (row?.result ?? row?.item?.title ?? row) : row.items.map(item => item.id).slice(0, 5).join(', '))
        })

        return { success: true, data }
      } catch (error) {
        const errorMessage = `${error.message}`
        errors.push(`[${error.code ?? '?'}] ${errorMessage}`)
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

    async function callCommand4V2(commandNumber) {
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
          someData: data.slice(0, 2).map(row => typeof row.items === 'undefined' ? row : row.items.map(item => item.id).slice(0, 5).join(', '))
        })

        return { success: true, data }
      } catch (error) {
        const errorMessage = `${error.message}`
        errors.push(`[${error.code ?? '?'}] ${errorMessage}`)
        logger.error(`❌ ${errorMessage}`, {
          requestId: commandNumber,
          apiVersion: ApiVersion.v2,
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

    /**
     * Main function for calling random commands
     */
    async function callRandomCommands() {
      logger.notice('🚀 Starting calling of random commands in Bitrix24')
      logger.notice(`Planned to calling: ${args.total} commands`)
      logger.notice(`ApiVersion: ${apiVersion}`)

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
        logger.info(`Parallel queries:`)
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
