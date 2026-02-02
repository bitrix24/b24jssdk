import { z } from 'zod'
import { useB24 } from '../../../app/composables/useB24'

export default defineMcpTool({
  title: 'Get Example',
  description: 'Retrieves specific JS SDK example implementation code and details',
  inputSchema: {
    exampleName: z.string().describe('The name of the example (PascalCase)')
  },
  cache: '30m',
  async handler({ exampleName }) {
    const b24Instance = useB24()

    try {
      const result = await $fetch<{ code: string }>(`/api/component-example/${exampleName}.json`)

      const code = b24Instance.prepareCode(result.code)

      return {
        content: [{ type: 'text' as const, text: code }]
      }
    } catch {
      // @memo need change tool if you need
      return errorResult(`Example '${exampleName}' not found. Use the b24-jssdk-list-examples tool to see all available examples.`)
    }
  }
})
