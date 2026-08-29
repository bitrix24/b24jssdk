import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createResolver } from '@nuxt/kit'
import pkg from '../package.json'
import { withoutTrailingSlash } from 'ufo'

const { resolve } = createResolver(import.meta.url)

// Prerender list is derived from the filesystem (#96) so a new page can't be
// forgotten and silently 404 on the /raw/<page>.md path (crawlLinks only finds
// HTML). Each content page becomes one route, slugged the way Nuxt Content builds
// the URL: strip the `NN.` nav-order prefix from every path segment, and map a
// directory's `index` file to the directory route. The list was hand-maintained
// before and drifted twice (#95, #165).
function buildDocsPages(): string[] {
  const root = resolve('content/docs')
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        return walk(full)
      }
      return entry.name.endsWith('.md') ? [full] : []
    })
  return walk(root)
    .map((file) => {
      const segments = file
        .slice(root.length + 1)
        .replace(/\.md$/, '')
        .split(/[/\\]/)
        .map(segment => segment.replace(/^\d+\./, ''))
      if (segments.at(-1) === 'index') {
        segments.pop()
      }
      const path = segments.length > 0 ? `${segments.join('/')}/` : ''
      return `/docs/${path}`
    })
    .sort()
}

const pages = buildDocsPages()

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
      meta: [
        {
          // Content Security Policy (#399). It is a `<meta>` tag and not a
          // response header because the site is `nuxt generate` output served
          // by GitHub Pages, which cannot set headers — the `routeRules`
          // headers elsewhere in this file are inert there for the same reason.
          //
          // That costs three header-only directives, which cannot be expressed
          // here at all: `frame-ancestors` (so clickjacking protection relies
          // on `frame-src 'none'` in whatever embeds us, i.e. nothing),
          // `report-uri` / `report-to`, and `sandbox`.
          //
          // Every source below was measured against the built site in Chromium,
          // not reasoned about — see `.github/contributing/docs-csp.md`. The
          // three relaxations are each required by something real:
          //
          //   script-src 'unsafe-inline'   Nuxt emits an inline hydration
          //                                payload on every page; hashes would
          //                                have to differ per page, which one
          //                                static meta tag cannot express.
          //   script-src 'wasm-unsafe-eval'  @nuxt/content's search runs SQLite
          //                                compiled to WebAssembly in the
          //                                browser.
          //   style-src 'unsafe-inline'    Nuxt inlines critical CSS.
          //
          // Everything else is `'self'`: after #407 removed the prettier CDN,
          // the built site loads no script, style, font, image or fetch from
          // any external origin. Adding one means adding it here too, and the
          // page will say so in the console the moment you do.
          'http-equiv': 'Content-Security-Policy',
          'content': [
            `default-src 'self'`,
            `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'`,
            `style-src 'self' 'unsafe-inline'`,
            `img-src 'self'`,
            `font-src 'self'`,
            `connect-src 'self'`,
            // Both workers this site starts — @nuxt/content's SQLite worker and
            // the prettier formatting worker (a module worker since #407) — are
            // same-origin. Stated rather than left to fall back to `script-src`,
            // which carries `'unsafe-inline'`.
            `worker-src 'self'`,
            `object-src 'none'`,
            `base-uri 'self'`,
            `form-action 'none'`,
            `frame-src 'none'`,
            `manifest-src 'self'`
          ].join('; ')
        }
      ],
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
    // `publicAssets` copies the skills tree verbatim, so anything sitting in it
    // gets deployed. `skills/b24jssdk-recipes` is its own npm package (#65) and
    // its `node_modules` is ~130 MB of dependency trees — publish the recipes,
    // not the machinery that installs them.
    //
    // This has to go on `nitro.ignore`, not on the publicAssets entry:
    // `PublicAssetDir` accepts only `dir` / `baseURL` / `maxAge` / `fallthrough`,
    // so an `ignore` key there is silently dropped (it type-checks, because
    // NitroConfig carries an index signature). Nitro turns each `ignore` entry
    // into a negated globby pattern in `getIncludePatterns`, and leaves patterns
    // starting with `*` unrewritten — which is why this one is written that way.
    ignore: ['**/node_modules/**'],
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
    worker: {
      // Part of a deliberate divergence from upstream `nuxt/ui`, which loads
      // prettier from a CDN and needs none of this — see
      // `.github/contributing/docs-fork.md` before removing it.
      //
      // Vite builds a worker as an IIFE by default, and an IIFE cannot be code
      // split — so every dynamic `import()` inside the worker is inlined into
      // it. That put all of prettier into the worker script itself (#399).
      // As an ES module the parsers stay a separate chunk, fetched on the first
      // format rather than with the worker.
      //
      // The cost, stated here because it is a trade and not a detail: this
      // emits `new Worker(url, { type: 'module' })`, which needs Chrome/Edge
      // 80+, Safari 15+ and Firefox 114+. The IIFE it replaces worked
      // everywhere. The failure is contained — `app/plugins/prettier.ts` builds
      // the worker lazily, so on an older browser in-page code formatting
      // simply does not happen and nothing else is affected. The repository
      // states no browserslist target, so this is the decision rather than a
      // violation of one.
      format: 'es'
    },
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
      },
      {
        title: 'Examples',
        contentCollection: 'docs',
        contentFilters: [
          { field: 'path', operator: 'LIKE', value: '/docs/examples/%' }
        ]
      }
    ],
    notes: [
      'The content is automatically generated from the same source as the official documentation.'
    ]
  },

  mcp: {
    // eng-only: set NUXT_MCP_ENABLED=true on the English production deployment.
    // The bare `import.meta.dev` branch must stay standalone so Nuxt statically
    // replaces it during `nuxt prepare` — that generates the #nuxt-mcp-toolkit
    // alias that server/api/ai.post.ts imports (otherwise typecheck breaks).
    enabled: process.env.NUXT_MCP_ENABLED === 'true' ? true : import.meta.dev,
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
