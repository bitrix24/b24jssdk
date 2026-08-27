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
 * The two differ only in which files they walk, which ambient declarations the
 * fragments may rely on, and where the scratch directory lives. Everything else
 * — fence extraction, the `// @check-ignore` marker, mapping a `tsc` diagnostic
 * back to `file:line:col` in the Markdown, the GitHub annotation escaping — is
 * identical, and lived in one copy before this split. It stays in one copy.
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { join, relative, basename } from 'node:path'
import { spawnSync } from 'node:child_process'

const IS_CI = process.env.GITHUB_ACTIONS === 'true'

// GitHub Actions workflow commands use %25/%0D/%0A as escape sequences.
// Without escaping, a tsc message containing a literal newline could inject
// additional workflow commands (e.g. ::set-env::, ::add-mask::).
function escapeAnnotation(s) {
  return s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
}

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
  let blockLines = []
  let blockStart = 0
  let skip = false

  for (let i = 0; i < fileLines.length; i++) {
    const line = fileLines[i]

    if (!inFence) {
      // Match opening fence: ```ts or ```typescript, with optional [filename] annotation.
      // Explicitly exclude ```ts-type (type-signature fragments).
      const match = line.match(/^(`{3,})(typescript|ts)(?:\s+\[.*?\])?\s*$/)
      if (!match) continue

      fenceLen = match[1].length
      inFence = true
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

    // Inside fence — check for matching closing fence.
    const close = line.match(/^(`{3,})\s*$/)
    if (close && close[1].length >= fenceLen) {
      if (!skip && blockLines.length > 0) {
        blocks.push({ lines: [...blockLines], startLine: blockStart, filePath })
      }
      inFence = false
      skip = false
      blockLines = []
      continue
    }

    if (!skip) blockLines.push(line)
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
export function checkBlocks({ label, repoRoot, checkDir, files }) {
  const tmpDir = join(checkDir, 'tmp')
  const tsconfigPath = join(checkDir, 'tsconfig.json')
  const tscBin = join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc')
  let errors = 0

  function logError(mdFile, mdLine, col, code, message) {
    const relFile = relative(repoRoot, mdFile)
    console.log(`\u001B[31mERROR\u001B[0m ${relFile}:${mdLine}:${col} ${code}: ${message}`)
    if (IS_CI) {
      process.stdout.write(
        `::error file=${escapeAnnotation(relFile)},line=${mdLine},col=${col}::${escapeAnnotation(code)}: ${escapeAnnotation(message)}\n`
      )
    }
    errors++
  }

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
    for (const block of extractTsBlocks(content, file)) {
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
      console.error(`\u001B[31mERROR\u001B[0m ${label}: infrastructure error — ${rawPath}: ${code}: ${message}`)
      errors++
      continue
    }
    const mdLine = block.startLine + (Number.parseInt(lineStr, 10) - 1)
    logError(block.filePath, mdLine, Number.parseInt(colStr, 10), code, message)
  }

  // Remove tmp on success; keep on failure for local debugging.
  if (errors === 0) rmSync(tmpDir, { recursive: true })

  console.log(`\n${label}: ${blockIndex} block(s) checked, ${errors} error(s)`)
  return errors > 0 ? 1 : 0
}
