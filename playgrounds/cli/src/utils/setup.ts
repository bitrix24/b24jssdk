import { B24Hook, Logger, LogLevel, ConsoleV2Handler, ParamsFactory, SdkError } from '@bitrix24/b24jssdk'
import type { Handler } from '@bitrix24/b24jssdk'
import { CLIENT_ERROR_STATUS } from '../constants'

export interface CreateB24ClientOptions {
  consoleLevel?: LogLevel
  restrictionParams?: ReturnType<typeof ParamsFactory.getBatchProcessing> | null
  extraHandlers?: Handler[]
}

export function createB24Client(
  name: string,
  options?: CreateB24ClientOptions
): {
  b24: ReturnType<typeof B24Hook.fromWebhookUrl>
  logger: ReturnType<typeof Logger.create>
  loggerForDebugB24: ReturnType<typeof Logger.create>
} {
  const consoleLevel = options?.consoleLevel ?? LogLevel.DEBUG
  const restrictionParams = options?.restrictionParams !== undefined ? options.restrictionParams : ParamsFactory.getBatchProcessing()
  const extraHandlers = options?.extraHandlers ?? []

  const logger = Logger.create(name)
  logger.pushHandler(new ConsoleV2Handler(consoleLevel, { useStyles: false }))
  for (const h of extraHandlers) {
    logger.pushHandler(h)
  }

  const hookPath = process.env.B24_HOOK ?? ''
  if (!hookPath.trim()) {
    throw new SdkError({
      code: 'PLAYGROUND_CLI_NO_HOOK',
      description: 'B24_HOOK environment variable is not set. Configure it in playgrounds/cli/.env',
      status: CLIENT_ERROR_STATUS
    })
  }

  const b24Options = restrictionParams !== null ? { restrictionParams } : {}
  const b24 = B24Hook.fromWebhookUrl(hookPath, b24Options)

  logger.info('Connected to Bitrix24', { target: b24.getTargetOrigin() })

  const loggerForDebugB24 = Logger.create('b24')
  loggerForDebugB24.pushHandler(new ConsoleV2Handler(LogLevel.ERROR, { useStyles: false }))
  for (const h of extraHandlers) {
    loggerForDebugB24.pushHandler(h)
  }

  b24.setLogger(loggerForDebugB24)

  return { b24, logger, loggerForDebugB24 }
}
