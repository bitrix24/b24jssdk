/**
 * One way to report a problem, for every check in `scripts/` (#418).
 *
 * The checks each grew their own reporting: `ERROR` / `BROKEN` / `V3-DRIFT` / a
 * bare `CSP …` prefix, four wordings of the summary line, and problems written
 * to stdout in some and stderr in others. That is survivable. What is not is the
 * reason this module exists:
 *
 * **Only the block gates emitted GitHub annotations.** `docs-typecheck` and its
 * three siblings go through `checkBlocks`, which writes `::error file=…,line=…`,
 * so their failures land inline on the pull request diff. The other six wrote
 * plain text, so a reviewer had to open the job log and find the line by eye —
 * for exactly the checks a contributor is most likely to trip: a broken link, a
 * stale `audited:` stamp, a missing API-reference row.
 *
 * A shared reporter fixes that once instead of six times, which is the whole
 * argument of #418: a fix written in one copy reaches everyone.
 *
 * What it deliberately does **not** do is flatten the vocabulary. A broken link
 * is still counted as a broken link in the summary — the level is uniform, the
 * noun stays the check's own.
 */

import { relative } from 'node:path'

// Read at emit time, not at import. Capturing it in a module constant makes the
// annotation path untestable without spawning a subprocess, and means a caller
// that sets the variable itself is ignored.
const isCI = () => process.env.GITHUB_ACTIONS === 'true'

const RED = '\u001B[31m'
const YELLOW = '\u001B[33m'
const RESET = '\u001B[0m'

// Everything below C0 except tab, carriage return and line feed, plus DEL.
// The three exceptions are handled separately: tab is harmless, and CR and LF
// are the line boundaries each of the two paths deals with in its own way.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL = /[\u0000-\u0008\v\f\u000E-\u001F\u007F]/g

/**
 * GitHub Actions workflow commands use %25/%0D/%0A as escape sequences.
 * Without escaping, a message containing a literal newline could inject
 * additional workflow commands (e.g. ::set-env::, ::add-mask::).
 *
 * Other control characters are dropped rather than escaped: an escape character
 * reaching the annotation would paint ANSI into the CI log just as it would on
 * the printed line, and an annotation has no use for one.
 */
export function escapeAnnotation(s) {
  return String(s)
    .replaceAll(CONTROL, '')
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A')
}

/**
 * Make a value safe to interpolate into the human-readable line.
 *
 * The line goes to the runner's stdout, and GitHub parses a workflow command
 * from *any* line there — after trimming leading whitespace, so indenting a
 * continuation does not help. Anything that can start a new line therefore has
 * to go: a lone `\r` is a line boundary to the .NET-based runner, which is why
 * `escapeAnnotation` escapes it alongside `\n`, and this has to match that
 * threat model rather than only handling `\n`.
 *
 * **Applied to the path as well as the message.** A POSIX filename may contain
 * anything but `/` and NUL, newline included, and these checks walk directories
 * a contributor edits freely — so a file named to embed a workflow command is
 * the most naturally attacker-controlled input here, and it reaches the line
 * through the path rather than through the message.
 *
 * Other control characters are dropped outright: an escape character in a
 * filename could otherwise repaint the log with ANSI sequences and hide what a
 * check reported.
 */
function oneLine(value) {
  return String(value).replaceAll(CONTROL, '').replaceAll(/\r\n?|\n/g, ' | ')
}

/**
 * @param {object} options
 * @param {string} options.label       prefix for the summary line, e.g. `docs-lint`
 * @param {string} [options.root]      paths are printed relative to this
 * @param {string} [options.errorNoun] what an error is called in the summary
 *   ("error", "broken link", "problem") — singular; `(s)` is appended
 * @param {string} [options.warnNoun]  same for warnings, default "warning"
 * @param {number} [options.max]       stop printing after this many problems.
 *   They are still counted, and the summary says how many were withheld.
 */
export function createReporter({
  label,
  root = process.cwd(),
  errorNoun = 'error',
  warnNoun = 'warning',
  max = Number.POSITIVE_INFINITY
} = {}) {
  let errors = 0
  let warnings = 0
  let printed = 0
  const notes = []

  function emit(level, file, message, { line, col, code } = {}) {
    if (level === 'error') {
      errors++
    } else {
      warnings++
    }

    if (printed >= max) {
      return
    }
    printed++

    // A check with nothing to point at — a whole-repository invariant — passes
    // no file; the line then carries the label so it is still attributable.
    const where = file ? relative(root, file) : label
    const position = line === undefined ? '' : `:${line}${col === undefined ? '' : `:${col}`}`
    const prefix = level === 'error' ? `${RED}ERROR${RESET}` : `${YELLOW}WARN ${RESET}`
    const body = code ? `${code}: ${message}` : String(message)

    // Both halves go through `oneLine` — see its comment for why the path needs
    // it as much as the message does.
    console.log(`${prefix} ${oneLine(where)}${position} ${oneLine(body)}`)

    if (isCI()) {
      const parts = [`file=${escapeAnnotation(where)}`]
      if (line !== undefined) {
        parts.push(`line=${line}`)
      }
      if (col !== undefined) {
        parts.push(`col=${col}`)
      }
      process.stdout.write(
        `::${level === 'error' ? 'error' : 'warning'} ${parts.join(',')}::${escapeAnnotation(body)}\n`
      )
    }
  }

  return {
    error: (file, message, position) => emit('error', file, message, position),
    warn: (file, message, position) => emit('warn', file, message, position),

    /** Extra text for the summary line, e.g. "134 internal link(s) checked". */
    note: text => notes.push(text),

    get errors() {
      return errors
    },
    get warnings() {
      return warnings
    },

    /**
     * Print the summary and return the process exit code.
     *
     * One rule everywhere: any error fails; warnings fail only under `strict`.
     *
     * @param {object} [options]
     * @param {boolean} [options.strict] treat warnings as failures
     * @returns {number} 0 clean, 1 on failure
     */
    finish({ strict = false } = {}) {
      const withheld = errors + warnings - printed
      const parts = [`${errors} ${errorNoun}(s)`, `${warnings} ${warnNoun}(s)`, ...notes]
      if (withheld > 0) {
        parts.push(`${withheld} not shown`)
      }

      console.log(`\n${label}: ${parts.join(', ')}`)

      if (errors > 0) {
        return 1
      }
      if (strict && warnings > 0) {
        return 1
      }
      return 0
    }
  }
}
