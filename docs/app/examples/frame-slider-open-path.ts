import type { B24Frame } from '@bitrix24/b24jssdk'
import { LoggerFactory } from '@bitrix24/b24jssdk'

export async function Action_frameSliderOpenPath() {
  // region: start ////

  const _devMode = typeof import.meta !== 'undefined' && (import.meta.dev || import.meta.env?.DEV)
  const $logger = LoggerFactory.createForBrowser('Example:B24FrameSliderOpenPath', true)
  const $b24 = useB24().get() as B24Frame

  async function makeOpenSliderEditCurrency(currencyCode: string) {
    // Open the slider with the specified width
    const url = $b24.slider.getUrl(`/crm/configs/currency/edit/${currencyCode}/`)
    const response = await $b24.slider.openPath(
      $b24.slider.getUrl(`/crm/configs/currency/edit/${currencyCode}/`),
      950
    )

    $logger.debug('response', { url, response })

    // Check that it was a slider (not a new tab) and it was closed
    if (!response.isOpenAtNewWindow && response.isClose) {
      $logger.notice(`The slider is closed. Reinitializing the application...`)
      // Data update logic
    }
  }

  await makeOpenSliderEditCurrency('USD')
  // endregion: start ////
}
