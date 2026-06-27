/**
 * Returns the emoji string only when stdout is a TTY.
 * In CI / piped environments, emojis garble logs and confuse MemoryHandler JSON.
 * Include trailing space inside the call: icon('🚀 ') so CI output has no leading space.
 */
export function icon(emoji: string): string {
  return process.stdout.isTTY ? emoji : ''
}
