import type { B24Frame } from '@bitrix24/b24jssdk'

export async function Action_frameSliderAppPageClose() {
  // region: start ////
  const $b24 = useB24().get() as B24Frame

  async function closePage() {
    return $b24.slider.closeSliderAppPage()
  }

  closePage()
  // endregion: start ////
}
