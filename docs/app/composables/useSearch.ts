import PlayLIcon from '@bitrix24/b24icons-vue/outline/PlayLIcon'
import DeveloperResourcesIcon from '@bitrix24/b24icons-vue/outline/DeveloperResourcesIcon'
// import FormIcon from '@bitrix24/b24icons-vue/outline/FormIcon'
// import DemonstrationOnIcon from '@bitrix24/b24icons-vue/outline/DemonstrationOnIcon'
import RobotIcon from '@bitrix24/b24icons-vue/outline/RobotIcon'
import GitHubIcon from '@bitrix24/b24icons-vue/social/GitHubIcon'

export function useSearch() {
  const route = useRoute()
  // const { frameworks } = useFrameworks()
  const { track } = useAnalytics()

  const config = useRuntimeConfig()
  const { open: openAIChat } = useAIChat()
  const { open: openContentSearch } = useContentSearch()

  const fullscreen = ref(false)
  const searchTerm = ref('')

  function onSelect(e: any) {
    e.preventDefault()

    track('AI Chat Opened', { hasSearchTerm: !!searchTerm.value })

    openContentSearch.value = false
    openAIChat(searchTerm.value, true)
  }

  const links = computed(() => [
    ...(
      config.public.useAI
        ? [
            !searchTerm.value && {
              label: 'Ask AI',
              description: 'Ask the AI assistant powered by our custom MCP server for help.',
              icon: RobotIcon,
              b24ui: {
                itemLeadingIcon: 'text-(--ui-color-accent-main-primary) group-data-highlighted:not-group-data-disabled:text-(--ui-color-copilot-accent-primary)'
              },
              onSelect
            }
          ]
        : []
    ),
    {
      label: 'Get started',
      description: 'Learn how to get started with Bitrix24 JS SDK.',
      icon: PlayLIcon,
      to: '/docs/getting-started/',
      active: route.path.startsWith('/docs/getting-started')
    },
    {
      label: 'Working',
      description: 'Introduction to working with Bitrix24 REST API',
      icon: DeveloperResourcesIcon,
      to: '/docs/working-with-the-rest-api/',
      active: route.path.startsWith('/docs/working-with-the-rest-api')
    },
    // {
    //   label: 'Examples',
    //   icon: FormIcon,
    //   description: 'Explore examples of working with the Bitrix24 JS SDK..',
    //   to: '/docs/examples/',
    //   active: route.path.startsWith('/docs/examples')
    // },
    {
      label: 'GitHub',
      description: 'Check out the Bitrix24 JS SDK repository and follow development on GitHub.',
      icon: GitHubIcon,
      to: 'https://github.com/bitrix24/b24ui',
      target: '_blank'
    }
  ].filter(link => !!link))

  const groups = computed(() => [
    ...(
      config.public.useAI
        ? [{
            id: 'ai',
            label: 'AI',
            ignoreFilter: true,
            items: searchTerm.value
              ? [{
                  label: `Ask AI for “${searchTerm.value}”`,
                  icon: RobotIcon,
                  b24ui: {
                    itemLeadingIcon: 'text-(--ui-color-accent-main-primary) group-data-highlighted:not-group-data-disabled:text-(--ui-color-copilot-accent-primary)'
                  },
                  onSelect
                }]
              : []
          }]
        : []
    )
  ])

  return {
    links,
    groups,
    fullscreen,
    searchTerm
  }
}
