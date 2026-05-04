import type { H3Event } from 'h3'
import { visit } from '@nuxt/content/runtime'
import { queryCollection } from '@nuxt/content/server'
// import meta from '#nuxt-component-meta'
// @ts-expect-error - no types available
import { getComponentExample } from '#component-example/nitro'
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

const B24_DOCS = {
  ui: 'https://bitrix24.github.io/b24ui/',
  jsSdk: 'https://bitrix24.github.io/b24jssdk/'
}

// function getComponentMeta(componentName: string) {
//   const pascalCaseName = componentName.charAt(0).toUpperCase() + componentName.slice(1)
//
//   const strategies = [
//     `B24${pascalCaseName}`,
//     `Prose${pascalCaseName}`,
//     pascalCaseName
//   ]
//
//   let componentMeta: any
//   let finalMetaComponentName: string = pascalCaseName
//
//   for (const nameToTry of strategies) {
//     finalMetaComponentName = nameToTry
//     const metaAttempt = (meta as Record<string, any>)[nameToTry]?.meta
//     if (metaAttempt) {
//       componentMeta = metaAttempt
//       break
//     }
//   }
//
//   if (!componentMeta) {
//     console.warn(`[getComponentMeta] Metadata not found for ${pascalCaseName} using strategies: B24, Prose, or no prefix. Last tried: ${finalMetaComponentName}`)
//   }
//
//   return {
//     pascalCaseName,
//     metaComponentName: finalMetaComponentName,
//     componentMeta
//   }
// }

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

const BLOCK_ELEMENTS = new Set([
  'pre', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'blockquote', 'table', 'hr'
])

function collectBlockChildren(nodes: any[]): any[] {
  const result: any[] = []
  for (const child of nodes) {
    if (typeof child === 'string') {
      if (child.trim()) {
        result.push(['p', {}, child])
      }
    } else if (Array.isArray(child)) {
      if (BLOCK_ELEMENTS.has(child[0])) {
        result.push(child)
      } else {
        result.push(...collectBlockChildren(child.slice(2)))
      }
    }
  }
  return result
}

function replaceWithChildren(node: any[], newChildren: any[]) {
  const collected = collectBlockChildren(newChildren)
  node[0] = '__flatten'
  node[1] = {}
  node.length = 2
  for (const child of collected) {
    node.push(child)
  }
}

function flattenMarkers(node: any): void {
  if (!Array.isArray(node)) return
  let i = 2
  while (i < node.length) {
    const child = node[i]
    if (Array.isArray(child) && (child[0] === '__flatten' || child[0] === 'div')) {
      const innerChildren = child.slice(2)
      node.splice(i, 1, ...innerChildren)
    } else {
      flattenMarkers(child)
      i++
    }
  }
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

export async function transformMDC(event: H3Event, doc: Document): Promise<Document> {
  // const componentName = camelCase(doc.title)

  const config = useRuntimeConfig()
  const baseUrl = `${config.public.canonicalUrl}${config.public.baseUrl}/raw`

  // visitAndReplace(doc, 'component-theme', () => {})

  // visitAndReplace(doc, 'component-code', () => {})

  // visitAndReplace(doc, 'component-props', () => {})

  // visitAndReplace(doc, 'component-slots', () => {})

  const b24Instance = useB24()

  visitAndReplace(doc, 'code-example', (node) => {
    // const camelName = camelCase(node[1]['name'])
    const lang = node[1]['lang'] ?? 'ts'
    const name = node[1]['name']
    const propsName = node[1]['filename'] ?? name
    try {
      const examples = getComponentExample(name)
      const code = b24Instance.prepareCode(examples[name]?.content || '')
      replaceNodeWithPre(node, lang, code, `${propsName}.${lang}`)
    } catch (error) {
      console.error(error, { name })
      replaceNodeWithPre(node, 'ts', '? visitAndReplace ?', `${name}.${lang}`)
    }
  })

  // visitAndReplace(doc, 'component-changelog', (node) => {
  //   const prefix = (node[1] as Record<string, string>)?.prefix
  //   const pascalName = componentName.charAt(0).toUpperCase() + componentName.slice(1)
  //   const kebabName = kebabCase(componentName)
  //   const componentPath = `src/runtime/components/${prefix ? `${prefix}/` : ''}${pascalName}.vue`
  //   const themePath = `src/theme/${prefix ? `${prefix}/` : ''}${kebabName}.ts`
  //
  //   node[0] = 'p'
  //   node[1] = {}
  //   node[2] = 'See commit history for '
  //   node[3] = ['a', { href: `https://github.com/nuxt/ui/commits/v4/${componentPath}` }, 'component']
  //   node[4] = ' and '
  //   node[5] = ['a', { href: `https://github.com/nuxt/ui/commits/v4/${themePath}` }, 'theme']
  //   node[6] = '.'
  //   node.length = 7
  // })

  // Transform callout components (tip, note, warning, caution, callout) to blockquotes
  const calloutTypes = ['tip', 'note', 'warning', 'caution', 'callout']
  const calloutLabels: Record<string, string> = {
    tip: 'TIP',
    note: 'NOTE',
    warning: 'WARNING',
    caution: 'CAUTION',
    callout: 'NOTE'
  }

  for (const calloutType of calloutTypes) {
    visitAndReplace(doc, calloutType, (node) => {
      const attrs = node[1] || {}
      const content = node.slice(2)
      const label = calloutLabels[calloutType]

      const blockquoteChildren: any[] = []

      let firstLine = `[!${label}]`
      if (attrs.to) {
        firstLine += `\nSee: ${attrs.to}`
      }
      blockquoteChildren.push(['p', {}, firstLine])

      blockquoteChildren.push(...collectBlockChildren(content))

      node[0] = 'blockquote'
      node[1] = {}
      node.length = 2
      for (const child of blockquoteChildren) {
        node.push(child)
      }
    })
  }

  // Transform framework-only - extract content from both slots and label them
  visitAndReplace(doc, 'framework-only', (node) => {
    const children = node.slice(2)
    const allChildren: any[] = []

    for (const child of children) {
      if (Array.isArray(child) && child[0] === 'template') {
        const slotAttr = child[1]?.['v-slot:nuxt'] !== undefined
          ? 'nuxt'
          : child[1]?.['v-slot:vue'] !== undefined ? 'vue' : null
        if (slotAttr === 'nuxt') {
          allChildren.push(['p', {}, ['strong', {}, 'Nuxt:']])
          allChildren.push(...collectBlockChildren(child.slice(2)))
        } else if (slotAttr === 'vue') {
          allChildren.push(['p', {}, ['strong', {}, 'Vue:']])
          allChildren.push(...collectBlockChildren(child.slice(2)))
        }
      }
    }

    node[0] = '__flatten'
    node[1] = {}
    node.length = 2
    for (const child of allChildren) {
      node.push(child)
    }
  })

  // Transform badge to inline text
  visitAndReplace(doc, 'badge', (node) => {
    const attrs = node[1] || {}
    const label = attrs.label || ''
    node[0] = 'code'
    node[1] = {}
    node[2] = label
    node.length = 3
  })

  // Transform card components to markdown sections
  visitAndReplace(doc, 'card', (node) => {
    const attrs = node[1] || {}
    const content = node.slice(2)
    const title = attrs.title || ''

    const allChildren: any[] = []
    if (title) {
      allChildren.push(['p', {}, ['strong', {}, title]])
    }
    allChildren.push(...collectBlockChildren(content))

    node[0] = '__flatten'
    node[1] = {}
    node.length = 2
    for (const child of allChildren) {
      node.push(child)
    }
  })

  // Transform accordion-item to Q&A format
  visitAndReplace(doc, 'accordion-item', (node) => {
    const attrs = node[1] || {}
    const content = node.slice(2)
    const label = attrs.label || ''

    const allChildren: any[] = []
    if (label) {
      allChildren.push(['p', {}, ['strong', {}, `Q: ${label}`]])
    }
    allChildren.push(...collectBlockChildren(content))

    node[0] = '__flatten'
    node[1] = {}
    node.length = 2
    for (const child of allChildren) {
      node.push(child)
    }
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
      .where('index', 'IS NULL')
      .where('category', '=', category)
      .select('path', 'title')
      .all()

    const listItems = components.map((c: any) =>
      ['li', {}, ['a', { href: `${config.public.canonicalUrl}${config.public.baseUrl}/raw${c.path}.md` }, c.title]]
    )

    node[0] = 'ul'
    node[1] = {}
    node.length = 2
    for (const item of listItems) {
      node.push(item)
    }
  }

  // Remove wrapper elements by extracting children content
  const wrapperTypes = ['card-group', 'accordion', 'steps', 'code-group', 'code-collapse', 'tabs', 'div']
  for (const wrapperType of wrapperTypes) {
    visitAndReplace(doc, wrapperType, (node) => {
      replaceWithChildren(node, node.slice(2))
    })
  }

  // Transform field to a definition format (before field-group unwrapping so attrs are intact)
  visitAndReplace(doc, 'field', (node) => {
    const attrs = node[1] || {}
    const content = node.slice(2)
    const name = attrs.name || ''
    const type = attrs.type || ''
    const required = attrs.required === 'true' || attrs[':required'] === 'true'

    const extractText = (nodes: any[]): string => {
      return nodes.map((child: any) => {
        if (typeof child === 'string') return child
        if (Array.isArray(child)) {
          const innerContent = child.slice(2)
          return extractText(innerContent)
        }
        return ''
      }).join('')
    }

    const parts: any[] = [['strong', {}, name]]
    if (type) {
      parts.push(' (', ['code', {}, type], ')')
    }
    if (required) {
      parts.push(' ', ['em', {}, 'required'])
    }
    const desc = extractText(content).trim()
    if (desc) {
      parts.push(`: ${desc}`)
    }

    node[0] = 'p'
    node[1] = {}
    node.length = 2
    for (const part of parts) {
      node.push(part)
    }
  })

  // Remove field-group / collapsible wrappers (after fields are transformed to <p>)
  const fieldWrappers = ['field-group', 'collapsible']
  for (const wrapperType of fieldWrappers) {
    visitAndReplace(doc, wrapperType, (node) => {
      replaceWithChildren(node, node.slice(2))
    })
  }

  // Transform code-preview to extract the Vue code as a code block
  visitAndReplace(doc, 'code-preview', (node) => {
    const children = node.slice(2)

    const extractVueCode = (nodes: any[]): string => {
      return nodes.map((child: any) => {
        if (typeof child === 'string') return child
        if (Array.isArray(child)) {
          const tag = child[0]
          const attrs = child[1] || {}
          const content = child.slice(2)
          // Build the opening tag
          let tagStr = `<${tag}`
          for (const [key, val] of Object.entries(attrs)) {
            if (key.startsWith(':') || key.startsWith('v-')) {
              tagStr += ` ${key}=${val}`
            } else if (typeof val === 'string') {
              tagStr += ` ${key}=${val}`
            }
          }
          const innerContent = extractVueCode(content)
          if (innerContent.trim()) {
            tagStr += `>\n${innerContent}</${tag}>`
          } else {
            tagStr += ' />'
          }
          return tagStr
        }
        return ''
      }).join('\n')
    }

    const vueCode = extractVueCode(children).trim()
    node[0] = 'pre'
    node[1] = { language: 'vue', code: `<template>\n  ${vueCode.split('\n').join('\n  ')}\n</template>` }
    node.length = 2
  })

  // Transform icons-theme and icons-theme-select to placeholder
  visitAndReplace(doc, 'icons-theme', (node) => {
    node[0] = 'p'
    node[1] = {}
    node[2] = ['em', {}, 'See the interactive theme picker on the documentation website.']
    node.length = 3
  })

  visitAndReplace(doc, 'icons-theme-select', (node) => {
    node[0] = 'p'
    node[1] = {}
    node[2] = ''
    node.length = 3
  })

  // Transform supported-languages to placeholder
  visitAndReplace(doc, 'supported-languages', (node) => {
    node[0] = 'p'
    node[1] = {}
    node[2] = ['em', {}, 'See the full list of supported languages on the documentation website.']
    node.length = 3
  })

  // Transform b24-button to markdown link
  visitAndReplace(doc, 'b24-button', (node) => {
    const attrs = node[1] || {}
    const label = attrs.label || ''
    const to = attrs.to || ''
    if (to) {
      node[0] = 'p'
      node[1] = {}
      node[2] = ['a', { href: to }, label]
      node.length = 3
    } else {
      node[0] = 'p'
      node[1] = {}
      node[2] = label
      node.length = 3
    }
  })

  processLinks(doc.body.value, baseUrl)

  // Flatten __flatten markers by splicing their children into parents
  if (Array.isArray(doc.body)) {
    flattenMarkers(doc.body)
  } else if (doc.body?.value && Array.isArray(doc.body.value)) {
    flattenMarkers(doc.body.value)
  }

  return doc
}
