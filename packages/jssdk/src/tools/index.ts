/**
 * Returns a new object containing only the specified keys from `data`.
 */
export function pick<Data extends object, Keys extends keyof Data>(data: Data, keys: Keys[]): Pick<Data, Keys> {
  const result = {} as Pick<Data, Keys>

  for (const key of keys) {
    result[key] = data[key]
  }

  return result
}

/**
 * Returns a shallow copy of `data` with the specified keys removed.
 */
export function omit<Data extends object, Keys extends keyof Data>(data: Data, keys: Keys[]): Omit<Data, Keys> {
  const result = { ...data }

  for (const key of keys) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete result[key]
  }

  return result as Omit<Data, Keys>
}

/**
 * Type guard that returns `true` when `item` is an array of arrays rather than a flat array.
 */
export function isArrayOfArray<A>(item: A[] | A[][]): item is A[][] {
  return Array.isArray(item[0])
}

/**
 * Returns the enum member whose value equals `value`, or `undefined` if no match is found.
 *
 * @example
 * const result = getEnumValue(EnumBizprocDocumentType, 'CCrmDocumentSmartOrder')
 */
export function getEnumValue<T extends Record<string, string | number>>(
  enumObj: T,
  value: string | number
): T[keyof T] | undefined {
  return (Object.values(enumObj) as (string | number)[]).includes(value)
    ? value as T[keyof T]
    : undefined
}
