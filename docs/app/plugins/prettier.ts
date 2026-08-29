import { defu } from 'defu'
// Not `&inline`: the worker now bundles prettier instead of fetching it from a
// CDN (#399), and inlining that as a base64 blob would put the parsers in the
// entry bundle. As a separate chunk they are fetched when a page actually
// formats something.
//
// Upstream `nuxt/ui` fetches prettier from jsDelivr instead. Both this import
// and the lazy construction below are part of that deliberate divergence —
// see `.github/contributing/docs-fork.md` before changing either.
import PrettierWorker from '@/workers/prettier.js?worker'
// Message routing lives in a browser-free module so it can be tested without a
// Worker (#139) — this file cannot be imported outside Vite, because of the
// `?worker` specifier above.
import { createPrettierWorkerApi } from '../utils/prettierWorkerApi'
import type { SimplePrettier } from '../utils/prettierWorkerApi'

export default defineNuxtPlugin(async () => {
  let prettier: SimplePrettier
  if (import.meta.server) {
    const prettierModule = await import('prettier')
    prettier = {
      format(source, options = {}) {
        return prettierModule.format(source, defu(options, {
          parser: 'markdown'
        }))
      }
    }
  } else {
    // The worker is constructed on the FIRST format, not at plugin setup.
    //
    // Since #399 it bundles prettier rather than fetching it from a CDN, so the
    // worker script is ~500 KB gzipped — building it eagerly would download the
    // parsers on every page load, including the many pages that never format
    // anything. Deferring it restores the old timing: nothing is fetched until a
    // snippet actually needs formatting.
    // No race to guard: `??=` and the constructor are synchronous, with no
    // await between the check and the assignment, so a second `format()` cannot
    // interleave and build a second worker.
    let api: SimplePrettier | undefined
    prettier = {
      format(source, options) {
        api ??= createPrettierWorkerApi(new PrettierWorker())
        return api.format(source, options)
      }
    }
  }

  return {
    provide: {
      prettier
    }
  }
})
