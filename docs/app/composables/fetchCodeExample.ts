export interface CodeExample {
  name: string
  filePath: string
  content: string
  type: 'ts' | 'js' | 'vue' | 'other'
  exports?: string[]
}

const useCodeExampleState = () => useState<Record<string, CodeExample | any>>('code-example-state', () => ({}))

export async function fetchCodeExample(name: string): Promise<CodeExample> {
  const state = useCodeExampleState()

  if (state.value[name]?.then) {
    await state.value[name]
    return state.value[name]
  }
  if (state.value[name]) {
    return state.value[name] as CodeExample
  }

  // Add to nitro prerender
  if (import.meta.server) {
    const event = useRequestEvent()
    event?.node?.res?.setHeader(
      'x-nitro-prerender',
      [event?.node.res.getHeader('x-nitro-prerender'), `/api/code-examples/${name}.json`].filter(Boolean).join(',')
    )
  }

  // Store promise to avoid multiple calls
  console.warn(`/api/code-examples/${name}.json`)
  state.value[name] = $fetch<CodeExample>(`/api/code-examples/${name}.json`).then((data) => {
    state.value[name] = data
  }).catch((error) => {
    console.error(`Failed to fetch code example ${name}:`, error)
    state.value[name] = {
      name,
      content: '',
      type: 'other',
      filePath: '',
      error: 'Failed to load example'
    } as CodeExample
    throw error
  })

  await state.value[name]
  return state.value[name]
}
