import type { NavigationMenuItem } from '@bitrix24/b24ui-nuxt'
import { createSharedComposable } from '@vueuse/core'
import PlayLIcon from '@bitrix24/b24icons-vue/outline/PlayLIcon'
import DeveloperResourcesIcon from '@bitrix24/b24icons-vue/outline/DeveloperResourcesIcon'
import GitHubIcon from '@bitrix24/b24icons-vue/social/GitHubIcon'
import BarcodeIcon from '@bitrix24/b24icons-vue/outline/BarcodeIcon'
import EarthIcon from '@bitrix24/b24icons-vue/outline/EarthIcon'
import TerminalIcon from '@bitrix24/b24icons-vue/file-type/TerminalIcon'
import Bitrix24Icon from '@bitrix24/b24icons-vue/common-service/Bitrix24Icon'

const _useHeader = () => {
  const route = useRoute()

  const isNeedChangeTarget = ref(false)
  const tgLink = computed(() => {
    return (
      isNeedChangeTarget.value && (typeof window !== 'undefined' && window.navigator?.language.includes('ru'))
    )
      ? 'https://t.me/bitrix24apps'
      : 'https://t.me/b24_dev'
  })

  const b24DocsLink = computed(() => {
    return (
      isNeedChangeTarget.value && (typeof window !== 'undefined' && window.navigator?.language.includes('ru'))
    )
      ? 'https://apidocs.bitrix24.ru/'
      : 'https://apidocs.bitrix24.com/'
  })

  const desktopLinks = computed<NavigationMenuItem[]>(() => [
    {
      label: 'Docs',
      to: '/docs/getting-started/',
      active: route.path.startsWith('/docs/getting-started')
    },
    {
      label: 'Working',
      to: '/docs/working-with-the-rest-api/',
      active: route.path.startsWith('/docs/working-with-the-rest-api')
    },
    {
      label: 'Resources',
      type: 'trigger',
      children: [
        {
          label: 'B24 JsSdk',
          description: 'for using Bitrix24 REST API in applications',
          icon: DeveloperResourcesIcon,
          to: 'https://bitrix24.github.io/b24jssdk/',
          target: '_blank'
        },
        {
          label: 'B24 Icons',
          description: 'Design your applications in the Bitrix24 style.',
          icon: BarcodeIcon,
          to: 'https://bitrix24.github.io/b24icons/',
          target: '_blank'
        },
        {
          label: 'Community',
          description: 'Bitrix24 UI on Telegram',
          icon: EarthIcon,
          to: tgLink.value,
          target: '_blank'
        },
        {
          label: 'REST API',
          description: 'Bitrix24 REST API and Marketplace Applications',
          icon: Bitrix24Icon,
          to: b24DocsLink.value,
          target: '_blank'
        }
      ]
    }
  ])

  const mobileLinks = computed<NavigationMenuItem[]>(() => [
    {
      label: 'Get Started',
      to: '/docs/getting-started/',
      icon: PlayLIcon,
      active: route.path.startsWith('/docs/getting-started')
    },
    {
      label: 'Working',
      to: '/docs/working-with-the-rest-api/',
      icon: TerminalIcon,
      active: route.path.startsWith('/docs/working-with-the-rest-api')
    },
    {
      label: 'GitHub',
      to: 'https://github.com/bitrix24/b24jssdk',
      icon: GitHubIcon,
      target: '_blank',
      b24ui: {
        linkLeadingIcon: 'size-[20px] ms-[4px] me-[4px]'
      }
    }
  ])

  onMounted(() => {
    isNeedChangeTarget.value = true
  })

  return {
    desktopLinks,
    mobileLinks,
    b24DocsLink,
    tgLink
  }
}

export const useHeader = /* @__PURE__ */ createSharedComposable(_useHeader)
