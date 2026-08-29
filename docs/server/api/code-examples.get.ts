import { defineEventHandler, createError } from 'h3'
// @ts-expect-error - no types available
import examples from '#code-example/nitro'

/**
 * No `Access-Control-Allow-Origin` here, unlike the upstream `nuxt/ui` handler
 * this was forked from. Every caller is same-origin — the `fetchCodeExample`
 * composable and the MCP `b24-jssdk-get-example` tool — so a wildcard on a
 * read-only endpoint bought nothing and widened the surface for no reason.
 * Upstream keeps it; if a cross-origin consumer ever appears here, name it and
 * scope the header to that origin rather than restoring `*`. Also recorded in
 * `docs/FORK.md`, with the other deliberate divergences from upstream.
 */
export default defineEventHandler((event) => {
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
