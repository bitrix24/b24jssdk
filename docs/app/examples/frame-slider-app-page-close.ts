import type { B24Frame } from '@bitrix24/b24jssdk'

export async function Action_frameSliderAppPageClose() {
  // region: start ////
  const $b24 = useB24().get() as B24Frame

  function closePage() {
    // Never settles; the portal's close button is safer (#486)
    $b24.slider.closeSliderAppPage().catch(() => {})
  }

  closePage()
  // endregion: start ////
}
