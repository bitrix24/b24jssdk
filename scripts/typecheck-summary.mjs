/**
 * Names the passes `pnpm run typecheck` just ran.
 *
 * The point is not decoration. `pnpm run typecheck` is eleven passes over
 * eleven different tsconfigs, and `pnpm --filter ./packages/jssdk typecheck` is
 * one of them — but both end with a silence that reads as "the types are fine".
 * #279 estimated the cost of a breaking type change from the narrow one and
 * reported it as the full run; the real cost was six errors in a tree that pass
 * never compiles (#516).
 *
 * So the run says what it covered. A reader of a CI log, or of a pull request
 * quoting "typecheck green", can see the scope of the claim instead of assuming
 * it.
 *
 * The list is derived from `package.json` rather than repeated here, so it
 * cannot drift from the script it describes — adding a pass to the `typecheck`
 * script is enough, with no second place to remember.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { scripts } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

const passes = (scripts.typecheck ?? '')
  .split('&&')
  .map(part => part.trim().replace(/^pnpm run /, ''))
  // Drop this reporter itself: it is the last link in the chain, not a pass.
  .filter(part => part.length > 0 && !part.includes('typecheck-summary'))

if (passes.length === 0) {
  // Not a hard failure: this script reports, it does not gate. But a silent
  // empty list would be the exact "silence reads as fine" problem it exists to
  // fix, so it says so.
  console.log('typecheck: could not read the pass list from package.json — the `typecheck` script may have been restructured')
  process.exit(0)
}

console.log(`\ntypecheck: ${passes.length} pass(es) green — ${passes.join(', ')}`)
console.log('typecheck: a per-package run covers ONE of these. See .github/contributing/testing.md#what-type-checks-what\n')
