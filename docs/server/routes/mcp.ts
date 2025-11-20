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

  // TOOLS

  server.registerTool(
    'get_b24_jssdk_documentation_page',
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
    'list_b24_jssdk_documentation_pages',
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
    'list_b24_jssdk_getting_started_guides',
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
    'list_b24_jssdk_examples',
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
    'get_b24_jssdk_example',
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
