import type { NavigationMenuItem } from '@bitrix24/b24ui-nuxt'
import PlayLIcon from '@bitrix24/b24icons-vue/outline/PlayLIcon'
// import DeveloperResourcesIcon from '@bitrix24/b24icons-vue/outline/DeveloperResourcesIcon'
// import ViewmodeCodeIcon from '@bitrix24/b24icons-vue/editor/ViewmodeCodeIcon'
// import FormattingIcon from '@bitrix24/b24icons-vue/editor/FormattingIcon'
import FormIcon from '@bitrix24/b24icons-vue/outline/FormIcon'
import TerminalIcon from '@bitrix24/b24icons-vue/file-type/TerminalIcon'
// import DemonstrationOnIcon from '@bitrix24/b24icons-vue/outline/DemonstrationOnIcon'
import GitHubIcon from '@bitrix24/b24icons-vue/social/GitHubIcon'

export function useHeader() {
  const route = useRoute()

  const desktopLinks = computed<NavigationMenuItem[]>(() => [
    {
      label: 'Get started',
      to: '/docs/getting-started/',
      active: route.path.startsWith('/docs/getting-started')
    },
    {
      label: 'Working',
      to: '/docs/working-with-the-rest-api/',
      active: route.path.startsWith('/docs/working-with-the-rest-api')
    },
    {
      label: 'Examples',
      to: '/docs/examples/',
      active: route.path.startsWith('/docs/examples')
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
      label: 'Examples',
      to: '/docs/examples/',
      icon: FormIcon,
      active: route.path.startsWith('/docs/examples')
    },
    {
      label: 'GitHub',
      to: 'https://github.com/bitrix24/b24jssdk',
      icon: GitHubIcon,
      target: '_blank'
    }
  ])

  return {
    desktopLinks,
    mobileLinks
  }
}
