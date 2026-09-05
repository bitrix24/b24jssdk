/**
 * Where a Bitrix24 REST **method name** genuinely appears, as opposed to where a
 * dotted token merely looks like one.
 *
 * Shared by `check-v3-method-refs.mjs` and its tests, so the rule that decides
 * "this is a method" is stated once. It has to be narrow: this repository writes
 * `result.items`, `response.isSuccess` and `crm.item.list` in backticks with the
 * same syntax, and only the position tells them apart (#463).
 *
 * Five positions, every one of them taken from a real occurrence rather than
 * imagined:
 *
 *  1. **A code literal** — `method: 'crm.item.list'`. The plain case.
 *  2. **A v3 batch tuple** — `first: ['crm.item.get', { … }]`, the shape
 *     `actions.v3.batch.make({ calls })` takes. The name is the first element of
 *     an array literal, so no `method:` key names it.
 *  3. **A `callMethod('x.y', …)` argument** — the deprecated entry point, which
 *     the migration pages use throughout.
 *  4. **A parameter-table row** whose first cell is `method` — the docs describe
 *     the argument in prose there, and the example inside that prose is what a
 *     reader copies first.
 *  5. **A JSDoc bullet for the `method` option** — `` - `method: string` - … ``
 *     followed by an example in backticks. Five of the eight known defect sites
 *     were of this shape, which is why `packages/jssdk/src/` has to be walked at
 *     all.
 *
 * One shape is knowingly missed: a `method:` whose value sits on the *next*
 * line. The scan is line-by-line, no occurrence in this repository is written
 * that way, and reading across lines would mean tracking string state through
 * fences for a case that does not exist. If one ever appears it is a false
 * negative — silence, not a wrong answer.
 *
 * Everything else — a backticked name in ordinary prose, a heading, a link — is
 * deliberately **not** a method position. That is the difference between a check
 * that can be left on and one that gets disabled.
 */

/**
 * A Bitrix24 method name: dot-separated segments, each starting lower-case, at
 * least two of them.
 *
 * **A segment may be camelCase.** An earlier version demanded lower-case
 * throughout, which rejected `crm.activity.mail.getContent` and
 * `crm.activity.mail.getThread` — both published by the very snapshot this
 * check validates against. A name it cannot recognise is not reported as wrong;
 * it is silently not seen at all, which is the worse failure for a gate whose
 * whole claim is fidelity to the real surface.
 *
 * Anchored at both ends by the caller so `tasks.task.list` matches but the
 * `list` of `crm.item.list` inside a longer identifier does not.
 */
const METHOD_NAME = /^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)+$/

/** Every backticked span on a line, unwrapped. */
function backtickedSpans(line) {
  return [...line.matchAll(/`([^`]+)`/g)].map(m => m[1].trim())
}

function isMethodName(token) {
  return METHOD_NAME.test(token)
}

/**
 * The cells of a markdown table row, by position.
 *
 * Split rather than filtered, for the reason `check-api-reference-index.mjs`
 * learned the hard way: dropping empty cells shifts every later column left, so
 * an empty first cell would make the second look like the first.
 */
function tableCells(line) {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) {
    return null
  }
  return trimmed.split('|').slice(1, -1).map(cell => cell.trim())
}

/** Is this row's first cell the `method` parameter? */
function isMethodParamRow(cells) {
  if (cells === null || cells.length < 2) {
    return false
  }
  // `| **`method`** | ... |` — strip the emphasis and the backticks.
  const first = cells[0].replaceAll('*', '').replaceAll('`', '').trim()
  return first === 'method'
}

/** Is this line a JSDoc bullet documenting the `method` option? */
function isMethodOptionBullet(line) {
  return /^[\s*]*-\s*`method\s*:/.test(line)
}

/**
 * Collect every method-name occurrence in `body`, with its 1-based line.
 *
 * @param {string} body File contents.
 * @returns {{ name: string, line: number, position: string }[]}
 */
export function collectMethodPositions(body) {
  const found = []
  const lines = body.split(/\r\n?|\n/)

  lines.forEach((line, index) => {
    const lineNumber = index + 1
    const add = (name, position) => {
      if (isMethodName(name)) {
        found.push({ name, line: lineNumber, position })
      }
    }

    // 1. `method: 'x.y'` — in a fence, in a snippet, in source.
    for (const m of line.matchAll(/\bmethod\s*:\s*['"]([^'"]+)['"]/g)) {
      add(m[1], 'method literal')
    }

    // 2. `['x.y', { … }]` — the v3 batch tuple.
    for (const m of line.matchAll(/\[\s*['"]([^'"]+)['"]\s*,/g)) {
      add(m[1], 'batch tuple')
    }

    // 3. `callMethod('x.y', …)` — the deprecated entry point, which the
    // migration pages are full of. It is v2 by definition, so `versionContextAt`
    // will almost always rule it out; it is collected anyway because a name is
    // either read in every position or the gate has a blind spot people find by
    // accident.
    for (const m of line.matchAll(/\bcall(?:List|Tail)?Method\s*\(\s*['"]([^'"]+)['"]/g)) {
      add(m[1], 'callMethod argument')
    }

    // 4 and 5 read the same way: backticked examples inside a line that is
    // *about* the `method` argument.
    const cells = tableCells(line)
    if (isMethodParamRow(cells) || isMethodOptionBullet(line)) {
      for (const span of backtickedSpans(line)) {
        add(span, isMethodParamRow(cells) ? 'method parameter row' : 'method option bullet')
      }
    }
  })

  return found
}

export const __testing = { isMethodName, tableCells, isMethodParamRow, isMethodOptionBullet }

/**
 * Which API version a line is talking about, or `null` when nothing says.
 *
 * Rescanned from the top of the file per call rather than indexed once: the
 * files here are documentation pages, the cost is invisible at their size, and
 * a shared index would be one more thing to keep in step with the walk.
 *
 * Order matters, most specific first, and each rule exists because a real line
 * needed it:
 *
 *  1. **The enclosing fence tag** — the docs mark a snippet ```` ```ts [v3] ````,
 *     and `5.filtering.md` shows the same `crm.item.list` call twice on one
 *     page, once under `[v2]` where it is correct and once under `[v3]` where it
 *     is the defect. Nothing but the tag separates them.
 *  2. **A nearby `actions.vN.`** — looked for both above and below, because the
 *     `method:` line sits *inside* the call it belongs to.
 *  3. **The path** — `src/core/actions/v3/`, or a `v3` in the basename
 *     (`batch-ref-v3.ts`), or a `-ver3.md` docs page. This is what keeps the v2
 *     JSDoc twins silent: their prose is identical, only the directory differs.
 *
 * Returning `null` is a real answer and the safe one: an unattributed line is
 * left alone rather than guessed at.
 */
const NEARBY_LINES = 8

export function versionContextAt(file, lines, index) {
  // 1. The fence that encloses this line, if any.
  let fenceTag = null
  let open = false
  for (let i = 0; i <= index; i++) {
    const fence = /^\s*(?:`{3,}([^`].*)?|~{3,}([^~].*)?)$/.exec(lines[i])
    if (fence === null) {
      continue
    }
    if (open) {
      open = false
      fenceTag = null
    } else {
      open = true
      const info = (fence[1] ?? fence[2] ?? '').trim()
      fenceTag = /\[v3\]/.test(info) ? 'v3' : /\[v2\]/.test(info) ? 'v2' : null
    }
  }
  if (open && fenceTag !== null) {
    return fenceTag
  }

  // 2. An `actions.vN.` in the neighbourhood, either side.
  const from = Math.max(0, index - NEARBY_LINES)
  const to = Math.min(lines.length - 1, index + NEARBY_LINES)
  const window = lines.slice(from, to + 1).join('\n')
  const v3Near = /actions\.v3\./.test(window)
  const v2Near = /actions\.v2\./.test(window)
  if (v3Near !== v2Near) {
    return v3Near ? 'v3' : 'v2'
  }

  // 3. The path — by segment, never by substring. `v3[.-]` matched anywhere in
  // the path, so a directory called `v3-migration-notes/` would have forced v3
  // on a page about v2. It surfaced because the test harness's own temporary
  // directory is named `v3-refs-…`, which is a fair warning about how easily an
  // unanchored path rule fires on something that is not a path decision.
  const segments = file.replaceAll('\\', '/').split('/').filter(Boolean)
  const version = (n) => {
    const dir = segments.slice(0, -1).includes(`v${n}`)
    const base = new RegExp(`(^|[-.])(v|ver)${n}([-.]|$)`).test(segments.at(-1) ?? '')
    return dir || base
  }
  if (version(3)) {
    return 'v3'
  }
  if (version(2)) {
    return 'v2'
  }

  return null
}
