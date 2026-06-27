/**
 * Picks a random element from an array.
 *
 * @template T - The type of array elements.
 * @param {readonly T[]} arr - The array from which to pick an element.
 * @returns {T} A random element from the passed array.
 * @throws {Error} When the array is empty.
 *
 * @example
 * const color = pickRandom(['red', 'green', 'blue']); // 'green'
 */
export function pickRandom<T>(arr: readonly T[]): T {
  const item = arr[Math.floor(Math.random() * arr.length)]
  if (item === undefined) {
    throw new Error('pickRandom: cannot pick from an empty array')
  }
  return item
}

/**
 * Generates a random integer within the given range (inclusive).
 *
 * @param {number} min - Lower bound (inclusive).
 * @param {number} max - Upper bound (inclusive).
 * @returns {number} A random integer between min and max.
 *
 * @example
 * randomInt(1, 10); // Can return either 1 or 10
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
