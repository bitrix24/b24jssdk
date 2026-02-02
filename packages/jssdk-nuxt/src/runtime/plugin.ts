import { initializeB24Frame } from '@bitrix24/b24jssdk'
import { defineNuxtPlugin } from '#app'

/**
 * Connecting api.bitrix24 (singleton)
 */
export default defineNuxtPlugin((_nuxtApp) => {
  /**
   * @memo skip Plugin on server ////
   */
  if (import.meta.server) {
    return
  }

  return {
    provide: {
      initializeB24Frame
    }
  }
})
