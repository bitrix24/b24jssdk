/***
 Workaround for using zod 3 for the mcp validation
 Read here: https://github.com/modelcontextprotocol/typescript-sdk/issues/906
 */
import { z } from 'zod/v3'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

function createServer() {
  const server = new McpServer({
    name: 'bitrix24-jssdk',
    version: '1.0.0'
  })

  // RESOURCES

  server.registerResource(
    'bitrix24-jssdk-documentation-pages',
    'resource://bitrix24-jssdk/documentation-pages',
    {
      title: 'Bitrix24 JS SDK Documentation Pages',
      description: 'Complete list of available Bitrix24 JS SDK documentation pages'
    },
    async (uri) => {
      const result = await $fetch('/api/mcp/list-documentation-pages')
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(result, null, 2)
        }]
      }
    }
  )

  server.registerResource(
    'bitrix24-jssdk-examples',
    'resource://bitrix24-jssdk/examples',
    {
      title: 'Bitrix24 JS SDK Examples',
      description: 'Complete list of available Bitrix24 JS SDK example code and demonstrations'
    },
    async (uri) => {
      const result = await $fetch('/api/mcp/list-examples')
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(result, null, 2)
        }]
      }
    }
  )

  /**
   * @memo add docs/server/api/mcp
   */
  // server.registerResource(
  //   'bitrix24-jssdk-templates',
  //   'resource://bitrix24-jssdk/templates',
  //   {
  //     title: 'Bitrix24 JS SDK Templates',
  //     description: 'Complete list of available Bitrix24 JS SDK templates with categories'
  //   },
  //   async (uri) => {
  //     const result = await $fetch('/api/mcp/list-templates')
  //     return {
  //       contents: [{
  //         uri: uri.href,
  //         mimeType: 'application/json',
  //         text: JSON.stringify(result, null, 2)
  //       }]
  //     }
  //   }
  // )

  // PROMPTS

  // server.registerPrompt(
  //   'find_component_for_usecase',
  //   {
  //     title: 'Find Component for Use Case',
  //     description: 'Find the best Bitrix24 JS SDK component for a specific use case',
  //     argsSchema: {
  //       // @ts-expect-error - need to wait for support for zod 4, this works correctly just a type mismatch from zod 3 to zod 4 (https://github.com/modelcontextprotocol/typescript-sdk/pull/869)
  //       usecase: z.string().describe('Describe what you want to build (e.g., "user login form", "data table", "navigation menu")')
  //     }
  //   },
  //   async ({ usecase }) => {
  //     const components = await $fetch('/api/mcp/list-components')
  //     return {
  //       messages: [
  //         {
  //           role: 'user',
  //           content: {
  //             type: 'text',
  //             text: `Help me find the best Bitrix24 JS SDK component for this use case: "${usecase}". Here are all available components: ${JSON.stringify(components, null, 2)}`
  //           }
  //         }
  //       ]
  //     }
  //   }
  // )

  /**
   * @memo add docs/server/api/mcp
   */
  // server.registerPrompt(
  //   'setup_project_with_template',
  //   {
  //     title: 'Setup Project with Template',
  //     description: 'Guide through setting up a new project with a Bitrix24 JS SDK template',
  //     argsSchema: {
  //       // @ts-expect-error - need to wait for support for zod 4, this works correctly just a type mismatch from zod 3 to zod 4 (https://github.com/modelcontextprotocol/typescript-sdk/pull/869)
  //       projectType: z.string().describe('Type of project (dashboard, landing page, admin panel, etc.)')
  //     }
  //   },
  //   async ({ projectType }) => {
  //     const templates = await $fetch('/api/mcp/list-templates')
  //     return {
  //       messages: [
  //         {
  //           role: 'user',
  //           content: {
  //             type: 'text',
  //             text: `Guide me through setting up a new ${projectType} project with Bitrix24 JS SDK. Here are available templates: ${JSON.stringify(templates, null, 2)}`
  //           }
  //         }
  //       ]
  //     }
  //   }
  // )

  // TOOLS

  /**
   * @memo add docs/server/api/mcp
   */
  // server.registerTool(
  //   'list_templates',
  //   {
  //     title: 'List Templates',
  //     description: 'Lists all available Bitrix24 JS SDK templates with optional category filtering',
  //     inputSchema: {
  //       // @ts-expect-error - need to wait for support for zod 4, this works correctly just a type mismatch from zod 3 to zod 4 (https://github.com/modelcontextprotocol/typescript-sdk/pull/869)
  //       category: z.string().optional().describe('Filter templates by category')
  //     }
  //   },
  //   async (params) => {
  //     const result = await $fetch('/api/mcp/list-templates', { query: params })
  //     return {
  //       content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  //       structuredContent: result as any
  //     }
  //   }
  // )

  /**
   * @memo add docs/server/api/mcp
   */
  // server.registerTool(
  //   'get_template',
  //   {
  //     title: 'Get Template',
  //     description: 'Retrieves template details and setup instructions',
  //     inputSchema: {
  //       // @ts-expect-error - need to wait for support for zod 4, this works correctly just a type mismatch from zod 3 to zod 4 (https://github.com/modelcontextprotocol/typescript-sdk/pull/869)
  //       templateName: z.string().describe('The name of the template')
  //     }
  //   },
  //   async (params) => {
  //     const result = await $fetch('/api/mcp/get-template', { query: params })
  //     return {
  //       content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  //       structuredContent: result as any
  //     }
  //   }
  // )

  server.registerTool(
    'get_documentation_page',
    {
      title: 'Get Documentation Page',
      description: 'Retrieves documentation page content by URL path',
      inputSchema: {
        // @ts-expect-error - need to wait for support for zod 4, this works correctly just a type mismatch from zod 3 to zod 4 (https://github.com/modelcontextprotocol/typescript-sdk/pull/869)
        path: z.string().describe('The path to the content page (e.g., /docs/components/button)')
      }
    },
    async (params) => {
      const result = await $fetch<string>(`/raw${params.path}.md`)
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      }
    }
  )

  server.registerTool(
    'list_documentation_pages',
    {
      title: 'List Documentation Pages',
      description: 'Lists all documentation pages'
    },
    async () => {
      const result = await $fetch('/api/mcp/list-documentation-pages')
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      }
    }
  )

  server.registerTool(
    'list_getting_started_guides',
    {
      title: 'List Getting Started Guides',
      description: 'Lists all getting started guides and installation instructions'
    },
    async () => {
      const result = await $fetch('/api/mcp/list-getting-started-guides')
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      }
    }
  )

  server.registerTool(
    'list_examples',
    {
      title: 'List Examples',
      description: 'Lists all available UI examples and code demonstrations'
    },
    async () => {
      const result = await $fetch('/api/mcp/list-examples')
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      }
    }
  )

  server.registerTool(
    'get_example',
    {
      title: 'Get Example',
      description: 'Retrieves specific JS SDK example implementation code and details',
      inputSchema: {
        // @ts-expect-error - need to wait for support for zod 4, this works correctly just a type mismatch from zod 3 to zod 4 (https://github.com/modelcontextprotocol/typescript-sdk/pull/869)
        exampleName: z.string().describe('The name of the example (PascalCase)')
      }
    },
    async ({ exampleName }) => {
      const result = await $fetch(`/api/component-example/${exampleName}.json`)
      return {
        content: [{ type: 'text', text: result.code }]
      }
    }
  )

  return server
}

export default defineEventHandler(async (event) => {
  if (getHeader(event, 'accept')?.includes('text/html')) {
    return sendRedirect(event, '/docs/getting-started/ai/mcp/')
  }

  const server = createServer()

  const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  })

  event.node.res.on('close', () => {
    transport.close()
    server.close()
  })

  await server.connect(transport)

  const body = await readBody(event)

  await transport.handleRequest(event.node.req, event.node.res, body)
})
