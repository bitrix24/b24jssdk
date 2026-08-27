/**
 * #399 — the docs site formats with the prettier it depends on, not a CDN copy.
 *
 * The worker used to `import()` six modules from jsDelivr. A dynamic import
 * cannot carry an `integrity` attribute, so SRI was not available even in
 * principle, and the site sets no CSP — the page executed third-party code with
 * nothing verifying it. `prettier` was already a dependency of `docs/`, used by
 * the server to prerender the same snippets, so the browser was fetching a copy
 * of something already on disk.
 *
 * These pin the half a build cannot: that the six module specifiers resolve, and
 * that they still format what the site asks them to. A green build proves the
 * bundle was produced, not that the parsers work.
 *
 * Portal-free (jsSdk:unit).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const repoRoot = resolve(__dirname, '../../..')
const read = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8')
const workerSource = read('docs/app/workers/prettier.js')

describe('#399 the prettier worker uses the bundled dependency', () => {
  it('imports no CDN URL', () => {
    // The host that was there, and the general shape — so swapping jsDelivr for
    // another CDN does not quietly pass.
    expect(workerSource).not.toContain('cdn.jsdelivr.net')
    expect(workerSource).not.toMatch(/import\(\s*[`'"]https?:/)
  })

  it('imports the six modules from the package', () => {
    for (const specifier of [
      'prettier/standalone',
      'prettier/plugins/babel',
      'prettier/plugins/estree',
      'prettier/plugins/html',
      'prettier/plugins/markdown',
      'prettier/plugins/typescript'
    ]) {
      expect(workerSource).toContain(`import('${specifier}')`)
    }
  })

  it('resolves and formats markdown with an embedded TypeScript block', async () => {
    // Resolved FROM the docs package, which is where the worker lives and where
    // `prettier` is declared — the root workspace does not depend on it, so a
    // bare `import('prettier/standalone')` here would fail for a reason that
    // says nothing about the site. This also makes the test check the thing
    // that actually matters: that the specifiers resolve in the package that
    // bundles them.
    const requireFromDocs = createRequire(join(repoRoot, 'docs/nuxt.config.ts'))
    const load = (specifier: string) =>
      import(pathToFileURL(requireFromDocs.resolve(specifier)).href)

    const [prettier, ...plugins] = await Promise.all([
      load('prettier/standalone'),
      load('prettier/plugins/babel'),
      load('prettier/plugins/estree'),
      load('prettier/plugins/html'),
      load('prettier/plugins/markdown'),
      load('prettier/plugins/typescript')
    ])

    const source = ['# t', '', '```ts', 'const a={b:1,c:[1,2]};function f(){return a}', '```', ''].join('\n')

    const formatted = await prettier.format(source, {
      parser: 'markdown',
      plugins,
      // The options CodeExample.vue passes.
      trailingComma: 'none',
      semi: false,
      singleQuote: true,
      printWidth: 100
    })

    // The embedded block is reformatted, which is what needs the
    // babel/estree/typescript plugins — a markdown parser alone leaves it
    // untouched, and this assertion is what would notice.
    expect(formatted).toContain('const a = { b: 1, c: [1, 2] }')
    expect(formatted).toContain('function f() {')
    // The site's own style options reached the embedded code.
    expect(formatted).not.toContain(';\n')
  })

  it('builds the worker as an ES module, so the parsers stay a separate chunk', () => {
    // Vite builds a worker as an IIFE by default, and an IIFE cannot be code
    // split — every dynamic import inside it is inlined. Measured: that put all
    // of prettier into the worker script, 1.9 MB, which the plugin constructs.
    expect(read('docs/nuxt.config.ts')).toMatch(/worker:\s*\{[^}]*format:\s*'es'/)
  })

  it('constructs the worker lazily, not at plugin setup', () => {
    // The other half of the same measurement: an eagerly constructed worker
    // downloads its own script immediately, on every page, including the many
    // that never format anything.
    const plugin = read('docs/app/plugins/prettier.ts')
    expect(plugin).not.toMatch(/const worker = new PrettierWorker\(\)/)
    expect(plugin).toMatch(/api \?\?= createPrettierWorkerApi\(new PrettierWorker\(\)\)/)
  })
})
