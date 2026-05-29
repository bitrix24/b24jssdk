/**
 * Ambient declarations for docs/content/docs/**\/*.md TypeScript block checking.
 *
 * Short snippets that demonstrate API usage without a full preamble can rely on
 * these declarations instead of repeating boilerplate imports. Full examples that
 * import and construct their own $b24 / $logger are unaffected — local declarations
 * shadow ambient globals in module-scope files.
 *
 * Add new ambient names here only when a pattern appears across many doc pages.
 */

// $b24 is the live SDK client. Typed as B24Frame so that frame-specific
// properties (.dialog, .options, .parent, .placement, .slider) are available
// in short snippets. Hook/OAuth examples that construct their own client use
// a local `const $b24 = B24Hook.fromWebhookUrl(...)` which shadows this ambient.
// `let` (not `const`) is required here: many frame snippets assign to $b24 via
//   $b24 = await initializeB24Frame()
// A `declare const` ambient would make those assignments a TS2588 error.
declare let $b24: import('@bitrix24/b24jssdk').B24Frame

// initializeB24Frame is the standard bootstrap for iframe applications.
declare function initializeB24Frame(options?: Record<string, unknown>): Promise<import('@bitrix24/b24jssdk').B24Frame>

// hookUrl is a common placeholder used in webhook-based code examples.
declare const hookUrl: string

// $logger is used by some pages as a pre-constructed logger instance.
// Declared as `any` to avoid false-positives from variadic call patterns.
declare const $logger: any

// Nuxt / Vite inject these into ImportMeta at runtime. Without the extension,
// `import.meta.dev` would be a type error in snippets that guard on it.
interface ImportMeta {
  readonly dev?: boolean
  readonly env?: Record<string, string | boolean | undefined>
}

// Node.js `process` global appears in server-side recipe snippets that read
// env vars (B24_HOOK, OPENAI_API_KEY, …). We declare only the surface used
// in docs (env + execPath + exit) rather than pulling in full @types/node.
declare const process: {
  env: Record<string, string | undefined>
  execPath: string
  argv: string[]
  exit: (code?: number) => never
}
