/**
 * Turns an `app/examples/*.ts` file into the snippet shown on a docs page.
 *
 * Must stay free of Vue, Nuxt and SDK imports (#139): `server/utils/transformMDC.ts`
 * calls it during SSR and prerender to build `/raw/*.md` and `llms-full.txt`, so
 * anything that constructs a client or reads runtime config would break that
 * path. Keeping it here also lets it be unit-tested without a Nuxt app.
 *
 * That extraction is itself a divergence — upstream `nuxt/ui` keeps this body
 * inline. See `.github/contributing/docs-fork.md`.
 */

/** Prefix the examples use so a live portal hook can override the placeholder. */
export const HOOK_REPLACE_IN_EXAMPLE = 'useB24().get() as B24Hook || '

/**
 * Assembled from parts on purpose. The bundler rewrites `import.meta.env` to
 * `globalThis._importMeta_.env` everywhere in this file — including inside
 * string literals — so a literal written the obvious way ends up mangled on
 * both sides of the rewrite below, and `.replace(x, x)` is a no-op. The shipped
 * server bundle contained exactly that:
 *
 *   .replace("globalThis._importMeta_.env", "globalThis._importMeta_.env")
 *
 * which is why `globalThis._importMeta_` was visible on the published pages.
 * Do not "simplify" this back into a plain string.
 */
const IMPORT_META = ['import', 'meta'].join('.')
const BUNDLED_IMPORT_META_ENV = 'globalThis._importMeta_.env'

/**
 * The published snippet is the `region: start` … `endregion: start` span, plus
 * the file's imports.
 *
 * Region markers, not brace counting. The previous version tracked `{`/`}` to
 * decide when the example's function ended, which was wrong in three ways at
 * once: it counted at most one brace per line (`} else {` reads as balanced),
 * it counted braces inside string literals and comments (`const s = 'a{'`
 * skews the depth for the rest of the file), and once the depth hit zero early
 * the `_devMode` / `$logger` / `$b24` rewrites below silently stopped being
 * applied to the rest of the snippet. The markers are already in every example
 * and say exactly what the previous code was trying to infer.
 *
 * Nested regions are not supported: the first `endregion: start` ends the
 * snippet, so anything after it is dropped. No example nests them, and the
 * markers exist to delimit one span rather than a tree.
 *
 * `endregion: start` is tested BEFORE `region: start`, because
 * `// endregion: start ////` contains `region: start` as a substring. In the
 * previous version the region branch matched first and `continue`d, so the
 * loop never broke — everything after the end marker went on being processed.
 * It looked correct only because the sole line after it is the function's
 * closing brace, which the dedent reduces to an empty string and the final
 * `trim()` removes.
 *
 * Indentation is removed by measuring it, not by assuming it. The region lines
 * sit one level in because they are inside the example's function, and that
 * level used to be stripped with a hard-coded `.slice(2)` — correct only while
 * every example is indented with exactly two spaces. An example written with
 * four spaces or a tab would have had its code mangled rather than dedented.
 */
export function transformCodeForDocumentationSafe(code: string): string {
  const lines = code.split('\n')
  const resultLines: string[] = []
  // Which entries of `resultLines` came from inside the region. The import
  // lines and the blank line standing in for the signature are emitted at
  // column zero already and must not be dedented with the rest.
  const regionLineIndexes: number[] = []
  let inStartRegion = false

  for (const line of lines) {
    const trimmedLine = line.trim()

    if (trimmedLine.startsWith('import')) {
      resultLines.push(line)
      continue
    }

    // A blank line stands in for the example's function signature.
    if (trimmedLine.includes('export async function Action_')) {
      resultLines.push('')
      continue
    }

    // Must precede the `region: start` test — see the note above.
    if (trimmedLine.includes('endregion: start')) {
      break
    }

    if (trimmedLine.includes('region: start')) {
      inStartRegion = true
      continue
    }

    if (!inStartRegion) {
      continue
    }

    regionLineIndexes.push(resultLines.length)
    resultLines.push(rewriteExampleLine(line, trimmedLine))
  }

  // Computed once, before anything is rewritten: recomputing it inside the loop
  // would measure lines this loop has already dedented, so the minimum would
  // shrink as it went and later lines would keep part of their indentation.
  const indent = commonIndent(regionLineIndexes, resultLines)
  for (const index of regionLineIndexes) {
    resultLines[index] = resultLines[index]!.slice(indent)
  }

  return resultLines.join('\n').trim()
}

/**
 * The smallest indentation across the region's non-blank lines, which is the
 * amount every one of them can lose without changing their relative structure.
 * Blank lines are skipped: an empty line has no indentation and would drag the
 * minimum to zero, leaving the snippet indented.
 */
function commonIndent(indexes: number[], resultLines: string[]): number {
  let smallest: number | undefined

  for (const index of indexes) {
    const value = resultLines[index]!
    if (value.trim().length === 0) {
      continue
    }
    const indent = value.length - value.trimStart().length
    if (smallest === undefined || indent < smallest) {
      smallest = indent
    }
  }

  return smallest ?? 0
}

/**
 * Rewrites the three lines whose in-repo form differs from what a reader should
 * copy: the dev-mode flag (bundlers inline `import.meta.dev` to a literal), the
 * logger's hard-coded `true`, and the live-portal hook override.
 */
function rewriteExampleLine(line: string, trimmedLine: string): string {
  if (trimmedLine.includes('const _devMode')) {
    // Substring rules, not three exact whole-line variants. The example is read
    // through a bundled virtual module, so what arrives here has already been
    // rewritten — `import.meta.env` becomes `globalThis._importMeta_.env`, and
    // `import.meta.dev` is folded to a literal. The previous version matched
    // only the `(true || …)` and `(false || …)` forms, so the SSR build's
    // `(import.meta?.dev || globalThis._importMeta_.env?.DEV)` fell through all
    // three and shipped `globalThis._importMeta_` onto the published page.
    return line
      .replace('const _devMode =', 'const devMode =')
      .replace(BUNDLED_IMPORT_META_ENV, `${IMPORT_META}.env`)
      .replace('(true || ', `(${IMPORT_META}?.dev || `)
      .replace('(false || ', `(${IMPORT_META}?.dev || `)
      .replace(`(${IMPORT_META}.dev || `, `(${IMPORT_META}?.dev || `)
  }

  if (trimmedLine.includes('const $logger')) {
    return line.replace(', true)', ', devMode)')
  }

  if (trimmedLine.includes('const $b24')) {
    return line.replace(HOOK_REPLACE_IN_EXAMPLE, '')
  }

  return line
}

/** @see transformCodeForDocumentationSafe */
export function prepareCode(code: string): string {
  return transformCodeForDocumentationSafe(code)
}
