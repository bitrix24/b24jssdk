import { z } from 'zod'

export default defineMcpPrompt({
  title: 'Generate SDK Code Example',
  description: 'Generate a code example using the Bitrix24 JS SDK for a specific use case',
  inputSchema: {
    usecase: z.string().describe('Describe the use case (e.g., "batch update 100 deals", "handle file upload with progress")'),
    restApiVersion: z.string().optional().describe('REST API version to use (ver2 or ver3, defaults to ver3)')
  },
  async handler({ usecase, restApiVersion }) {
    const version = restApiVersion || 'ver3'

    return {
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Generate a complete code example using @bitrix24/b24jssdk for this use case: "${usecase}". Use REST API ${version}. The example should include imports, initialization, the main logic, error handling, and comments explaining key steps.`
          }
        }
      ]
    }
  }
})
