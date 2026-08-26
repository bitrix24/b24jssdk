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
    // Exact, not `toContain`. Absence assertions alone let two regressions
    // through: dropping the blank line that stands in for the signature, and
    // not dedenting at all — the trailing `trim()` hides missing indentation on
    // the first line, so only a later line reveals it.
    const out = transformCodeForDocumentationSafe(example([
      '  const a = 1',
      '  const b = 2'
    ].join('\n')))
    expect(out).toBe([
      'import { B24Hook } from \'@bitrix24/b24jssdk\'',
      '',
      'const a = 1',
      'const b = 2'
    ].join('\n'))
  })

  it('dedents every line, not just the first', () => {
    // `.slice(0)` — no dedent at all — survives any check that only looks at
    // line 0, because `trim()` strips that one's leading whitespace anyway.
    const out = transformCodeForDocumentationSafe(example([
      '  const first = 1',
      '  const second = 2',
      '  const third = 3'
    ].join('\n')))
    for (const bodyLine of out.split('\n').slice(2)) {
      expect(bodyLine).not.toMatch(/^\s/)
    }
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

    // Presence, not just absence. Asserting only that scaffolding is gone lets
    // a transform that returns nothing but the import lines pass every check
    // above — which would ship blank examples on every page.
    const bodyLines = out.split('\n').filter(l => l.trim() !== '' && !l.startsWith('import'))
    expect(bodyLines.length).toBeGreaterThan(1)
    expect(out).toContain('$b24')
  })

  describe('#139b — indentation is measured, not assumed', () => {
    // The dedent used to be a hard-coded `.slice(2)`, which is right only while
    // every example is written with two-space indentation. These pin that an
    // example indented some other way is dedented rather than mangled: the old
    // implementation would have chopped two characters off each line, leaving a
    // four-space example still indented and eating half of a tab-indented one.
    const wrap = (body: string) => [
      'export async function Action_demo() {',
      '  // region: start ////',
      body,
      '  // endregion: start ////',
      '}'
    ].join('\n')

    it('removes four-space indentation completely', () => {
      const out = prepareCode(wrap(['    const a = 1', '    if (a) {', '      call()', '    }'].join('\n')))
      expect(out).toBe('const a = 1\nif (a) {\n  call()\n}')
    })

    it('removes tab indentation completely', () => {
      const out = prepareCode(wrap(['\tconst a = 1', '\tif (a) {', '\t\tcall()', '\t}'].join('\n')))
      expect(out).toBe('const a = 1\nif (a) {\n\tcall()\n}')
    })

    it('takes the minimum from every line, not from the first one', () => {
      const out = prepareCode(wrap(['  shallow()', '      deep()'].join('\n')))
      expect(out).toBe('shallow()\n    deep()')
    })

    it('loses the first line\'s remaining indent to the final trim', () => {
      // Documented, not desired. The function ends with `.trim()` on the joined
      // result, so when the FIRST region line is deeper than the minimum its
      // leading spaces go with it while later lines keep theirs. No example
      // opens on a nested line — they all start at the region's own level — so
      // this has no effect on anything shipped. Pinned so that if an example
      // ever does, the behaviour is a known quirk rather than a mystery.
      const out = prepareCode(wrap(['      deep()', '  shallow()'].join('\n')))
      expect(out).toBe('deep()\nshallow()')
    })

    it('is not dragged to zero by a blank line inside the region', () => {
      // A blank line has no indentation. Counting it would make the common
      // indent 0 and leave the whole snippet indented.
      const out = prepareCode(wrap(['    const a = 1', '', '    const b = 2'].join('\n')))
      expect(out).toBe('const a = 1\n\nconst b = 2')
    })
  })
})
