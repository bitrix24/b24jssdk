import { consola } from 'consola'
import { RestrictionParamsFactory, B24Hook, EnumCrmEntityTypeId, LoggerBrowser, LoggerType } from '@bitrix24/b24jssdk'
import { defineCommand } from 'citty'

// Arrays for generating commands

const commandsList = [
  // { method: 'server.time', params: {} },
  // { method: 'crm.company.list', params: { select: ['ID'] } },
  // { method: 'crm.contact.list', params: { select: ['ID'] } },
  // { method: 'lists.element.get', params: {
  //   IBLOCK_TYPE_ID: 'lists',
  //   IBLOCK_ID: 44,
  //   SELECT: ['ID']
  // } }
  { method: 'crm.item.list', params: { entityTypeId: EnumCrmEntityTypeId.company } },
  { method: 'crm.item.list', params: { entityTypeId: EnumCrmEntityTypeId.contact } }
]

/**
 * Command for Bitrix24 REST API load testing
 * Usage: node -r dotenv/config ./cli/index.mjs make loadTesting --total=100000
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
    }
  },
  async setup({ args }) {
    let commandsCount = 0
    let errors = []

    // Initialize Bitrix24 connection
    const hookPath = process.env?.B24_HOOK || ''
    if (!hookPath) {
      consola.error('🚨 B24_HOOK environment variable is not set! Please configure it in your .env file')
      process.exit(1)
    }

    const b24 = B24Hook.fromWebhookUrl(hookPath)
    consola.info(`Connected to Bitrix24: ${b24.getTargetOrigin()}`)

    const logger = LoggerBrowser.build('loadTesting', true)
    const loggerForDebugB24 = LoggerBrowser.build('b24')
    loggerForDebugB24.setConfig({
      [LoggerType.desktop]: false,
      [LoggerType.log]: false,
      [LoggerType.info]: true,
      [LoggerType.warn]: true,
      [LoggerType.error]: true,
      [LoggerType.trace]: false
    })

    b24.setLogger(loggerForDebugB24)
    b24.getHttpClient().setRestrictionManagerParams(
      // RestrictionParamsFactory.getRealtime()
      RestrictionParamsFactory.getBatchProcessing()
    )

    /**
     * Calling a single command
     */
    async function callCommand(commandNumber) {
      try {
        const { method, params } = commandsList[Math.floor(Math.random() * commandsList.length)]
        const response = await b24.callMethod(
          method,
          params
        )

        // Checking the current load
        logger.info('loadInfo:', b24.getHttpClient().getStats().loadInfo)
        logger.info('operatingStats:', b24.getHttpClient().getStats().operatingStats)

        if (!response.isSuccess) {
          throw new Error(response.getErrorMessages().join(';\n'))
        }
        const data = response.getData()
        logger.log('Data:', response.getData().result.items.map(item => item.id).join(','))
        // logger.log('Data:', response.getData().result)

        commandsCount++

        return { success: true, data }
      } catch (error) {
        const errorMessage = `Error calling command ${commandNumber}: ${error.message}`
        errors.push(errorMessage)
        consola.error(`❌ ${errorMessage}`)
        return { success: false, error: errorMessage }
      }
    }

    /**
     * Displays calling progress
     */
    function showProgress() {
      const percentage = Math.round((commandsCount / args.total) * 100)

      // const progressBarLength = 20
      // const filledLength = Math.floor(percentage / 100 * progressBarLength)
      // const progressBar = '█'.repeat(filledLength) + '░'.repeat(progressBarLength - filledLength)

      // process.stdout.clearLine()
      // process.stdout.cursorTo(0)
      // process.stdout.write(`\rProgress: [${progressBar}] ${percentage}% (${commandsCount}/${args.total})\n\r`)
      process.stdout.write(`\rProgress: ${percentage}% (${commandsCount}/${args.total})\n\r`)
    }

    /**
     * Main function for calling random commands
     */
    async function callRandomCommands() {
      consola.log('🚀 Starting calling of random commands in Bitrix24')
      consola.log(`📊 Planned to calling: ${args.total} commands`)
      consola.log('─'.repeat(50))

      const startTime = Date.now()

      for (let i = 0; i < args.total; i++) {
        await callCommand(i + 1)
        showProgress()
      }

      const endTime = Date.now()
      const duration = ((endTime - startTime) / 1000).toFixed(2)

      consola.log('\n\n' + '─'.repeat(50))
      consola.log('✅ Completed!')
      consola.log(`📈 Successfully calling: ${commandsCount} commands`)
      consola.log(`⏱️ Total execution time: ${duration} seconds`)
      consola.log(`📊 Average time per command: ${(duration / args.total).toFixed(2)} seconds`)

      if (errors.length > 0) {
        consola.log(`❌ Errors encountered: ${errors.length}`)
        consola.log('\nList of errors:')
        if (errors.length <= 10) {
          consola.log('\nError details:')
          errors.forEach((error, index) => {
            consola.log(`${index + 1}. ${error}`)
          })
        } else {
          consola.log(`\nFirst 10 errors (out of ${errors.length}):`)
          errors.slice(0, 10).forEach((error, index) => {
            consola.log(`${index + 1}. ${error}`)
          })
        }
      } else {
        consola.log('🎉 No errors encountered during creation process!')
      }
    }

    await callRandomCommands()
  }
})
