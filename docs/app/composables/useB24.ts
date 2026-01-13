import type { B24FrameQueryParams, LoggerInterface } from '@bitrix24/b24jssdk'
import { ref } from 'vue'
import { B24Hook, B24Frame, LoggerFactory, Result, SdkError } from '@bitrix24/b24jssdk'

const sessionKey = 'b24Hook'
const isUseB24HookFromEnv = ref(false)

let $b24: undefined | B24Hook | B24Frame = undefined
const type = ref<'undefined' | 'B24Frame' | 'B24Hook'>('undefined')

export const useB24 = () => {
  const HOOK_PLACEHOLDER = 'https://your_domain.bitrix24.com/rest/1/webhook_code/'
  const HOOK_REPLACE_IN_EXAMPLE = 'useB24().get() as B24Hook || '

  const config = useRuntimeConfig()

  const b24Config = {}

  // @memo For Docs use full debug
  function buildLogger(loggerTitle?: string): LoggerInterface {
    return LoggerFactory.createForBrowserDevelopment(loggerTitle ?? 'JsSdk Docs')
  }

  function get() {
    return $b24
  }

  function set(newValue: unknown | B24Frame | string): Result {
    const result = new Result()
    if (
      typeof newValue !== 'undefined'
      && typeof $b24 === 'undefined'
    ) {
      if (newValue instanceof B24Frame) {
        $b24 = newValue
        nextTick(() => {
          type.value = 'B24Frame'
        })
      } else if (
        typeof newValue === 'string'
        && newValue.length > 0
      ) {
        sessionStorage.setItem(sessionKey, newValue)
        try {
          $b24 = B24Hook.fromWebhookUrl(newValue, b24Config)
          // @todo uncomment this
          // $b24.offClientSideWarning()
          nextTick(() => {
            type.value = 'B24Hook'
          })
        } catch (error: any) {
          sessionStorage.setItem(sessionKey, '')
          return result.addError(error)
        }
      }
    } else if (
      typeof newValue === 'undefined'
    ) {
      sessionStorage.setItem(sessionKey, '')
      nextTick(() => {
        type.value = 'undefined'
      })
      $b24 = undefined
    }

    return result
  }

  async function init(): Promise<Result> {
    try {
      // try to detect by Frame Params
      const queryParams: B24FrameQueryParams = {
        DOMAIN: null,
        PROTOCOL: false,
        APP_SID: null,
        LANG: null
      }

      if (window.name) {
        const [domain, appSid] = window.name.split('|')
        queryParams.DOMAIN = domain
        queryParams.APP_SID = appSid
      }

      if (!queryParams.DOMAIN || !queryParams.APP_SID) {
        console.error('[docs] Unable to initialize Bitrix24Frame library!')
        throw new SdkError({
          code: 'JSSDK_CLIENT_SIDE_WARNING',
          description: 'Well done! Now paste this URL into the B24 app settings',
          status: 500
        })
      }

      // now init b24Frame
      const { $initializeB24Frame } = useNuxtApp()
      return set(await $initializeB24Frame(b24Config))
    } catch {
      // set(undefined)
    }

    if (typeof get() === 'undefined') {
      // try to detect by env variable
      if (
        typeof config.public.b24Hook === 'string'
        && config.public.b24Hook.length > 0
      ) {
        isUseB24HookFromEnv.value = true
        sessionStorage.setItem(sessionKey, config.public.b24Hook)
      }

      // Checking sessionStorage when loading
      const storedHook = sessionStorage.getItem(sessionKey)
      if (
        typeof storedHook === 'string'
        && storedHook.length > 0
      ) {
        // now init b24Hook
        return set(storedHook)
      }
    }

    return new Result()
  }

  function isHookFromEnv() {
    return isUseB24HookFromEnv.value
  }

  function isFrame() {
    return get() instanceof B24Frame
  }

  function isInit() {
    return type.value !== 'undefined'
  }

  function targetOrigin() {
    return get()?.getTargetOrigin() || '?'
  }

  function removeHookFromSessionStorage() {
    set(undefined)
  }

  function prepareCode(code: string): string {
    return code.replace(HOOK_REPLACE_IN_EXAMPLE, '')
  }

  return {
    HOOK_PLACEHOLDER,
    buildLogger,
    init,
    get,
    set,
    isHookFromEnv,
    isFrame,
    isInit,
    targetOrigin,
    removeHookFromSessionStorage,
    prepareCode
  }
}
