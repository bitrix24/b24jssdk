// @ts-expect-error - no types available
import examples from '#code-example/nitro'

export default defineMcpResource({
  title: 'Bitrix24 JS SDK Examples',
  uri: 'resource://bitrix24-jssdk/examples',
  description: 'Complete list of available Bitrix24 JS SDK example code and demonstrations',
  cache: '1h',
  handler(uri: URL) {
    const list = Object.entries<{ name: string }>(examples).map(([_key, value]) => {
      return value.name
    })

    return {
      contents: [{
        uri: uri.toString(),
        mimeType: 'application/json',
        text: JSON.stringify(list, null, 2)
      }]
    }
  }
})
