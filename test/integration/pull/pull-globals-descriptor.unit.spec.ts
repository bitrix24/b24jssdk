/**
 * The pull specs must install their browser globals by descriptor, not by
 * assignment — and must put back what they found.
 *
 * `globalThis.navigator = …` reads as equivalent to `defineProperty` and is not.
 * Node's built-in `navigator` is a getter with no setter, and a spec file is an
 * ES module, so in strict mode the assignment throws:
 *
 *     TypeError: Cannot set property navigator of #<Object> which has only a getter
 *
 * It passed anyway for as long as it did because the teardown used `delete`,
 * which removes the built-in for the whole process. The first file to run paid
 * the error; every later file found a plain writable property. `jsSdk:unit` runs
 * its files serially in one process, so "which file runs first" decided whether
 * the suite was green — a dependency on file order that the default order
 * happened to satisfy. Measured on `main`: five failures in five shuffled runs,
 * zero in the unshuffled order.
 *
 * A regression test cannot simply be "run the suite in the wrong order", because
 * the harness picks the order. So this pins the two properties that make order
 * stop mattering, directly — and exercises the real helpers rather than a local
 * copy, since a test comparing two expressions it computed itself cannot fail.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { defineGlobal, restoreGlobal } from '../../0_setup/browser-globals'

const ORIGINAL = Object.getOwnPropertyDescriptor(globalThis, 'navigator')

function restore() {
  if (ORIGINAL) {
    Object.defineProperty(globalThis, 'navigator', ORIGINAL)
  } else {
    delete (globalThis as never as Record<string, unknown>).navigator
  }
}

describe('#222 pull specs install browser globals safely', () => {
  afterEach(restore)

  it('Node ships navigator as a getter with no setter — the premise', () => {
    // If this stops holding, the fix is unnecessary rather than wrong; the test
    // says so instead of quietly passing for a new reason.
    expect(ORIGINAL).toBeDefined()
    expect(typeof ORIGINAL!.get).toBe('function')
    expect(ORIGINAL!.set).toBeUndefined()
    expect(ORIGINAL!.configurable).toBe(true)
  })

  it('plain assignment throws against that descriptor — the bug', () => {
    expect(() => {
      ;(globalThis as never as Record<string, unknown>).navigator = { onLine: true }
    }).toThrowError(/only a getter/)
  })

  it('defineGlobal installs over the getter-only built-in — the fix', () => {
    defineGlobal('navigator', { onLine: true })
    expect((globalThis.navigator as unknown as { onLine: boolean }).onLine).toBe(true)
    restoreGlobal('navigator')
  })

  it('restoreGlobal puts the built-in back, rather than deleting it', () => {
    defineGlobal('navigator', { onLine: false })
    restoreGlobal('navigator')

    const now = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    // `delete` — the old teardown — leaves this undefined, and the next file's
    // assignment then succeeds for the wrong reason. That is the whole bug.
    expect(now).toBeDefined()
    expect(typeof now!.get).toBe('function')
  })

  it('the lifecycle spec no longer assigns any browser global directly', async () => {
    // Read as text rather than exercised, because the failure mode is a future
    // edit reintroducing the assignment — which would pass every behavioural
    // test in that file, in the lucky order.
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const { dirname, join } = await import('node:path')

    const here = dirname(fileURLToPath(import.meta.url))
    const source = readFileSync(join(here, 'pull-client-lifecycle-222.unit.spec.ts'), 'utf8')

    expect(source).not.toMatch(/\(globalThis as any\)\.(window|document|navigator|XMLHttpRequest)\s*=/)
    expect(source).toContain('defineGlobal(')
    expect(source).toContain('restoreGlobal(')
  })
})
