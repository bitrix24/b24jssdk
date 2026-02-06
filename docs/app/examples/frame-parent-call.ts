import type { B24Frame } from '@bitrix24/b24jssdk'
import { Text, LoggerFactory, Logger, ConsoleV2Handler, LogLevel } from '@bitrix24/b24jssdk'

export async function Action_frameParentCall() {
  // region: start ////

  const _devMode = typeof import.meta !== 'undefined' && (import.meta.dev || import.meta.env?.DEV)
  const $logger = LoggerFactory.createForBrowser('Example:B24FrameParentCall', true)
  const $b24 = useB24().get() as B24Frame

  const loggerForDebugB24 = Logger.create('b24')
  const handlerForDebugB24 = new ConsoleV2Handler(LogLevel.DEBUG, { useStyles: true })
  loggerForDebugB24.pushHandler(handlerForDebugB24)

  $b24.setLogger(loggerForDebugB24)

  const response = await $b24.parent.message.send(
    'setTitle',
    {
      title: 'Text for insertion',
      requestId: Text.getUuidRfc4122(),
      isSafely: true,
      safelyTime: 1500
    }
  )

  $logger.debug('parent response', {
    response
  })
  // endregion: start ////
}
