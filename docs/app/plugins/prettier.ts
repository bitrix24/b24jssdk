import { defu } from 'defu'
import PrettierWorker from '@/workers/prettier.js?worker&inline'
// Message routing lives in a browser-free module so it can be tested without a
// Worker (#139) — this file cannot be imported outside Vite, because of the
// `?worker&inline` specifier above.
import { createPrettierWorkerApi } from '../utils/prettierWorkerApi'
import type { SimplePrettier } from '../utils/prettierWorkerApi'

export type { SimplePrettier }

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
    const worker = new PrettierWorker()
    prettier = createPrettierWorkerApi(worker)
  }

  return {
    provide: {
      prettier
    }
  }
})
