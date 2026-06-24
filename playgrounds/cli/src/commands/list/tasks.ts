import { B24Hook, Logger, LogLevel, ConsoleV2Handler, ParamsFactory } from '@bitrix24/b24jssdk'
import { defineCommand } from 'citty'
import 'dotenv/config'
import type { TaskListItem } from '../../types'

/**
 * CLI Command to read tasks from Bitrix24 through the **REST API v3**
 * `tasks.task.list` method.
 *
 * Demonstrates cursor-based retrieval of an arbitrarily large task list via
 * `b24.actions.v3.fetchList.make()` (an async generator that yields the data in
 * chunks without loading everything into memory at once).
 *
 * `tasks.task.list` is special: it sorts / filters by the uppercase `ID` but
 * returns each task with a lowercase `id`. The list helper therefore needs
 * `idKey: 'id'` (response field, drives the cursor), `cursorIdKey: 'ID'`
 * (request field, used for `order` and the `> id` page filter) and
 * `customKeyForResult: 'tasks'` (the response groups items under `result.tasks`).
 *
 * @usage pnpm --filter @bitrix24/b24jssdk-cli dev list tasks --responsibleId=5 --limit=50
 */
export default defineCommand({
  meta: {
    name: 'tasks',
    description: 'List tasks from Bitrix24 via REST API v3 (tasks.task.list)'
  },
  args: {
    responsibleId: { description: 'Filter by responsible user ID (0 = no filter)', default: '0' },
    limit: { description: 'Page size per request (server caps tasks.task.list at 50)', default: '50' }
  },
  async setup({ args }) {
    const responsibleId = Number(args.responsibleId)
    const limit = Number(args.limit)

    // region Logger ////
    const logger = Logger.create('list-tasks')
    logger.pushHandler(new ConsoleV2Handler(LogLevel.DEBUG, { useStyles: false }))

    const loggerForDebugB24 = Logger.create('b24')
    loggerForDebugB24.pushHandler(new ConsoleV2Handler(LogLevel.ERROR, { useStyles: false }))
    // endregion Logger ////

    const hookPath = process.env.B24_HOOK ?? ''
    if (!hookPath.trim()) {
      logger.emergency('🚨 B24_HOOK environment variable is not set! Please configure it in your .env file')
      process.exit(1)
    }

    const b24 = B24Hook.fromWebhookUrl(hookPath, { restrictionParams: ParamsFactory.getBatchProcessing() })
    b24.setLogger(loggerForDebugB24)
    logger.info('Connected to Bitrix24', { target: b24.getTargetOrigin() })

    const filter: unknown[] = []
    if (responsibleId > 0) {
      // tasks.task.list filters on the request-side uppercase field name
      // (`RESPONSIBLE_ID`), the same casing asymmetry as the cursor (`ID`).
      filter.push(['RESPONSIBLE_ID', '=', responsibleId])
    }

    const generator = b24.actions.v3.fetchList.make<TaskListItem>({
      method: 'tasks.task.list',
      params: {
        filter,
        select: ['id', 'title', 'status', 'responsibleId']
      },
      idKey: 'id',
      cursorIdKey: 'ID',
      customKeyForResult: 'tasks',
      requestId: 'list-tasks',
      limit
    })

    const startTime = Date.now()
    let total = 0
    let page = 0
    for await (const chunk of generator) {
      page++
      total += chunk.length
      logger.notice(`Page ${page}: +${chunk.length} tasks (total so far: ${total})`)
      for (const task of chunk) {
        logger.info(`#${task.id} [status ${task.status}] ${task.title}`)
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    logger.notice('─'.repeat(50))
    logger.notice(`✅ Done. Loaded ${total} tasks in ${page} page(s), ${duration}s`)
  }
})
