/**
 * Shared engine for the two "compile the fenced code blocks" gates.
 *
 * `docs-typecheck.mjs` has checked the fences under `docs/content/**` since #109.
 * `skills-typecheck-blocks.mjs` does the same for `skills/*\/SKILL.md` (#402),
 * and the reason it exists is worth stating: skill files are what an AI agent
 * reads BEFORE it writes code, so a broken snippet there is not a page someone
 * might misread — it is a template that gets reproduced. The first run of this
 * gate found a documented class that is not exported from the package at all.
 *
 * `jsdoc-typecheck-blocks.mjs` joined them in #439 for the `@example` bodies in
 * `packages/jssdk/src/**` — the examples an IDE shows on hover, and the only kind
 * of example in this repository that nothing compiled. It passes its own
 * `extract`; everything downstream is shared.
 *
 * The three differ only in which files they walk, how a block is recognised
 * inside one, which ambient declarations the fragments may rely on, and where
 * the scratch directory lives. Everything else
 * — fence extraction, the `// @check-ignore` marker, mapping a `tsc` diagnostic
 * back to `file:line:col` in the Markdown, the GitHub annotation escaping — is
 * identical, and lived in one copy before this split. It stays in one copy.
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createReporter } from './_reporter.mjs'

/**
 * Extract ```ts / ```typescript fenced blocks from a markdown file.
 *
 * Skips:
 *  - ```ts-type fences (type-signature fragments, not executable code)
 *  - Blocks preceded by // @check-ignore (optionally "// @check-ignore: reason")
 *    on the nearest non-empty line above the fence
 *
 * Returns: Array of { lines: string[], startLine: number, filePath: string }
 * where startLine is the 1-indexed line of the first code line in the MD file.
 */
export function extractTsBlocks(content, filePath) {
  // Normalise CRLF so that line splitting and regex matching work correctly
  // on files committed with Windows line endings.
  const fileLines = content.replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let inFence = false
  let fenceLen = 0
  let fenceChar = '`'
  let collecting = false
  let blockLines = []
  let blockStart = 0
  let skip = false

  for (let i = 0; i < fileLines.length; i++) {
    const line = fileLines[i]

    if (!inFence) {
      // Every opening fence is tracked, not just the ts ones. A fence of any
      // language makes its body literal text, and a ```ts marker inside one is
      // part of that text rather than a fence of its own — which is exactly what
      // `telegram-release-post.md` contains: a four-backtick ````text block
      // holding a template for an announcement, with ```ts placeholders inside
      // it. Scanning only for ts openings turned those placeholders into
      // TS1127 (#435). Same family as #441: a fence marker is only a fence
      // where markdown says it is.
      const open = line.match(/^(`{3,}|~{3,})\s*(\S*)/)
      if (!open) continue

      const isTs = /^(?:typescript|ts)(?:\s+\[.*?\])?$/.test(
        line.slice(open[1].length).trim()
      )

      fenceLen = open[1].length
      fenceChar = open[1][0]
      inFence = true
      // A non-ts fence is consumed to its close and discarded. `skip` already
      // means "inside a fence whose content is not compiled", so it carries this
      // too — and it is reset on close along with everything else.
      collecting = isTs
      blockLines = []
      // blockStart is the 1-indexed line of the first code line (line after the fence).
      blockStart = i + 2

      // Check for // @check-ignore (optionally "// @check-ignore: reason") on
      // the nearest preceding non-empty line.
      let prev = i - 1
      while (prev >= 0 && fileLines[prev].trim() === '') prev--
      skip = prev >= 0 && fileLines[prev].trim().startsWith('// @check-ignore')
      continue
    }

    // Inside fence — check for matching closing fence. It must be the same
    // character as the opening one and at least as long, or a ``` inside a
    // ````text block would close it early.
    const close = line.match(/^(`{3,}|~{3,})\s*$/)
    if (close && close[1][0] === fenceChar && close[1].length >= fenceLen) {
      if (collecting && !skip && blockLines.length > 0) {
        blocks.push({ lines: [...blockLines], startLine: blockStart, filePath })
      }
      inFence = false
      skip = false
      collecting = false
      blockLines = []
      continue
    }

    if (collecting && !skip) blockLines.push(line)
  }

  return blocks
}

/**
 * Compile every fenced block in `files` and report diagnostics against the
 * original Markdown coordinates.
 *
 * @param {object} options
 * @param {string} options.label       prefix for every log line, e.g. `docs-typecheck`
 * @param {string} options.repoRoot    absolute repo root
 * @param {string} options.checkDir    scratch dir holding tsconfig.json + globals.d.ts
 * @param {string[]} options.files     absolute paths of the Markdown files to walk
 * @returns {number} process exit code — 0 clean, 1 on any error
 */
export function checkBlocks({ label, repoRoot, checkDir, files, extract = extractTsBlocks }) {
  const tmpDir = join(checkDir, 'tmp')
  const tsconfigPath = join(checkDir, 'tsconfig.json')
  const tscBin = join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc')
  const report = createReporter({ label, root: repoRoot })

  if (!existsSync(tscBin)) {
    console.error(`\u001B[31mERROR\u001B[0m ${label}: TypeScript not installed — run \`pnpm install\``)
    return 1
  }

  // Clean and recreate the tmp directory on every run.
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true })
  mkdirSync(tmpDir, { recursive: true })

  /** @type {Map<string, { filePath: string, startLine: number }>} */
  const blockMap = new Map()
  let blockIndex = 0

  for (const file of files) {
    const content = readFileSync(file, 'utf8')
    for (const block of extract(content, file)) {
      const name = `block-${String(blockIndex).padStart(4, '0')}.ts`
      writeFileSync(join(tmpDir, name), block.lines.join('\n') + '\n', 'utf8')
      blockMap.set(name, { filePath: file, startLine: block.startLine })
      blockIndex++
    }
  }

  if (blockIndex === 0) {
    // Not a pass. An empty sweep means the glob stopped matching — a renamed
    // directory, say — and reporting "0 errors" for it would read as healthy.
    console.error(`\u001B[31mERROR\u001B[0m ${label}: no TS blocks found — the file list is empty, which is almost certainly a broken path rather than a clean tree`)
    return 1
  }

  const result = spawnSync(
    process.execPath,
    [tscBin, '--noEmit', '-p', tsconfigPath],
    { cwd: repoRoot, encoding: 'utf8' }
  )

  // tsc writes diagnostics to stdout; combine both streams to be safe.
  const output = (result.stdout ?? '') + (result.stderr ?? '')

  // Parse: path/to/block-XXXX.ts(LINE,COL): error|warning TSNNNN: message
  // tsc sometimes emits continuation lines (indented) after the primary
  // diagnostic — collect them so the full message is reported.
  const DIAG_RE = /^(.+\.ts)\((\d+),(\d+)\): (error|warning) (TS\d+): (.+)$/
  const outputLines = output.split('\n')

  for (let i = 0; i < outputLines.length; i++) {
    const m = outputLines[i].match(DIAG_RE)
    if (!m) continue
    const [, rawPath, lineStr, colStr, level, code, firstMessage] = m
    if (level === 'warning') continue // warnings-only: skip for now

    // Collect indented continuation lines (type expansion details, etc.)
    let message = firstMessage
    while (i + 1 < outputLines.length && /^\s+/.test(outputLines[i + 1])) {
      i++
      message += ' ' + outputLines[i].trim()
    }

    const block = blockMap.get(basename(rawPath))
    if (!block) {
      // Error in globals.d.ts or an untracked file — surface it as infrastructure noise.
      report.error(null, `infrastructure error — ${rawPath}: ${message}`, { code })
      continue
    }
    const mdLine = block.startLine + (Number.parseInt(lineStr, 10) - 1)
    report.error(block.filePath, message, { line: mdLine, col: Number.parseInt(colStr, 10), code })
  }

  // Remove tmp on success; keep on failure for local debugging.
  if (report.errors === 0) rmSync(tmpDir, { recursive: true })

  report.note(`${blockIndex} block(s) checked`)
  return report.finish()
}
