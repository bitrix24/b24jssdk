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
 * In **v3** `tasks.task.list` is a standard v3 list method: it uses the
 * lowercase `id` field for both the request cursor and the response, and groups
 * the rows under `result.items`. So the helper only needs `idKey: 'id'` (the
 * default) and `customKeyForResult: 'items'` — no `cursorIdKey` override (that
 * is only needed on the v2 endpoint, where the method sorts by `ID` but returns
 * `id`). Verified against a live portal.
 *
 * Note: in v3 the TaskDto marks almost every field `filterable: false` — only
 * `id` is filterable (check with `tasks.task.field.list`). That is why this demo
 * exposes no filter args; the keyset cursor works because it pages on `id`.
 *
 * @usage pnpm --filter @bitrix24/b24jssdk-cli dev list tasks --limit=50
 */
export default defineCommand({
  meta: {
    name: 'tasks',
    description: 'List tasks from Bitrix24 via REST API v3 (tasks.task.list)'
  },
  args: {
    limit: { description: 'Page size per request (server caps tasks.task.list at 50)', default: '50' }
  },
  async setup({ args }) {
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

    const generator = b24.actions.v3.fetchList.make<TaskListItem>({
      method: 'tasks.task.list',
      params: {
        select: ['id', 'title', 'status', 'responsibleId']
      },
      idKey: 'id',
      customKeyForResult: 'items',
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
