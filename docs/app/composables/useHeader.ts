import type { NavigationMenuItem } from '@bitrix24/b24ui-nuxt'
import PlayLIcon from '@bitrix24/b24icons-vue/outline/PlayLIcon'
import DemonstrationOnIcon from '@bitrix24/b24icons-vue/outline/DemonstrationOnIcon'
import GitHubIcon from '@bitrix24/b24icons-vue/social/GitHubIcon'

export function useHeader() {
  const route = useRoute()

  const desktopLinks = computed<NavigationMenuItem[]>(() => [
    {
      label: 'Docs',
      to: '/docs/getting-started/',
      active: route.path.startsWith('/docs/getting-started')
    },
    {
      label: 'Icons',
      to: '/icons/',
      active: route.path.startsWith('/icons')
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
      label: 'Icons',
      to: '/icons/',
      icon: DemonstrationOnIcon,
      active: route.path.startsWith('/icons')
    },
    {
      label: 'GitHub',
      to: 'https://github.com/bitrix24/b24icons',
      icon: GitHubIcon,
      target: '_blank'
    }
  ])

  return {
    desktopLinks,
    mobileLinks
  }
}
