/**
 * @todo add docs
 */
export function pick<Data extends object, Keys extends keyof Data>(data: Data, keys: Keys[]): Pick<Data, Keys> {
  const result = {} as Pick<Data, Keys>

  for (const key of keys) {
    result[key] = data[key]
  }

  return result
}

/**
 * @todo add docs
 */
export function omit<Data extends object, Keys extends keyof Data>(data: Data, keys: Keys[]): Omit<Data, Keys> {
  const result = { ...data }

  for (const key of keys) {

    delete result[key]
  }

  return result as Omit<Data, Keys>
}

/**
 * @todo add docs
 */
export function isArrayOfArray<A>(item: A[] | A[][]): item is A[][] {
  return Array.isArray(item[0])
}

/**
 * @todo add docs
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
