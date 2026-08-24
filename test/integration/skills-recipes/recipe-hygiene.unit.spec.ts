/**
 * #64a — recipe hygiene: every shared helper has exactly one copy.
 *
 * The bug that motivated this: `baseStage` existed three times. Recipes 03 and
 * 06 each carried `s.includes(':') ? s.split(':')[1] : s`, which returns `''`
 * for `'C2:'`, while the tested copy in `lib/funnel.ts` returns `'C2:'`. So the
 * suite was pinning behaviour no shipped recipe had.
 *
 * No recipe's control flow actually differed — neither `''` nor `'C2:'` matches
 * a stage key, so both fell through the same way. The point is not that this
 * drift bit, but that it went unnoticed: a duplicate is invisible to a test
 * that imports the original, so nothing could have caught it. The next
 * divergence might not be harmless, and for `safeEqual` — a constant-time
 * compare — it would be a vulnerability that looks like a refactor.
 *
 * These are source-text guards, so be honest about the ceiling: they catch a
 * verbatim copy and a rename of one, because they check the helper's body shape
 * as well as its name. They cannot catch an independent re-implementation that
 * reaches the same result by different syntax (`s.slice(s.indexOf(':') + 1)`
 * would slip past). That is inherent to matching text rather than behaviour —
 * treat these as a ratchet against the copy-paste that actually happened, not
 * as proof that no fourth copy can ever exist.
 *
 * Pure text inspection, no portal — jsSdk:unit.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const examplesDir = resolve(__dirname, '../../../skills/b24jssdk-recipes/examples')
const exampleFiles = readdirSync(examplesDir).filter(name => name.endsWith('.ts'))

/** Blank out comments so a prose mention is never read as code. */
const stripComments = (source: string) => source
  .replaceAll(/\/\*[\s\S]*?\*\//g, ' ')
  .replaceAll(/\/\/[^\n]*/g, ' ')

const readCode = (name: string) => stripComments(readFileSync(join(examplesDir, name), 'utf8'))

/**
 * Escape a literal for embedding in a RegExp. The module paths below contain
 * `.` and `/`; escaping only the leading `../` would rely on the rest never
 * gaining a metacharacter, which is an invariant nothing enforces.
 */
const escapeRegExp = (literal: string) => literal.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)

/**
 * One row per helper that recipes must import rather than re-declare.
 * `bodyShape` is what every copy seen in the wild has looked like — matching it
 * is what stops a rename from walking straight past the name check.
 */
const SHARED_HELPERS = [
  {
    name: 'baseStage',
    module: '../lib/funnel',
    bodyShape: /\.split\(\s*['"`]:['"`]\s*\)\s*\[\s*1\s*\]/
  },
  {
    name: 'safeEqual',
    module: '../lib/crypto',
    bodyShape: /\btimingSafeEqual\s*\(/
  }
] as const

describe('#64a — recipes use the tested helpers, not private copies', () => {
  it('finds the recipe files (an empty sweep would pass everything vacuously)', () => {
    expect(exampleFiles.length).toBeGreaterThan(0)
  })

  describe.each(SHARED_HELPERS)('$name', ({ name, module, bodyShape }) => {
    const declaration = new RegExp(String.raw`(?:const|let|var|function)\s+${name}\b`)
    // Tolerant of quote style and an explicit `.js` extension — both are
    // correct, and a guard that rejected them would be a false alarm.
    const importOf = new RegExp(
      String.raw`import\s*\{[^}]*\b${name}\b[^}]*\}\s*from\s*['"]${escapeRegExp(module)}(?:\.js)?['"]`
    )

    it.each(exampleFiles)(`%s declares no ${name} of its own`, (file) => {
      expect(readCode(file)).not.toMatch(declaration)
    })

    it.each(exampleFiles)(`%s does not re-implement ${name} under another name`, (file) => {
      expect(readCode(file)).not.toMatch(bodyShape)
    })

    it.each(exampleFiles)(`%s imports ${name} from ${module} if it uses it`, (file) => {
      const code = readCode(file)
      if (!new RegExp(String.raw`\b${name}\s*\(`).test(code)) {
        return
      }
      expect(code).toMatch(importOf)
    })
  })
})
