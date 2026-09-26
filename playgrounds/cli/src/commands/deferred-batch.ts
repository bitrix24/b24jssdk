import { defineCommand } from 'citty'
import 'dotenv/config'
import { ParamsFactory, SdkError } from '@bitrix24/b24jssdk'
import type { BatchCommandsArrayUniversal, DeferredBatchJob } from '@bitrix24/b24jssdk'
import { CLIENT_ERROR_STATUS } from '../constants'
import { createB24Client } from '../utils'

/**
 * CLI command — the deferred (background) batch, `actions.v3.deferredBatch`.
 *
 * Four modes:
 *
 *   - `run`     — everything in one call: `make()` adds the job, prints each
 *                 status change through `onStatus`, downloads and decodes the
 *                 result file, deletes the job, prints a summary.
 *   - `start`   — `add()` only; prints the job id and exits. The job keeps
 *                 running on the portal.
 *   - `collect` — `waitFor()` → `download()` → `delete()` for a job id from
 *                 `start`, e.g. in a later run.
 *   - `list`    — the jobs this webhook has on the portal.
 *
 * Commands are `user.current` repeated `--count` times: it needs only the
 * `user` scope and returns the same row every time, so the summary is easy to
 * check. The portal's plan must include deferred batches; otherwise every call
 * answers FEATURE_NOT_AVAILABLE_ON_CURRENT_PLAN.
 *
 * Required env (in `playgrounds/cli/.env`):
 *
 *   B24_HOOK=https://<portal>/rest/<userId>/<secret>/
 *
 * @usage pnpm --filter @bitrix24/b24jssdk-cli dev deferred-batch --mode=run --count=500
 */
export default defineCommand({
  meta: {
    name: 'deferred-batch',
    description: 'Run a deferred (background) batch: run | start | collect | list'
  },
  args: {
    mode: { description: 'run | start | collect | list', default: 'run' },
    count: { description: 'Number of commands for run / start', default: '100' },
    id: { description: 'Job id for collect', default: '' },
    pollInterval: { description: 'Milliseconds between status checks', default: '2000' },
    keep: { description: 'run: keep the job instead of deleting it (true | false)', default: 'false' }
  },
  async setup({ args }) {
    const mode = String(args.mode)
    const count = Number.parseInt(String(args.count), 10)
    const pollInterval = Number.parseInt(String(args.pollInterval), 10)
    if (Number.isNaN(pollInterval) || pollInterval < 250) {
      throw invalid('--pollInterval must be an integer of at least 250 (ms).')
    }
    if (!['run', 'start', 'collect', 'list'].includes(mode)) {
      throw invalid(`Unknown --mode=${mode}. Allowed: run | start | collect | list.`)
    }
    if (Number.isNaN(count) || count < 1) {
      throw invalid('--count must be a positive integer.')
    }

    const { b24, logger } = createB24Client('deferred-batch', { restrictionParams: ParamsFactory.getDefault() })
    const batch = b24.actions.v3.deferredBatch
    const calls: BatchCommandsArrayUniversal = Array.from({ length: count }, () => ['user.current', {}])
    const onStatus = (job: DeferredBatchJob): void => {
      logger.info(`job #${job.id}: ${job.status}`).catch(() => {})
    }

    try {
      if (mode === 'run') {
        const startedAt = Date.now()
        const response = await batch.make<Record<string, unknown>>({
          calls,
          pollInterval,
          onStatus,
          deleteAfter: String(args.keep) !== 'true'
        })
        if (!response.isSuccess) {
          logger.error('deferred batch failed', { errors: response.getErrorMessages() }).catch(() => {})
          process.exitCode = 1
          return
        }
        const rows = response.getData()!
        logger.info('deferred batch done', {
          commands: count,
          rows: rows.length,
          seconds: Math.round((Date.now() - startedAt) / 100) / 10,
          firstRow: rows[0]
        }).catch(() => {})
        return
      }

      if (mode === 'start') {
        const added = await batch.add({ calls })
        if (!added.isSuccess) {
          logger.error('add failed', { errors: added.getErrorMessages() }).catch(() => {})
          process.exitCode = 1
          return
        }
        const job = added.getData()!
        logger.info(`started job #${job.id} (${job.status}). Collect it with: dev deferred-batch --mode=collect --id=${job.id}`).catch(() => {})
        return
      }

      if (mode === 'collect') {
        const id = Number.parseInt(String(args.id), 10)
        if (Number.isNaN(id)) {
          throw invalid('--id is required for --mode=collect.')
        }
        const finished = await batch.waitFor(id, { pollInterval, onStatus })
        if (!finished.isSuccess) {
          logger.error('the job did not finish', {
            errors: finished.getErrorMessages(),
            errorMessage: finished.getData()?.errorMessage
          }).catch(() => {})
          process.exitCode = 1
          return
        }
        const rows = await batch.download(id)
        if (!rows.isSuccess) {
          logger.error('download failed', { errors: rows.getErrorMessages() }).catch(() => {})
          process.exitCode = 1
          return
        }
        logger.info('collected', { rows: rows.getData()!.length }).catch(() => {})
        const deleted = await batch.delete(id)
        logger.info(deleted.isSuccess ? `job #${id} deleted` : `job #${id} not deleted`).catch(() => {})
        return
      }

      const jobs = await batch.list()
      if (!jobs.isSuccess) {
        logger.error('list failed', { errors: jobs.getErrorMessages() }).catch(() => {})
        process.exitCode = 1
        return
      }
      for (const job of jobs.getData()!) {
        logger.info(`job #${job.id}: ${job.status}`, { createdAt: job.createdAt, commands: job.commands?.length }).catch(() => {})
      }
    } finally {
      b24.destroy()
    }
  }
})

function invalid(description: string): SdkError {
  return new SdkError({ code: 'PLAYGROUND_CLI_INVALID_ARG', description, status: CLIENT_ERROR_STATUS })
}
