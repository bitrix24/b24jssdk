/**
 * #139 — `docs/app/utils/codeTransform.ts`.
 *
 * This turns every `app/examples/*.ts` file into the snippet a docs page shows,
 * and it runs during prerender too, building `/raw/*.md` and `llms-full.txt`.
 * A page that silently shows the wrong code is worse than one that fails to
 * build, so the cases below are mostly about the ways the previous
 * brace-counting version got the boundaries wrong.
 *
 * Pure text transform, no Nuxt app and no portal — jsSdk:unit.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { prepareCode, transformCodeForDocumentationSafe } from '../../../docs/app/utils/codeTransform'

const example = (body: string) => [
  'import { B24Hook } from \'@bitrix24/b24jssdk\'',
  '',
  'export async function Action_demo() {',
  '  // region: start ////',
  body,
  '  // endregion: start ////',
  '}'
].join('\n')

describe('transformCodeForDocumentationSafe (#139)', () => {
  it('keeps imports and the region body, dropping the wrapper', () => {
    const out = transformCodeForDocumentationSafe(example('  const a = 1'))
    expect(out).toContain('import { B24Hook }')
    expect(out).toContain('const a = 1')
    expect(out).not.toContain('Action_demo')
    expect(out).not.toContain('region: start')
  })

  it('stops at the end marker', () => {
    // `// endregion: start ////` contains `region: start` as a substring, so
    // the previous order of tests matched the region branch first and
    // `continue`d — the loop never broke and everything after the marker was
    // still processed. It only looked right because the sole line after it is
    // a closing brace that `.slice(2)` empties.
    const code = [
      'export async function Action_demo() {',
      '  // region: start ////',
      '  const kept = 1',
      '  // endregion: start ////',
      '  const leaked = 2',
      '}'
    ].join('\n')
    const out = transformCodeForDocumentationSafe(code)
    expect(out).toContain('const kept = 1')
    expect(out).not.toContain('leaked')
  })

  it('is not confused by a brace inside a string literal', () => {
    // The old version tracked `{`/`}` to decide where the example's function
    // ended. An unbalanced brace in a string drove the depth to zero early,
    // after which the rewrites below stopped being applied to the rest.
    const out = transformCodeForDocumentationSafe(example([
      '  const opener = \'a{\'',
      '  const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl(\'https://x/rest/1/y/\')'
    ].join('\n')))
    expect(out).toContain('const opener = \'a{\'')
    // The hook override must still be stripped despite the stray brace above.
    expect(out).toContain('const $b24 = B24Hook.fromWebhookUrl(\'https://x/rest/1/y/\')')
    expect(out).not.toContain('useB24().get()')
  })

  it('is not confused by a brace inside a comment', () => {
    const out = transformCodeForDocumentationSafe(example([
      '  // returns { result }',
      '  const $logger = LoggerFactory.createForBrowser(\'X\', true)'
    ].join('\n')))
    expect(out).toContain('// returns { result }')
    expect(out).toContain('createForBrowser(\'X\', devMode)')
  })

  it('is not confused by two braces on one line', () => {
    // `} else {` is balanced to a per-line `includes` check but not to a real
    // count; `{ a: { b: 1 } }` is the mirror case.
    const out = transformCodeForDocumentationSafe(example([
      '  if (x) { a() } else { b() }',
      '  const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl(\'u\')'
    ].join('\n')))
    expect(out).toContain('const $b24 = B24Hook.fromWebhookUrl(\'u\')')
  })

  it('rewrites the dev-mode flag a bundler would have inlined', () => {
    const out = transformCodeForDocumentationSafe(example(
      '  const _devMode = typeof import.meta !== \'undefined\' && (true || globalThis._importMeta_.env?.DEV)'
    ))
    expect(out).toContain('const devMode = typeof import.meta !== \'undefined\' && (import.meta?.dev || import.meta.env?.DEV)')
    expect(out).not.toContain('globalThis._importMeta_')
    expect(out).not.toContain('_devMode')
  })

  it('returns nothing for a file with no region markers', () => {
    expect(transformCodeForDocumentationSafe('const a = 1\n')).toBe('')
  })
})

describe('the real examples still transform exactly as before (#139)', () => {
  // The rewrite had to be behaviour-preserving on everything shipped today;
  // these assert the properties that would have caught a regression, over each
  // real file rather than a fixture.
  const examplesDir = resolve(__dirname, '../../../docs/app/examples')
  const files = readdirSync(examplesDir).filter(name => name.endsWith('.ts') && name !== 'index.ts')

  it('finds the example files', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files)('%s produces a snippet with no scaffolding left in it', (file) => {
    const out = prepareCode(readFileSync(join(examplesDir, file), 'utf8'))
    expect(out.length).toBeGreaterThan(0)
    expect(out).not.toContain('region: start')
    expect(out).not.toContain('export async function Action_')
    // Only the B24Hook override is stripped. Frame examples legitimately keep
    // `useB24().get() as B24Frame` — a frame app really does take its instance
    // from the composable, so there is nothing to substitute there.
    expect(out).not.toContain('as B24Hook || ')
    expect(out).not.toContain('_devMode')
    expect(out).not.toContain('globalThis._importMeta_')
    // Dedent removed exactly the wrapper's two spaces, so nothing starts at a
    // deeper level than the snippet's own nesting.
    expect(out.split('\n')[0]?.startsWith(' ')).toBe(false)
  })
})
