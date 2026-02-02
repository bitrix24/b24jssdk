import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { streamText, convertToModelMessages, stepCountIs } from 'ai'
import { experimental_createMCPClient } from '@ai-sdk/mcp'
import { createDeepSeek } from '@ai-sdk/deepseek'

/**
 * @docs https://ai-sdk.dev/providers/ai-sdk-providers/deepseek
 */

const maxStepCount = 20

async function initMcpToolsForUI() {
  const httpTransport = new StreamableHTTPClientTransport(
    new URL(`https://b24ui.bx-shef.by/b24ui/mcp/`)
  )
  const httpClient = await experimental_createMCPClient({
    transport: httpTransport
  })
  return await httpClient.tools()
}

async function initMcpToolsForB24RestApi() {
  const httpTransport = new StreamableHTTPClientTransport(
    new URL(`https://mcp-dev.bitrix24.tech/mcp`)
  )
  const httpClient = await experimental_createMCPClient({
    transport: httpTransport
  })
  return await httpClient.tools()
}

export default defineEventHandler(async (event) => {
  const body: any = await readBody(event)
  const config = useRuntimeConfig()

  const httpTransport = new StreamableHTTPClientTransport(
    new URL(import.meta.dev ? `http://localhost:3000${config.public.baseUrl}/mcp/` : `${config.public.siteUrl}${config.public.baseUrl}/mcp/`)
  )
  const httpClient = await experimental_createMCPClient({
    transport: httpTransport
  })
  const tools = {
    ...await httpClient.tools(),
    ...await initMcpToolsForB24RestApi(),
    ...await initMcpToolsForUI()
  }

  const deepseek = createDeepSeek({
    apiKey: process.env.DEEPSEEK_API_KEY ?? ''
  })

  return streamText({
    // @todo fix me deepseek-reasoner | deepseek-chat
    model: deepseek('deepseek-reasoner'),
    // @todo fix me 10000 | 8100
    maxOutputTokens: 10000,
    system: `You are a helpful assistant for Bitrix24 JS SDK, a comprehensive JavaScript library integrated with Bitrix24, providing toolkit for interacting with the Bitrix24 REST API. Use your knowledge base tools to search for relevant information before answering questions.

Guidelines:
- ALWAYS use tools to search for information. Never rely on pre-trained knowledge.
- If no relevant information is found after searching, respond with "Sorry, I couldn't find information about that in the documentation."
- Be concise and direct in your responses.

General Code Design Guidelines:
- Try to use TypeScript wherever appropriate and practical.
- When writing code, use SOLID approaches where practical and appropriate, but strive for simplicity. Try to avoid creating classes.

Code Style Guidelines for Vue and Nuxt:
- Use the B24 prefix (e.g. <B24Table> and so on) for Bitrix24 user interface components.
- When constructing a list of items, you need to:
  - use Skeleton components to display the loading process
  - use the Empty component to display an empty list of items
  - use the Table component (framed by a Card component) to display the list of items

**FORMATTING RULES (CRITICAL):**
- ABSOLUTELY NO MARKDOWN HEADINGS: Never use #, ##, ###, ####, #####, or ######
- NO underline-style headings with === or ---
- Use **bold text** for emphasis and section labels instead
- Examples:
  * Instead of "## Usage", write "**Usage:**" or just "Here's how to use it:"
  * Instead of "# Complete Guide", write "**Complete Guide**" or start directly with content
- Start all responses with content, never with a heading

- Reference specific component names, props, or APIs when applicable.
- If a question is ambiguous, ask for clarification rather than guessing.
- When multiple relevant items are found, list them clearly using bullet points.
- You have up to ${maxStepCount} tool calls to find the answer, so be strategic: start broad, then get specific if needed.
- Format responses in a conversational way, not as documentation sections.
    `,
    messages: await convertToModelMessages(body?.messages),
    stopWhen: stepCountIs(maxStepCount),
    tools,
    onFinish: async () => {
      await httpClient.close()
    },
    onError: async (error) => {
      console.error(error)

      await httpClient.close()
    }
  }).toUIMessageStreamResponse()
})
