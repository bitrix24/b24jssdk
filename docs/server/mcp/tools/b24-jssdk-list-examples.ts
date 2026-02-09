// @ts-expect-error - no types available
import examples from '#code-example/nitro'

export default defineMcpTool({
  title: 'List Examples',
  description: 'Lists all available JS SDK examples and code demonstrations',
  cache: '1h',
  handler() {
    const list = Object.entries<{ name: string }>(examples).map(([_key, value]) => {
      return value.name
    })

    return jsonResult(list)
  }
})
