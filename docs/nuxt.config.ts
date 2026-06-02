import { createResolver } from '@nuxt/kit'
import pkg from '../package.json'
import { withoutTrailingSlash } from 'ufo'

const { resolve } = createResolver(import.meta.url)

const pages = [
  // region getting-started ////
  '/docs/getting-started/',
  '/docs/getting-started/installation/vue/',
  '/docs/getting-started/installation/nuxt/',
  '/docs/getting-started/installation/react/',
  '/docs/getting-started/installation/nodejs/',
  '/docs/getting-started/installation/umd/',
  '/docs/getting-started/migration/v1/',
  '/docs/getting-started/ai/llms-txt/',
  // endregion ////
  // region working-with-the-rest-api ////
  '/docs/working-with-the-rest-api/',
  '/docs/working-with-the-rest-api/call-rest-api-ver2/',
  '/docs/working-with-the-rest-api/call-rest-api-ver3/',
  '/docs/working-with-the-rest-api/call-list-rest-api-ver2/',
  '/docs/working-with-the-rest-api/call-list-rest-api-ver3/',
  '/docs/working-with-the-rest-api/fetch-list-rest-api-ver2/',
  '/docs/working-with-the-rest-api/fetch-list-rest-api-ver3/',
  '/docs/working-with-the-rest-api/batch-rest-api-ver2/',
  '/docs/working-with-the-rest-api/batch-rest-api-ver3/',
  '/docs/working-with-the-rest-api/batch-by-chunk-rest-api-ver2/',
  '/docs/working-with-the-rest-api/batch-by-chunk-rest-api-ver3/',
  '/docs/working-with-the-rest-api/choosing-the-right-method/',
  '/docs/working-with-the-rest-api/errors/',
  '/docs/working-with-the-rest-api/tools-health-check/',
  '/docs/working-with-the-rest-api/tools-ping/',
  '/docs/working-with-the-rest-api/logger/',
  '/docs/working-with-the-rest-api/logger-telegram/',
  '/docs/working-with-the-rest-api/limiters/',
  '/docs/working-with-the-rest-api/logging/',
  '/docs/working-with-the-rest-api/frame/',
  '/docs/working-with-the-rest-api/frame-auth/',
  '/docs/working-with-the-rest-api/frame-dialog/',
  '/docs/working-with-the-rest-api/frame-initialize-b24-frame/',
  '/docs/working-with-the-rest-api/frame-parent/',
  '/docs/working-with-the-rest-api/frame-placement/',
  '/docs/working-with-the-rest-api/frame-options/',
  '/docs/working-with-the-rest-api/frame-slider/',
  // endregion ////
  // region examples ////
  '/docs/examples/',
  '/docs/examples/dashboard-deals-csv/',
  '/docs/examples/frame-app-skeleton/',
  '/docs/examples/webhook-cli-node/',
  '/docs/examples/bulk-update-deals/',
  '/docs/examples/pull-subscribe-frame/',
  '/docs/examples/crm-analytics/',
  '/docs/examples/mass-messaging/',
  '/docs/examples/task-automation/',
  '/docs/examples/erp-sync/',
  '/docs/examples/disk-files/',
  '/docs/examples/telegram-bot/',
  '/docs/examples/webhook-handler/',
  '/docs/examples/ai-assistant/',
  '/docs/examples/web-search-llm/',
  '/docs/examples/error-handling/',
  '/docs/examples/event-registration/',
  '/docs/examples/oauth-install/'
  // endregion ////
]

/**
 * @memo need add for iframe examples
 */
const pagesFrameExamples: string[] = [
  // '/examples/sidebar-layout-example/',
]

const pagesService = [
  '/404.html',
  '/sitemap.xml',
  '/sitemap.md'
]

const extraAllowedHosts = (process?.env.NUXT_ALLOWED_HOSTS?.split(',').map((s: string) => s.trim()).filter(Boolean)) ?? []

const prodUrl = process?.env.NUXT_PUBLIC_SITE_URL ?? ''
const baseUrl = process?.env.NUXT_PUBLIC_BASE_URL ?? ''
const canonicalUrl = process?.env.NUXT_PUBLIC_CANONICAL_URL ?? ''
const gitUrl = process?.env.NUXT_PUBLIC_GIT_URL ?? ''

export default defineNuxtConfig({
  modules: [
    // '@bitrix24/b24jssdk-nuxt',
    '../packages/jssdk-nuxt/src/module',
    '@bitrix24/b24ui-nuxt',
    './modules/bx-assistant',
    '@nuxt/content',
    // '@nuxt/image',
    '@nuxt/a11y',
    '@nuxtjs/mcp-toolkit',
    // 'nuxt-component-meta',
    'nuxt-llms',
    // @memo off this
    'nuxt-og-image',
    'motion-v/nuxt',
    'nuxt-schema-org'
  ],

  ssr: true,

  devtools: {
    enabled: false
  },

  app: {
    baseURL: `${baseUrl}/`,
    buildAssetsDir: '/_nuxt/',
    head: {
      link: [
        { rel: 'icon', type: 'image/x-icon', href: `${baseUrl}/favicon.ico?v=2` }
      ],
      htmlAttrs: { class: 'edge-dark' }
    },
    rootAttrs: { 'data-vaul-drawer-wrapper': '' }
  },

  css: ['~/assets/css/main.css'],

  site: {
    name: 'Bitrix24 JS SDK'
  },

  content: {
    build: {
      markdown: {
        highlight: {
          langs: ['bash', 'ts', 'typescript', 'diff', 'vue', 'tsx', 'jsx', 'json', 'yml', 'css', 'mdc', 'blade', 'edge']
        }
      }
    }
  },

  mdc: {
    highlight: {
      noApiRoute: false
    }
  },

  /**
   * @memo this will be overwritten from .env or Docker_*
   * @see https://nuxt.com/docs/guide/going-further/runtime-config#example
   */
  runtimeConfig: {
    public: {
      // @deprecated
      // useAI: false,
      useTabB24frame: false,
      version: pkg.version,
      siteUrl: prodUrl,
      baseUrl,
      canonicalUrl,
      gitUrl
    }
  },

  // @todo add more redirects
  routeRules: {
    // Agent discovery Link headers on the homepage (RFC 8288, RFC 9727)
    '/': {
      headers: {
        Link: [
          '</sitemap.xml>; rel="sitemap"; type="application/xml"',
          '</sitemap.md>; rel="describedby"; type="text/markdown"',
          '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"',
          '</docs>; rel="service-doc"; type="text/html"',
          '</llms.txt>; rel="describedby"; type="text/plain"',
          '</llms-full.txt>; rel="describedby"; type="text/plain"',
          '</>; rel="alternate"; type="text/markdown"'
        ].join(', '),
        Vary: 'Accept, User-Agent'
      }
    },
    // @memo But at GitHub Pages we use /raw
    '/docs/**': { headers: { Vary: 'Accept, User-Agent' } },
    // Our markdown rewrites (see `modules/md-rewrite.ts`) internally route
    // `/` and `/docs/**` to `/raw/**`, so the `Vary` rules above no longer
    // match the rewritten path. This rule re-applies it on the actual
    // served response.
    '/raw/**': { headers: { Vary: 'Accept, User-Agent' } },
    // security headers for API endpoints
    '/api/**': {
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Cache-Control': 'no-store'
      }
    },
    // redirects - default root pages
    '/docs/': { redirect: '/docs/getting-started/', prerender: false },
    '/docs/getting-started/migration/': { redirect: '/docs/getting-started/migration/v1/', prerender: false },
    '/docs/getting-started/installation/': { redirect: '/docs/getting-started/installation/vue/', prerender: false },
    '/docs/getting-started/ai/': { redirect: '/docs/getting-started/ai/llms-txt/', prerender: false }
  },

  compatibilityDate: '2026-01-14',

  nitro: {
    publicAssets: [{
      dir: resolve('../skills'),
      baseURL: '/.well-known/skills',
      maxAge: 60 * 60 * 24
    }],
    prerender: {
      routes: [
        ...pages.map((page: string) => `${withoutTrailingSlash(`/raw${page}`)}.md`),
        ...pagesFrameExamples,
        ...pagesService
      ],
      crawlLinks: true,
      // false = flat files (foo.html, not foo/index.html); GitHub Pages serves
      // these at /foo (no trailing slash). All navigation links must use
      // withoutTrailingSlash — do NOT change to true without updating useNavigation.ts.
      autoSubfolderIndex: false
    }
  },

  vite: {
    server: {
      // Fix: "Blocked request. This host is not allowed" when using tunnels like ngrok
      allowedHosts: [...extraAllowedHosts]
    },
    optimizeDeps: {
      // Vite pre-bundles these on dev start. Keep the list deduped and
      // alphabetically sorted — duplicates here cost cold-start time and
      // make diff review harder.
      include: [
        '@ai-sdk/vue',
        '@bitrix24/b24icons-vue/actions/BrushIcon',
        '@bitrix24/b24icons-vue/button/PageIcon',
        '@bitrix24/b24icons-vue/common-service/Bitrix24Icon',
        '@bitrix24/b24icons-vue/common-service/CodeIcon',
        '@bitrix24/b24icons-vue/crm/FormIcon',
        '@bitrix24/b24icons-vue/crm/ItemIcon',
        '@bitrix24/b24icons-vue/editor/EncloseTextInCodeTagIcon',
        '@bitrix24/b24icons-vue/file-type/MarkdownIcon',
        '@bitrix24/b24icons-vue/file-type/NuxtIcon',
        '@bitrix24/b24icons-vue/file-type/TerminalIcon',
        '@bitrix24/b24icons-vue/main/CloudErrorIcon',
        '@bitrix24/b24icons-vue/main/CopilotAi2Icon',
        '@bitrix24/b24icons-vue/main/EarthLanguageIcon',
        '@bitrix24/b24icons-vue/main/EditPencilIcon',
        '@bitrix24/b24icons-vue/outline/ALetterIcon',
        '@bitrix24/b24icons-vue/outline/AiStarsIcon',
        '@bitrix24/b24icons-vue/outline/AlertIcon',
        '@bitrix24/b24icons-vue/outline/BarcodeIcon',
        '@bitrix24/b24icons-vue/outline/BrowserIcon',
        '@bitrix24/b24icons-vue/outline/BulletedListIcon',
        '@bitrix24/b24icons-vue/outline/CircleCheckIcon',
        '@bitrix24/b24icons-vue/outline/CloseChatIcon',
        '@bitrix24/b24icons-vue/outline/ContrastIcon',
        '@bitrix24/b24icons-vue/outline/CopyIcon',
        '@bitrix24/b24icons-vue/outline/DemonstrationOnIcon',
        '@bitrix24/b24icons-vue/outline/DesignIcon',
        '@bitrix24/b24icons-vue/outline/DeveloperResourcesIcon',
        '@bitrix24/b24icons-vue/outline/EarthIcon',
        '@bitrix24/b24icons-vue/outline/FavoriteIcon',
        '@bitrix24/b24icons-vue/outline/FileIcon',
        '@bitrix24/b24icons-vue/outline/InfoCircleIcon',
        '@bitrix24/b24icons-vue/outline/LayersIcon',
        '@bitrix24/b24icons-vue/outline/LinkIcon',
        '@bitrix24/b24icons-vue/outline/MoonIcon',
        '@bitrix24/b24icons-vue/outline/MoreMIcon',
        '@bitrix24/b24icons-vue/outline/OpenChatIcon',
        '@bitrix24/b24icons-vue/outline/PlayLIcon',
        '@bitrix24/b24icons-vue/outline/RobotIcon',
        '@bitrix24/b24icons-vue/outline/RocketIcon',
        '@bitrix24/b24icons-vue/outline/SearchIcon',
        '@bitrix24/b24icons-vue/outline/SunIcon',
        '@bitrix24/b24icons-vue/outline/TaskListIcon',
        '@bitrix24/b24icons-vue/outline/TelegramIcon',
        '@bitrix24/b24icons-vue/outline/TrashcanIcon',
        '@bitrix24/b24icons-vue/outline/UndoIcon',
        '@bitrix24/b24icons-vue/social/GitHubIcon',
        '@bitrix24/b24icons-vue/social/MdnwebdocsIcon',
        '@bitrix24/b24icons-vue/solid/EnterpriseIcon',
        '@comark/vue',
        '@comark/vue/plugins/highlight',
        '@vueuse/core',
        'ai',
        'axios',
        'luxon',
        'prettier',
        'qs-esm',
        'tailwindcss/colors'
      ]
    }
  },

  // @memo not use this
  // image: {
  //   format: ['webp', 'jpeg', 'jpg', 'png', 'svg'],
  //   provider: 'ipx'
  // },

  llms: {
    domain: `${prodUrl}${baseUrl}`,
    title: 'Bitrix24 JS SDK',
    description: 'A comprehensive JavaScript library integrated with Bitrix24, providing a powerful and convenient toolkit for interacting with the Bitrix24 REST API, enabling secure and efficient management of data and processes in web application development.',
    // Disable content module's built-in raw markdown route - we use our own custom handler
    // in server/routes/raw/[...slug].md.get.ts that applies MDC transformations
    contentRawMarkdown: false,
    full: {
      title: 'Bitrix24 JS SDK Full Documentation',
      description: 'This is the full documentation for Bitrix24 JS SDK. It includes all the Markdown files written with the MDC syntax.'
    },
    sections: [
      {
        title: 'Installation (Nuxt, Vue, React, Node.js, UMD)',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '/docs/getting-started/installation%' }
        ]
      },
      {
        title: 'Getting Started',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '/docs/getting-started%' }
        ]
      },
      {
        title: 'Working',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '/docs/working-with-the-rest-api/%' }
        ]
      }
      // {
      //   title: 'Examples',
      //   contentCollection: 'docs',
      //   contentFilters: [
      //     { field: 'path', operator: 'LIKE', value: '/docs/examples/%' }
      //   ]
      // }
    ],
    notes: [
      'The content is automatically generated from the same source as the official documentation.'
    ]
  },

  mcp: {
    // eng-only: set NUXT_MCP_ENABLED=true on the English deployment
    // import.meta.dev kept so the module is generated during `nuxt prepare` (needed for typecheck)
    enabled: import.meta.dev || process.env.NUXT_MCP_ENABLED === 'true',
    name: 'Bitrix24 JS SDK',
    version: '1.0.0',
    route: `/mcp/`, // ${baseUrl}
    browserRedirect: '/docs/getting-started/' // '/docs/getting-started/ai/mcp'
  },

  ogImage: {
    zeroRuntime: true,
    security: {
      renderTimeout: 60000
    }
  },

  schemaOrg: {
    identity: {
      type: 'Organization',
      name: 'Bitrix24',
      logo: '/b24-logo.svg',
      sameAs: [
        'https://github.com/bitrix24'
      ]
    }
  }
})
