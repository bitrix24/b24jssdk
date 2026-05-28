#!/usr/bin/env node

/**
 * Type-checks all ```ts / ```typescript fenced blocks in docs/content/docs/**\/*.md
 * against the live @bitrix24/b24jssdk package types.
 *
 * Design:
 *  - Each block is written as a standalone .ts file in .docs-typecheck/tmp/.
 *  - .docs-typecheck/globals.d.ts provides ambient declarations for $b24, $logger,
 *    and ImportMeta extensions so short snippets compile without their own imports.
 *  - tsc runs against .docs-typecheck/tsconfig.json, which includes both
 *    globals.d.ts and all generated block files.
 *  - Error locations are mapped back to the original .md file:line:col.
 *
 * Markers:
 *  - // @check-ignore on the line immediately before a ```ts fence skips that block.
 *  - ```ts-type fences (type signature fragments) are never checked.
 *
 * Prerequisites: pnpm install && pnpm run dev:prepare (creates dist/ for jssdk types).
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { join, resolve, relative, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { walkMarkdownFiles } from './_docs-utils.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const DOCS_ROOT = join(REPO_ROOT, 'docs', 'content', 'docs')
const CHECK_DIR = join(REPO_ROOT, '.docs-typecheck')
const TMP_DIR = join(CHECK_DIR, 'tmp')
const TSCONFIG_PATH = join(CHECK_DIR, 'tsconfig.json')
const TSC_BIN = join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc')

const IS_CI = process.env.GITHUB_ACTIONS === 'true'

let errors = 0

// GitHub Actions workflow commands use %25/%0D/%0A as escape sequences.
// Without escaping, a tsc message containing a literal newline could inject
// additional workflow commands (e.g. ::set-env::, ::add-mask::).
function escapeAnnotation(s) {
  return s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
}

function logError(mdFile, mdLine, col, code, message) {
  const relFile = relative(REPO_ROOT, mdFile)
  console.log(`\x1B[31mERROR\x1B[0m ${relFile}:${mdLine}:${col} ${code}: ${message}`)
  if (IS_CI) {
    process.stdout.write(
      `::error file=${escapeAnnotation(relFile)},line=${mdLine},col=${col}::${escapeAnnotation(code)}: ${escapeAnnotation(message)}\n`
    )
  }
  errors++
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
function extractTsBlocks(content, filePath) {
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

function main() {
  if (!existsSync(TSC_BIN)) {
    console.error('\x1B[31mERROR\x1B[0m docs-typecheck: TypeScript not installed — run `pnpm install`')
    process.exit(1)
  }
  const sdkTypes = join(REPO_ROOT, 'packages', 'jssdk', 'dist', 'esm', 'index.d.ts')
  if (!existsSync(sdkTypes)) {
    console.error('\x1B[31mERROR\x1B[0m docs-typecheck: @bitrix24/b24jssdk types not built — run `pnpm run dev:prepare`')
    process.exit(1)
  }

  // Clean and recreate the tmp directory on every run.
  if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true })
  mkdirSync(TMP_DIR, { recursive: true })

  // Walk docs and collect all TS blocks.
  const files = walkMarkdownFiles(DOCS_ROOT)
  /** @type {Map<string, { filePath: string, startLine: number }>} */
  const blockMap = new Map()
  let blockIndex = 0

  for (const file of files) {
    const content = readFileSync(file, 'utf8')
    const blocks = extractTsBlocks(content, file)
    for (const block of blocks) {
      const name = `block-${String(blockIndex).padStart(4, '0')}.ts`
      writeFileSync(join(TMP_DIR, name), block.lines.join('\n') + '\n', 'utf8')
      blockMap.set(name, { filePath: file, startLine: block.startLine })
      blockIndex++
    }
  }

  if (blockIndex === 0) {
    console.log('docs-typecheck: no TS blocks found')
    return
  }

  // Run tsc.
  const result = spawnSync(
    process.execPath,
    [TSC_BIN, '--noEmit', '-p', TSCONFIG_PATH],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  )

  // tsc writes diagnostics to stdout; combine both streams to be safe.
  const output = (result.stdout ?? '') + (result.stderr ?? '')

  // Parse: path/to/block-XXXX.ts(LINE,COL): error|warning TSNNNN: message
  // tsc sometimes emits continuation lines (indented) after the primary
  // diagnostic — collect them so the full message is reported.
  const DIAG_RE = /^(.+\.ts)\((\d+),(\d+)\): (error|warning) (TS\d+): (.+)$/
  const outputLines = output.split('\n')

  for (let i = 0; i < outputLines.length; i++) {
    const line = outputLines[i]
    const m = line.match(DIAG_RE)
    if (!m) continue
    const [, rawPath, lineStr, colStr, level, code, firstMessage] = m
    if (level === 'warning') continue // warnings-only: skip for now

    // Collect indented continuation lines (type expansion details, etc.)
    let message = firstMessage
    while (i + 1 < outputLines.length && /^\s+/.test(outputLines[i + 1])) {
      i++
      message += ' ' + outputLines[i].trim()
    }

    const tmpName = basename(rawPath)
    const block = blockMap.get(tmpName)
    if (!block) {
      // Error in globals.d.ts or an untracked file — surface it as infrastructure noise.
      console.error(`\x1B[31mERROR\x1B[0m docs-typecheck: infrastructure error — ${rawPath}: ${code}: ${message}`)
      errors++
      continue
    }
    const tscLine = Number.parseInt(lineStr, 10)
    const mdLine = block.startLine + (tscLine - 1)
    logError(block.filePath, mdLine, Number.parseInt(colStr, 10), code, message)
  }

  // Remove tmp on success; keep on failure for local debugging.
  if (errors === 0) rmSync(TMP_DIR, { recursive: true })

  console.log(`\ndocs-typecheck: ${blockIndex} block(s) checked, ${errors} error(s)`)
  if (errors > 0) process.exit(1)
}

main()
