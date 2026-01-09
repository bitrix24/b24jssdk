/**
 * Define the environment
 */

export enum Environment {
  UNKNOWN = 'unknown',
  BROWSE = 'browser',
  NODE = 'node'
}

export function getEnvironment(): Environment {
  // Check for the presence of a window (browser)
  if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
    return Environment.BROWSE
  }

  // Check for the presence of process (Node.js)
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    return Environment.NODE
  }

  return Environment.UNKNOWN
}
