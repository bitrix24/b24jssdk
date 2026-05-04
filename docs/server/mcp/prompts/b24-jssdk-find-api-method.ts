import { z } from 'zod'
import { queryCollection } from '@nuxt/content/server'

export default defineMcpPrompt({
  title: 'Find SDK Method for Use Case',
  description: 'Find the best Bitrix24 JS SDK method or REST API for a specific use case',
  inputSchema: {
    usecase: z.string().describe('Describe what you want to do with Bitrix24 (e.g., "create a deal", "get user list", "upload file to disk")')
  },
  async handler({ usecase }) {
    const event = useEvent()

    const pages = await queryCollection(event, 'docs')
      .where('path', 'LIKE', '%/working-with-the-rest-api/%')
      .where('extension', '=', 'md')
      .select('path', 'title', 'description')
      .all()

    return {
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Help me find the best Bitrix24 JS SDK method or REST API endpoint for this use case: "${usecase}". Here are all available documentation pages: ${JSON.stringify(pages, null, 2)}`
          }
        }
      ]
    }
  }
})
