#!/usr/bin/env node

/**
 * Loads the built documentation site in a real browser and reports every
 * Content Security Policy violation it raises (#399).
 *
 * **Not wired into CI, and deliberately so.** It needs a full `docs:generate`
 * and a Chromium binary, and `playwright` is not a dependency of this
 * repository. It is here because the CSP in `docs/server/plugins/csp.ts` was derived by
 * measurement rather than reasoning, and the next person to touch that policy
 * should be able to repeat the measurement instead of re-deriving it — a CSP
 * argued from first principles is wrong roughly every time.
 *
 * The failure mode this exists for is quiet: a directive that is too strict does
 * not break the build or any test. It breaks the page, in the browser, in
 * production, in a way only the console shows.
 *
 * Usage:
 *
 *   # once
 *   npm i playwright   # not saved to package.json; uninstall afterwards
 *
 *   # build the site the way CI does (the env matters — without it the
 *   # prerenderer 404s on the footer's /releases link and the build fails)
 *   NUXT_PUBLIC_SITE_URL=https://bitrix24.github.io \
 *   NUXT_PUBLIC_BASE_URL=/b24jssdk \
 *   NUXT_PUBLIC_CANONICAL_URL=https://bitrix24.github.io \
 *   NUXT_PUBLIC_GIT_URL=https://github.com/bitrix24/b24jssdk \
 *   NUXT_PUBLIC_USE_AI=false NUXT_PUBLIC_USE_TAB_B24FRAME=false \
 *   pnpm run docs:generate
 *
 *   node scripts/check-docs-csp.mjs                    # a default page sample
 *   node scripts/check-docs-csp.mjs / /docs/api-reference
 *
 * To try a *candidate* policy without rebuilding, pass it in `CSP`. The built-in
 * policy is stripped first, so the candidate genuinely replaces it — see the
 * comment on that in `serveBuiltSite`, because merely adding a second `<meta>`
 * policy would make the page stricter rather than looser and quietly invert this.
 * That is how to check whether a relaxation is still load-bearing: drop it and
 * see whether anything actually breaks.
 *
 *   CSP="default-src 'self'; script-src 'self' 'unsafe-inline'" \
 *   node scripts/check-docs-csp.mjs
 */

import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { join, extname, resolve, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'docs', '.output', 'public')

/**
 * Must match the `NUXT_PUBLIC_BASE_URL` the site was built with, or every
 * request 404s with nothing to explain why. Read from the environment so the
 * two cannot drift.
 */
const BASE = process.env.NUXT_PUBLIC_BASE_URL ?? '/b24jssdk'

/**
 * A sample rather than all 151 pages: the home page, the 404 page, a docs page
 * carrying code blocks, the API reference, an example, and the migration guide.
 *
 * Each opens the search dialog, which is what pulls `sqlite3.wasm` and starts
 * its worker — the only thing an ordinary page visit exercises that needs a
 * relaxation beyond `'self'`.
 *
 * The site has a **second** worker, the prettier formatter, and no page visit
 * reaches it: `CodeExample` only formats when its `prettier` prop is set, and no
 * content page sets it. `worker-src` is there for both, so the run constructs it
 * directly after the page settles rather than leaving that half of the directive
 * unverified — see `probeModuleWorker`.
 */
const DEFAULT_PAGES = [
  '/',
  // The 404 page renders from `docs/app/error.vue`, a different subtree from
  // every other page here, and it is what a visitor gets after any broken link.
  '/404.html',
  '/docs/getting-started/',
  '/docs/working-with-the-rest-api/core-ajax-result/',
  '/docs/api-reference',
  '/docs/examples/crm-analytics/',
  '/docs/getting-started/migration/v3/'
]

const CONTENT_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  // Chromium refuses to instantiate a wasm module served as anything else, and
  // the resulting error looks exactly like a CSP rejection. Getting this wrong
  // costs an hour.
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2'
}

function serveBuiltSite(override) {
  const server = createServer((request, response) => {
    let path = decodeURIComponent(request.url.split('?')[0])
    // A bare prefix test would also strip `/b24jssdkX/...`, resolving somewhere
    // else entirely or 404ing with nothing to explain why.
    if (path === BASE || path.startsWith(`${BASE}/`)) {
      path = path.slice(BASE.length)
    }
    let file = resolve(ROOT, `.${path.startsWith('/') ? path : `/${path}`}`)
    // Confine to the built site: `join`/`resolve` happily walk out of ROOT via
    // `..`, and this server has no authentication.
    if (file !== ROOT && !file.startsWith(ROOT + sep)) {
      response.writeHead(403)
      response.end('outside the built site')
      return
    }
    if (existsSync(file) && statSync(file).isDirectory()) {
      file = join(file, 'index.html')
    }
    if (!existsSync(file)) {
      response.writeHead(404)
      response.end('not found')
      return
    }
    const extension = extname(file)
    let body = readFileSync(file)
    if (extension === '.html' && override) {
      // Strip the built-in policy first. Two `<meta>` policies are both
      // enforced and a resource must satisfy the intersection, so *adding* one
      // can only ever make the page stricter — which would quietly invert the
      // one thing `CSP=` exists for, namely dropping a directive to find out
      // whether it is still load-bearing.
      const stripped = String(body).replace(/<meta[^>]+http-equiv="Content-Security-Policy"[^>]*>/gi, '')
      if (!stripped.includes('<head>')) {
        console.warn(`warning: no <head> in ${file}; the CSP override was not applied`)
      }
      body = Buffer.from(
        stripped.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${override}">`)
      )
    }
    response.writeHead(200, { 'Content-Type': CONTENT_TYPES[extension] ?? 'application/octet-stream' })
    response.end(body)
  })
  return server
}

/**
 * Constructs the prettier worker inside the page, under whatever policy the page
 * carries. Nothing on the site does this today, so without it `worker-src` is
 * only ever half-tested — and it is the directive most likely to be got wrong,
 * since the worker became a **module** worker in #407 and a module worker is
 * fetched, not inherited, so the policy has to allow it.
 *
 * Returns a problem string, or null when the worker started.
 */
async function probeModuleWorker(page, base) {
  const chunk = readdirSync(join(ROOT, '_nuxt')).find(name => /^prettier-.*\.js$/.test(name))
  if (chunk === undefined) {
    return 'no prettier-*.js chunk in the build — has the formatting worker moved?'
  }
  return page.evaluate(async ({ url }) => {
    try {
      const worker = new Worker(url, { type: 'module' })
      return await new Promise((settle) => {
        worker.onerror = event => settle(`module worker blocked: ${event.message || 'no message'}`)
        // No reply is expected — the worker only answers a format request. What
        // is being tested is that it starts at all and is not torn down.
        setTimeout(() => {
          worker.terminate()
          settle(null)
        }, 2000)
      })
    } catch (error) {
      return `module worker threw: ${String(error).slice(0, 140)}`
    }
  }, { url: `${base}/_nuxt/${chunk}` })
}

async function main() {
  if (!existsSync(ROOT)) {
    console.error(`No built site at ${ROOT}. Run \`pnpm run docs:generate\` first — see the header of this file for the environment it needs.`)
    process.exit(1)
  }

  let chromium
  try {
    ({ chromium } = await import('playwright'))
  } catch {
    console.error('This script needs `playwright`, which is not a dependency of this repo. Run `npm i playwright`, then remove it again.')
    process.exit(1)
  }

  const override = process.env.CSP ?? ''
  const pages = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_PAGES

  const server = serveBuiltSite(override)
  // Loopback only: Node listens on every interface when no host is given.
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen))
  const { port } = server.address()

  // The console matcher below keys on Chromium's English violation wording.
  const browser = await chromium.launch()
  const violations = new Map()

  for (const path of pages) {
    const context = await browser.newContext()
    const page = await context.newPage()
    page.on('console', (message) => {
      const text = message.text()
      if (/Content Security Policy|Refused to/i.test(text)) {
        const key = text.split('\n')[0].slice(0, 220)
        violations.set(key, (violations.get(key) ?? 0) + 1)
      }
    })
    page.on('pageerror', error => violations.set(`page error: ${String(error).slice(0, 180)}`, 1))

    try {
      await page.goto(`http://localhost:${port}${BASE}${path}`, { waitUntil: 'networkidle', timeout: 30_000 })
      await page.waitForTimeout(1000)
      // Open search and type: nothing on a statically loaded page touches the
      // SQLite worker or its wasm, so a policy missing `'wasm-unsafe-eval'`
      // looks clean until someone actually searches.
      await page.keyboard.press('Control+K').catch(() => {})
      await page.waitForTimeout(700)
      await page.keyboard.type('batch').catch(() => {})
      await page.waitForTimeout(2500)
      await page.keyboard.press('Escape').catch(() => {})
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {})
      await page.waitForTimeout(1000)
      const workerProblem = await probeModuleWorker(page, BASE).catch(error => String(error).slice(0, 140))
      if (workerProblem) {
        violations.set(`${path}: ${workerProblem}`, 1)
      }
    } catch (error) {
      violations.set(`navigation failed for ${path}: ${String(error).slice(0, 140)}`, 1)
    }
    await context.close()
  }

  await browser.close()
  server.close()

  if (violations.size === 0) {
    console.log(`docs-csp: no violations across ${pages.length} page(s)${override ? ' (with the CSP from $CSP)' : ''}`)
    process.exit(0)
  }
  console.log('docs-csp: violations\n')
  for (const [message, count] of violations) {
    console.log(`  ${count}x ${message}`)
  }
  process.exit(1)
}

await main()
