/**
 * Pull the `@example` bodies out of a TypeScript source file.
 *
 * Companion to `extractTsBlocks` in `_typecheck-blocks.mjs`, which does the same
 * job for Markdown fences. Both feed `checkBlocks`, so the two kinds of example
 * are compiled by one engine and report diagnostics the same way (#439).
 *
 * A block runs from the line after `@example` to the next JSDoc tag or the end
 * of the comment, with the ` * ` gutter stripped. Skips a block whose first
 * non-empty line is `// @check-ignore` (optionally `: reason`) — the same escape
 * hatch the Markdown extractor honours, spelled as a comment because that is
 * what is legal inside an example body.
 *
 * **A same-line `@example 'value'` is not a block.** `types/auth.ts` uses that
 * form twelve times to show what a field looks like — `@example '1xxxxx1694'` —
 * and those are values, not code. They are skipped deliberately: feeding them to
 * `tsc` produces twelve meaningless fragments, and the emptiness of the body is
 * what distinguishes them rather than anything about where they appear.
 *
 * @param {string} content File contents.
 * @param {string} filePath Absolute path, for the returned records.
 * @returns {{ lines: string[], startLine: number, filePath: string }[]}
 *   `startLine` is the 1-indexed line of the first code line in the source file.
 */
export function extractJsDocExamples(content, filePath) {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let inComment = false
  let collecting = false
  let body = []
  let startLine = 0

  const flush = () => {
    // Trailing blank lines are an artefact of the gutter, not of the example.
    while (body.length > 0 && body[body.length - 1].trim() === '') body.pop()

    // Many examples wrap their code in a Markdown fence so it renders as a
    // block in an IDE tooltip. The fence is presentation; passing it to `tsc`
    // makes ```` ```ts ```` a tagged template and every such example fails with
    // the same TS2349. Unwrap a fence that encloses the whole body, and shift
    // `startLine` past the opening marker so a diagnostic still points at the
    // right source line.
    while (body.length > 0 && body[0].trim() === '') {
      body.shift()
      startLine++
    }
    const opening = body.length >= 2 ? body[0].trim().match(/^(?:`{3,}|~{3,})/) : null
    if (opening) {
      const marker = opening[0]
      const closeAt = body.findIndex((l, i) => i > 0 && l.trim() === marker)
      if (closeAt > 0) {
        body = body.slice(1, closeAt)
        startLine++
      }
    }
    const firstCode = body.find(l => l.trim() !== '')
    const ignored = firstCode !== undefined && firstCode.trim().startsWith('// @check-ignore')
    if (body.length > 0 && !ignored) {
      blocks.push({ lines: [...body], startLine, filePath })
    }
    body = []
    collecting = false
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const trimmed = raw.trim()

    if (!inComment) {
      if (trimmed.startsWith('/**')) inComment = true
      continue
    }

    if (trimmed.startsWith('*/')) {
      if (collecting) flush()
      inComment = false
      continue
    }

    // Strip the ` * ` gutter. A line that is only ` *` becomes empty.
    const stripped = raw.replace(/^\s*\* ?/, '')
    const tag = stripped.trim().match(/^@(\w+)/)

    if (tag) {
      if (collecting) flush()
      if (tag[1] === 'example') {
        // Anything on the tag's own line is a value example (see the note
        // above), and leaving the body empty is what drops it in `flush`.
        collecting = true
        startLine = i + 2 // the line after `@example`, 1-indexed
      }
      continue
    }

    if (collecting) body.push(stripped)
  }

  return blocks
}
