import type { H3Event } from 'h3'
import { camelCase } from 'scule'
import { visit } from '@nuxt/content/runtime'
import { queryCollection } from '@nuxt/content/server'
// @ts-expect-error - no types available
import components from '#component-example/nitro'
// @ts-expect-error - no types available
import examples from '#code-example/nitro'
import { useB24 } from '../../app/composables/useB24'

/**
 * @see docs/server/utils/transformMDC.ts
 * @see docs/server/plugins/llms.ts
 * @see docs/server/routes/raw/[...slug].md.get.ts
 */

type Document = {
  title: string
  body: any
}

type BlockConfig = {
  defaultTitle: string
}

const B24_DOCS = {
  ui: 'https://bitrix24.github.io/b24ui/',
  jsSdk: 'https://bitrix24.github.io/b24jssdk/'
}

const BLOCK_CONFIGS: Record<string, BlockConfig> = {
  callout: { defaultTitle: '!NOTE' },
  note: { defaultTitle: '!NOTE' },
  tip: { defaultTitle: '!TIP' },
  warning: { defaultTitle: '!WARNING' },
  caution: { defaultTitle: '!CAUTION' }
}

function replaceNodeWithPre(node: any[], language: string, code: string, filename?: string) {
  node[0] = 'pre'
  node[1] = { language, code }
  if (filename) node[1].filename = filename
}

function visitAndReplace(doc: Document, type: string, handler: (node: any[]) => void) {
  visit(doc.body, (node) => {
    if (Array.isArray(node) && node[0] === type) {
      handler(node)
    }

    return true
  }, node => node)
}

function processLinks(
  nodes: Node[],
  baseUrl: string
) {
  if (!Array.isArray(nodes)) return

  for (const node of nodes) {
    if (Array.isArray(node)) {
      if (node[0] === 'a' && node[1] && node[1].href) {
        node[1].href = prepareHref(node[1].href, baseUrl)
      } else if (node[0] === 'tip' && node[1] && node[1].to) {
        node[1].href = prepareHref(node[1].to, baseUrl)
      }

      for (let i = 1; i < node.length; i++) {
        if (Array.isArray(node[i])) {
          processLinks([node[i]], baseUrl)
        }
      }
    }
  }
}

function prepareHref(
  href: string,
  baseUrl: string
): string {
  if (href.includes('/raw') || href.endsWith('.md')) {
    return href
  }

  const processUrlWithAnchor = (url: string, base: string): string => {
    const [path, anchor] = url.split('#')
    const processedPath = path!.endsWith('/') ? path!.slice(0, -1) + '.md' : path + '.md'
    return anchor ? `${base}raw/${processedPath}#${anchor}` : `${base}raw/${processedPath}`
  }

  if (href.startsWith(B24_DOCS.ui) && href.includes('/docs/')) {
    const path = href.replace(B24_DOCS.ui, '')
    return processUrlWithAnchor(path, B24_DOCS.ui)
  }

  if (href.startsWith(B24_DOCS.jsSdk) && href.includes('/docs/')) {
    const path = href.replace(B24_DOCS.jsSdk, '')
    return processUrlWithAnchor(path, B24_DOCS.jsSdk)
  }

  if (href.startsWith('/docs/') && !href.startsWith('http')) {
    const [path, anchor] = href.split('#')
    let newHref = path!.startsWith('/') ? path!.slice(1) : path

    if (newHref!.endsWith('/')) {
      newHref = newHref!.slice(0, -1) + '.md'
    } else if (!newHref!.endsWith('.md')) {
      newHref = newHref + '.md'
    }

    return anchor ? `${baseUrl}/${newHref}#${anchor}` : `${baseUrl}/${newHref}`
  }

  return href
}

function processBlockNode(node: any[], config: BlockConfig, baseUrl: string) {
  const prevNode = [...node]

  node[0] = 'blockquote'
  node[1] = {}

  const customTitle = prevNode[1]?.title || prevNode[1]?.ariaLabel

  let title: [string, any, any]
  if (typeof prevNode[1].to !== 'undefined') {
    title = [
      'a',
      { href: prepareHref(prevNode[1].to, baseUrl) },
      `${customTitle || config.defaultTitle}`
    ]
  } else {
    title = [
      'p',
      {},
      `${customTitle || config.defaultTitle}`
    ]
  }

  const description = Array.isArray(prevNode[2]) ? prevNode[2] : []
  if (description) {
    description[2] = `%br>%${description[2]}`
  }
  node[2] = [
    'p',
    {},
    title,
    description
  ]
}

export async function transformMDC(event: H3Event, doc: Document): Promise<Document> {
  const config = useRuntimeConfig()
  const baseUrl = `${config.public.canonicalUrl}${config.public.baseUrl}/raw`
  const b24Instance = useB24()

  visitAndReplace(doc, 'component-example', (node) => {
    const camelName = camelCase(node[1]['name'])
    const lang = node[1]['lang'] ?? 'vue'
    const name = camelName.charAt(0).toUpperCase() + camelName.slice(1)
    const propsName = node[1]['filename'] ?? name
    try {
      const code = b24Instance.prepareCode(components[name]?.code || '')
      replaceNodeWithPre(node, lang, code, `${propsName}.${lang}`)
    } catch (error) {
      console.error(error, { name })
      replaceNodeWithPre(node, 'vue', '? visitAndReplace ?', `${name}.${lang}`)
    }
  })

  visitAndReplace(doc, 'code-example', (node) => {
    // const camelName = camelCase(node[1]['name'])
    const lang = node[1]['lang'] ?? 'ts'
    const name = node[1]['name']
    const propsName = node[1]['filename'] ?? name
    try {
      const code = b24Instance.prepareCode(examples[name]?.content || '')
      replaceNodeWithPre(node, lang, code, `${propsName}.${lang}`)
    } catch (error) {
      console.error(error, { name })
      replaceNodeWithPre(node, 'ts', '? visitAndReplace ?', `${name}.${lang}`)
    }
  })

  Object.entries(BLOCK_CONFIGS).forEach(([blockType, config]) => {
    visitAndReplace(doc, blockType, (node: any[]) => processBlockNode(node, config, baseUrl))
  })

  visitAndReplace(doc, 'card', (node) => {
    const prevNode = { ...node }

    node[0] = 'blockquote'
    node[1] = {}

    const customTitle = prevNode[1]?.title || ''

    let title: [string, any, any]
    if (typeof prevNode[1].to !== 'undefined') {
      title = [
        'a',
        { href: prepareHref(prevNode[1].to, baseUrl) },
        `${customTitle}`
      ]
    } else {
      title = [
        'p',
        {},
        `${customTitle}`
      ]
    }

    const description = Array.isArray(prevNode[2]) ? prevNode[2] : []
    if (description) {
      description[2] = `%br>%${description[2]}`
    }

    node[2] = [
      'p',
      {},
      title,
      description
    ]
  })

  visitAndReplace(doc, 'accordion-item', (node) => {
    const prevNode = { ...node }

    node[0] = 'p'
    node[1] = {}

    const customTitle = prevNode[1]?.label || ''

    const title = [
      'strong',
      {},
      customTitle
    ]

    const description = Array.isArray(prevNode[2]) ? prevNode[2] : []

    node[2] = [
      'p',
      {},
      ['p', {}, '', title, '%br%', description],
      ['p', {}, '%br%']
    ]
  })

  /**
   * @memo before field we clear collapsible
   */
  visitAndReplace(doc, 'collapsible', (node) => {
    node[0] = 'p'
    node[1] = {}
  })

  /**
   * @memo before field we clear field-group
   */
  visitAndReplace(doc, 'field-group', (node) => {
    node[0] = 'p'
    node[1] = {}
  })

  visitAndReplace(doc, 'field', (node) => {
    const prevNode = { ...node }

    node[0] = 'p'
    node[1] = {}

    const customTitle = prevNode[1]?.name || ''
    const customType = prevNode[1]?.type || ''
    const customRequired = prevNode[1]?.required === true

    const title = [
      'li',
      {},
      `Name: ${customTitle}`
    ]
    const type = [
      'li',
      {},
      ` Type: ${customType}`
    ]
    const required = [
      'li',
      {},
      ` Is Required: ${customRequired ? 'Yes' : 'No'}`
    ]

    const description = Array.isArray(prevNode[2]) ? prevNode[2] : []
    if (description) {
      description[0] = 'li'
    }

    node[2] = [
      'ul',
      {},
      title,
      type,
      required,
      description,
      ['p', {}, '%br%']
    ]
  })

  const componentsListNodes: any[] = []
  visit(doc.body, (node) => {
    if (Array.isArray(node) && node[0] === 'components-list') {
      componentsListNodes.push(node)
    }
    return true
  }, node => node)

  for (const node of componentsListNodes) {
    const category = node[1]?.category
    if (!category) continue

    const components = await queryCollection(event, 'docs')
      .where('path', 'LIKE', '/docs/components/%')
      .where('extension', '=', 'md')
      .where('category', '=', category)
      .select('path', 'title')
      .all()

    const links = components.map((c: any) => `- [${c.title}](${config.public.canonicalUrl}${config.public.baseUrl}/raw${c.path}.md)`).join('\n')

    node[0] = 'p'
    node[1] = {}
    node[2] = links
  }

  processLinks(doc.body.value, baseUrl)

  return doc
}
