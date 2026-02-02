<script setup lang="ts">
import type { ProgressProps } from '@bitrix24/b24ui-nuxt'
import type { TypeB24, LoggerInterface } from '@bitrix24/b24jssdk'
import { B24Frame, SdkError } from '@bitrix24/b24jssdk'
import { ref, onMounted } from 'vue'
import Market1Icon from '@bitrix24/b24icons-vue/main/Market1Icon'

// region Install ////
export interface IStep {
  action: (b24: TypeB24) => Promise<void>
  caption?: string
  data?: Record<string, any>
}
// endregion ////

useHead({
  title: 'Application Installation'
})

// region Init ////
const isShowDebug = ref(false)

// const config = useRuntimeConfig()
// const appUrl = withoutTrailingSlash(config.public.siteUrl)

let $b24: undefined | TypeB24 = undefined
let $logger: undefined | LoggerInterface = undefined

const confetti = useConfetti()

const progressColor = ref<ProgressProps['color']>('air-primary')
const progressValue = ref<null | number>(null)
// endregion ////

// region Steps ////
const stepCode = ref<string>('init' as const)
const steps = ref<Record<string, IStep>>({
  /** Make init */
  init: {
    caption: 'Please wait a moment...',
    action: makeInit
  },

  /** Some example */
  demo: {
    caption: 'Examples...',
    action: async () => {
      return sleepAction(1000)
    }
  },

  /** Registering onAppInstall | onAppUninstall */
  // events: {
  //   caption: 'Events...',
  //   action: async (b24: TypeB24) => {
  //     await b24.callBatch([
  //       {
  //         method: 'event.unbind',
  //         params: {
  //           event: 'ONAPPINSTALL',
  //           handler: `${appUrl}/api/event/onAppInstall`
  //         }
  //       },
  //       {
  //         method: 'event.unbind',
  //         params: {
  //           event: 'ONAPPUNINSTALL',
  //           handler: `${appUrl}/api/event/onAppUninstall`
  //         }
  //       },
  //       {
  //         method: 'event.bind',
  //         params: {
  //           event: 'ONAPPINSTALL',
  //           handler: `${appUrl}/api/event/onAppInstall`
  //         }
  //       },
  //       {
  //         method: 'event.bind',
  //         params: {
  //           event: 'ONAPPUNINSTALL',
  //           handler: `${appUrl}/api/event/onAppUninstall`
  //         }
  //       }
  //     ])
  //   }
  // },

  /** Registering widgets... */
  // placement: {
  //   caption: 'Widgets...',
  //   action: async (b24: TypeB24) => {
  //     const key = {
  //       placement: 'CRM_DEAL_DETAIL_TAB',
  //       handler: `${appUrl}/handler/placement-crm-deal-detail-tab`
  //     }
  //     const exists = (steps.value.init?.data?.placementList as { placement: string, handler: string }[])
  //       .some(item => item.placement === key.placement && item.handler === key.handler)
  //
  //     if (exists) {
  //       await b24.callBatch([
  //         {
  //           method: 'placement.unbind',
  //           params: {
  //             PLACEMENT: key.placement
  //           }
  //         },
  //         {
  //           method: 'placement.bind',
  //           params: {
  //             PLACEMENT: key.placement,
  //             HANDLER: key.handler,
  //             TITLE: '[demo] Some Tab',
  //             OPTIONS: {
  //               errorHandlerUrl: `${appUrl}/handler/background-some-problem`
  //             }
  //           }
  //         }
  //       ])
  //
  //       return
  //     }
  //
  //     await b24.callBatch([
  //       {
  //         method: 'placement.bind',
  //         params: {
  //           PLACEMENT: key.placement,
  //           HANDLER: key.handler,
  //           TITLE: '[demo] Some Tab',
  //           OPTIONS: {
  //             errorHandlerUrl: `${appUrl}/handler/background-some-problem`
  //           }
  //         }
  //       }
  //     ])
  //   }
  // },

  /** Registering User fields */
  // userFields: {
  //   caption: 'Uf...',
  //   action: async (b24: TypeB24) => {
  //     const typeId = `some_type_${import.meta.dev ? 'dev' : 'prod'}`
  //
  //     const exists = (steps.value.init?.data?.userFieldTypeList as { USER_TYPE_ID: string }[])
  //       .some(item => item.USER_TYPE_ID === typeId)
  //
  //     if (exists) {
  //       await b24.callBatch([
  //         {
  //           method: 'userfieldtype.update',
  //           params: {
  //             USER_TYPE_ID: typeId,
  //             HANDLER: `${appUrl}/handler/uf.demo`,
  //             TITLE: `[${import.meta.dev ? 'dev' : 'prod'}] Some Type`,
  //             DESCRIPTION: `Some Description`,
  //             OPTIONS: {
  //               height: 105
  //             }
  //           }
  //         }
  //       ], false)
  //
  //       return
  //     }
  //
  //     await b24.callBatch([
  //       {
  //         method: 'userfieldtype.add',
  //         params: {
  //           USER_TYPE_ID: typeId,
  //           HANDLER: `${appUrl}/handler/uf.demo`,
  //           TITLE: `[${import.meta.dev ? 'dev' : 'prod'}] Some Type`,
  //           DESCRIPTION: `Some Description`,
  //           OPTIONS: {
  //             height: 105
  //           }
  //         }
  //       }
  //     ], false)
  //   }
  // },

  /** Some actions for crm */
  crm: {
    caption: 'CRM...',
    action: async () => {
      /** Example: How to set some data between steps */
      if (steps.value.crm) {
        steps.value.crm.data = {
          par31: 'val31',
          par32: 'val32'
        }
      }
      return sleepAction()
    }
  },

  /**
   * Example: Example: Performing some actions on the server-side
   * You need to modify this function to specify `apiUrl` and `/api/install`
   * Or delete it if you don't use the server part.
   */
  // serverSide: {
  //   caption: 'Server-side scripts...',
  //   action: async (b24: TypeB24) => {
  //     if (!(b24 instanceof B24Frame)) {
  //       throw new TypeError('$24 instanceof B24Frame')
  //     }
  //
  //     const authData = b24.auth.getAuthData()
  //
  //     if (authData === false) {
  //       throw new Error('Some problem with auth. See App logic')
  //     }
  //
  //     const $api = $fetch.create({
  //       baseURL: withoutTrailingSlash(config.public.siteUrl),
  //       headers: { 'Content-Type': 'application/json' }
  //     })
  //
  //     await $api('/api/install', {
  //       method: 'POST',
  //       body: JSON.stringify({
  //         DOMAIN: withoutTrailingSlash(authData.domain).replace('https://', '').replace('http://', ''),
  //         PROTOCOL: authData.domain.includes('https://') ? 1 : 0,
  //         LICENSE: steps.value.init?.data?.appInfo.LICENSE,
  //         LICENSE_FAMILY: steps.value.init?.data?.appInfo.LICENSE_FAMILY,
  //         LANG: b24.getLang(),
  //         APP_SID: b24.getAppSid(),
  //         AUTH_ID: authData.access_token,
  //         AUTH_EXPIRES: authData.expires_in,
  //         REFRESH_ID: authData.refresh_token,
  //         REFRESH_TOKEN: authData.refresh_token,
  //         member_id: authData.member_id,
  //         user_id: Number(steps.value.init?.data?.profile.ID),
  //         status: steps.value.init?.data?.appInfo.STATUS,
  //         appVersion: Number(steps.value.init?.data?.appInfo.VERSION),
  //         appCode: steps.value.init?.data?.appInfo.CODE,
  //         appId: Number(steps.value.init?.data?.appInfo.ID),
  //         PLACEMENT: b24.placement.title,
  //         PLACEMENT_OPTIONS: b24.placement.options
  //       })
  //     })
  //   }
  // },

  /** Make Finish actions */
  finish: {
    caption: 'Completion',
    action: makeFinish
  }
})
// endregion ////

// region Actions ////
async function makeInit(b24: TypeB24): Promise<void> {
  if (steps.value.init) {
    const response = await b24.actions.v2.batch.make({
      calls: {
        // appInfo: { method: 'app.info' },
        profile: { method: 'profile' },
        userFieldTypeList: { method: 'userfieldtype.list' },
        placementList: { method: 'placement.get' }
      },
      options: { isHaltOnError: false }
    })

    steps.value.init.data = response.getData() as {
      // appInfo: {
      //   ID: number
      //   CODE: string
      //   VERSION: string
      //   STATUS: string
      //   LICENSE: string
      //   LICENSE_FAMILY: string
      //   INSTALLED: boolean
      // }
      profile: {
        ID: number
        ADMIN: boolean
        LAST_NAME?: string
        NAME?: string
      }
      userFieldTypeList: {
        USER_TYPE_ID: string
        HANDLER: string
        TITLE: string
        DESCRIPTION: string
      }[]
      placementList: {
        placement: string
        userId: number
        handler: string
        options: any
        title: string
        description: string
      }[]
    }
  }
}

/**
 * Make finish actions
 * - confetti
 * - $b24.installFinish
 *
 * @memo There is no need to change this feature too much.
 */
async function makeFinish(b24: TypeB24): Promise<void> {
  progressColor.value = 'air-primary-success'
  progressValue.value = 100

  confetti.fire()
  await sleepAction(3000)

  if (
    b24 instanceof B24Frame
    && b24.isInstallMode
  ) {
    await b24.installFinish()
  }
}

const stepsData = computed(() => {
  return Object.entries(steps.value).map(([index, row]) => {
    return {
      step: index,
      data: row?.data
    }
  })
})

/**
 * Pause on xxx milliseconds
 *
 * @return {Promise<void>}
 */
async function sleepAction(timeout: number = 1000): Promise<void> {
  return new Promise<void>(resolve => setTimeout(resolve, timeout))
}
// endregion ////

// region Lifecycle Hooks ////
onMounted(async () => {
  const b24Instance = useB24()

  $b24 = b24Instance.get()
  $logger = b24Instance.buildLogger()

  $logger.notice('Hi from install page')

  try {
    if (!$b24) {
      throw new Error('$b24 not initialized')
    }

    if ($b24 instanceof B24Frame) {
      await $b24.parent.setTitle('Application Installation')
    }

    for (const [key, step] of Object.entries(steps.value)) {
      stepCode.value = key
      await step.action($b24)
    }
  } catch (error: any) {
    $logger!.error('some error', { error })
    let statusMessage = 'Error'
    let message = ''
    let statusCode = 404

    if (error instanceof SdkError) {
      statusCode = error.status
      statusMessage = error.name
      message = `${error.message}`
    } else if (error instanceof Error) {
      message = error.message
    } else {
      message = error as string
    }

    showError({
      status: statusCode,
      statusText: statusMessage,
      message,
      cause: error
    })
  }
})
// endregion ////
</script>

<template>
  <div class="mx-3 flex flex-col items-center justify-center gap-1 h-dvh">
    <!-- Logo: Change if necessary. -->
    <Market1Icon
      class="size-[208px]"
      :class="[
        stepCode === 'finish' ? 'text-(--ui-color-accent-main-success)' : 'text-(--ui-color-accent-soft-green-1)'
      ]"
    />

    <B24Progress
      v-model="progressValue"
      size="xs"
      animation="elastic"
      :color="progressColor"
      class="w-1/2 sm:w-1/3"
    />
    <div class="mt-6 flex flex-col items-center justify-center gap-2">
      <ProseH1 class="text-nowrap mb-0">
        Application Installation
      </ProseH1>
      <ProseP small accent="less">
        {{ steps[stepCode]?.caption || '...' }}
      </ProseP>
    </div>

    <ProsePre v-if="isShowDebug">
      {{ stepsData }}
    </ProsePre>
  </div>
</template>
