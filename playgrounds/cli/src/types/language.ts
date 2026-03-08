export type Language = 'english' | 'russian' | 'spanish' | 'chinese'

export interface NamesByLanguage {
  readonly firstNames: readonly string[]
  readonly lastNames: readonly string[]
}

export interface TaskTemplatesByLanguage {
  readonly verbs: readonly string[]
  readonly objects: readonly string[]
  readonly numberPrefixes: readonly string[]
}
