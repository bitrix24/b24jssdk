import { defineEventHandler, createError, appendHeader } from 'h3'
// @ts-expect-error - no types available
import examples from '#code-example/nitro'

export default defineEventHandler((event) => {
  appendHeader(event, 'Access-Control-Allow-Origin', '*')

  const exampleName = (event.context.params?.['name?'] || '').replace(/\.json$/, '')

  if (exampleName) {
    const example = examples[exampleName]
    if (!example) {
      throw createError({
        statusText: 'Example not found!',
        status: 404
      })
    }
    return example
  }

  throw createError({
    statusText: 'Problem with example name!',
    status: 404
  })
})
