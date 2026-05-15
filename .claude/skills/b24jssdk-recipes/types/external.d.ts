/**
 * Type stubs for the opt-in runtime dependencies referenced by recipes.
 *
 * These packages are NOT installed in this workspace — each recipe documents
 * its own `pnpm add ...` requirement and is expected to be copied into a
 * downstream project. The stubs here exist so that `pnpm run skills:typecheck`
 * can validate the SDK-side correctness of the recipes (AjaxResult shape,
 * actions surface, etc.) without forcing the workspace to ship every dep.
 *
 * Trade-off: external-package usage is typed as `any`, so misuse of grammy /
 * openai / express / node-cron is NOT caught here. That is OK — the recipes
 * are templates; the user will get full types when they `pnpm add` the package
 * in their own project. The primary purpose of this typecheck pass is to
 * prevent regressions in the SDK API surface (e.g. accessing `e.description`
 * on AjaxError, which does not exist).
 */

declare module 'node-cron' {
  const cron: any
  export default cron
}

declare module 'grammy' {
  // grammy exports `Bot` as both a value (constructor) and a type. Declare a
  // class so consumers can use it in both positions (`new Bot(...)` and `bot: Bot`).
  export class Bot {
    constructor(token: string)
    [key: string]: any
  }
}

declare module 'openai' {
  export default class OpenAI {
    constructor(opts?: any)
    [key: string]: any
  }
}

declare module 'express' {
  const express: any
  export type Request = any
  export type Response = any
  export default express
}
