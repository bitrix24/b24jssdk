import type { B24Frame } from '@bitrix24/b24jssdk'
import { LoggerFactory } from '@bitrix24/b24jssdk'

export async function Action_frameSliderAppPageOpen() {
  // region: start ////

  const _devMode = typeof import.meta !== 'undefined' && (import.meta.dev || import.meta.env?.DEV)
  const $logger = LoggerFactory.createForBrowser('Example:B24FrameSliderOpenPath', true)
  const $b24 = useB24().get() as B24Frame

  async function openAppPage() {
    const response = await $b24.slider.openSliderAppPage(
      {
        // The 'place' parameter will be available in placement
        // It should be processed in middleware to redirect to the desired route.
        place: 'app.place',
        bx24_width: 650,
        bx24_title: 'Page title in the browser'
      }
    )

    $logger.debug('response', { response })
  }

  await openAppPage()
  // endregion: start ////
}
