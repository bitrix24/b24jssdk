/**
 * #139 — the duplicate-basename guard in `docs/modules/code-example.ts`.
 *
 * Examples are addressed by basename, and `scanDirectory` recurses, so two
 * files sharing a basename in different subdirectories would overwrite each
 * other and a page would show the wrong example. The guard turns that into a
 * build failure.
 *
 * It also has to actually escape `addExample`, whose `try/catch` used to wrap
 * the whole body — which would have caught this and printed it as a console
 * line nobody reads. That narrowing is what the last case here pins.
 *
 * jsSdk:unit — pure function, no Nuxt build.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { assertNoDuplicateExample } from '../../../docs/modules/code-example'

const example = (name: string, filePath: string) => ({
  name,
  filePath,
  content: '',
  type: 'ts' as const
})

describe('assertNoDuplicateExample (#139)', () => {
  it('allows a name that has not been seen', () => {
    expect(() => assertNoDuplicateExample({}, 'alpha', '/a/alpha.ts')).not.toThrow()
  })

  it('allows a different name alongside an existing one', () => {
    const examples = { alpha: example('alpha', '/a/alpha.ts') }
    expect(() => assertNoDuplicateExample(examples, 'beta', '/b/beta.ts')).not.toThrow()
  })

  it('throws when two files in different directories share a basename', () => {
    const examples = { shared: example('shared', '/a/shared.ts') }
    expect(() => assertNoDuplicateExample(examples, 'shared', '/b/shared.ts'))
      .toThrow(/duplicate example name "shared"/)
  })

  it('names both files, so the failure says what to rename', () => {
    const examples = { shared: example('shared', '/first/shared.ts') }
    try {
      assertNoDuplicateExample(examples, 'shared', '/second/shared.ts')
      expect.unreachable('should have thrown')
    } catch (error) {
      const message = (error as Error).message
      expect(message).toContain('/first/shared.ts')
      expect(message).toContain('/second/shared.ts')
      expect(message).toContain('Rename one of them')
    }
  })

  it('is called outside addExample\'s try/catch, so the build actually fails', () => {
    // The catch used to wrap the whole body of `addExample`. If it still did,
    // this guard would be swallowed into a console.error and the build would
    // go green while serving the wrong example — the exact failure it exists
    // to prevent. Read as source, because the call sits inside the module's
    // `setup` closure and cannot be reached any other way.
    const source = readFileSync(
      join(resolve(__dirname, '../../..'), 'docs/modules/code-example.ts'),
      'utf8'
    )
    const addExample = /async function addExample\([\s\S]*?\n {4}\}/.exec(source)?.[0] ?? ''
    expect(addExample).toContain('assertNoDuplicateExample')

    // The only `catch` in that function must sit before the guard — i.e. it
    // wraps the file read alone.
    const catchIndex = addExample.indexOf('} catch (error) {')
    const guardIndex = addExample.indexOf('assertNoDuplicateExample')
    expect(catchIndex).toBeGreaterThan(-1)
    expect(guardIndex).toBeGreaterThan(catchIndex)
  })
})
