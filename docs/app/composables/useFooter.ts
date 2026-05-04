import type { NavigationMenuItem } from '@bitrix24/b24ui-nuxt'

export function useFooter() {
  const links: NavigationMenuItem[] = [
    // {
    //   label: 'Templates',
    //   to: '/templates/'
    // }
  ]

  return {
    links
  }
}
