import { SdkError } from '../core/sdk-error'

/**
 * The eight — and only eight — comparison operators the Bitrix24 REST API v3
 * filter grammar accepts. Anything else is rejected server-side with
 * `UNKNOWNFILTEROPERATOREXCEPTION`.
 */
export type FilterV3Operator = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'between'

const FILTER_V3_OPERATORS: readonly FilterV3Operator[] = ['=', '!=', '>', '>=', '<', '<=', 'in', 'between']

/**
 * A single condition in short-form: `[field, operator, value]`.
 */
export type FilterV3Condition = [string, FilterV3Operator, unknown]

/**
 * A logical group of conditions / nested groups. `logic` defaults to `'and'`;
 * `negative: true` wraps the whole group in a NOT.
 */
export interface FilterV3Group {
  logic?: 'and' | 'or'
  negative?: boolean
  conditions: FilterV3Node[]
}

export type FilterV3Node = FilterV3Condition | FilterV3Group

function condition(field: string, operator: FilterV3Operator, value: unknown): FilterV3Condition {
  if (typeof field !== 'string' || field.length === 0) {
    throw new SdkError({
      code: 'JSSDK_FILTER_V3_INVALID_FIELD',
      description: `FilterV3: field name must be a non-empty string, got ${JSON.stringify(field)}.`,
      status: 400
    })
  }
  if (!FILTER_V3_OPERATORS.includes(operator)) {
    throw new SdkError({
      code: 'JSSDK_FILTER_V3_INVALID_OPERATOR',
      description: `FilterV3: operator "${operator}" is not one of ${FILTER_V3_OPERATORS.join(' ')}.`,
      status: 400
    })
  }
  return [field, operator, value]
}

/**
 * Typed builder for Bitrix24 REST API **v3** filters (the array-of-triples
 * dialect with AND/OR/NOT groups — see the v3 reference §3). Produces exactly
 * the structures the server accepts, so a bad operator or a malformed
 * `in` / `between` value fails fast on the client instead of as a server 400.
 *
 * @example
 * import { FilterV3 as F } from '@bitrix24/b24jssdk'
 *
 * // status = NEW  AND  (id in [1,2]  OR  id > 100)
 * const filter = F.build(
 *   F.eq('status', 'NEW'),
 *   F.or(
 *     F.in('id', [1, 2]),
 *     F.gt('id', 100)
 *   )
 * )
 * await b24.actions.v3.call.make({ method: 'tasks.task.list', params: { filter } })
 */
export const FilterV3 = Object.freeze({
  /** `field = value` */
  eq(field: string, value: unknown): FilterV3Condition {
    return condition(field, '=', value)
  },
  /** `field != value` */
  ne(field: string, value: unknown): FilterV3Condition {
    return condition(field, '!=', value)
  },
  /** `field > value` */
  gt(field: string, value: unknown): FilterV3Condition {
    return condition(field, '>', value)
  },
  /** `field >= value` */
  ge(field: string, value: unknown): FilterV3Condition {
    return condition(field, '>=', value)
  },
  /** `field < value` */
  lt(field: string, value: unknown): FilterV3Condition {
    return condition(field, '<', value)
  },
  /** `field <= value` */
  le(field: string, value: unknown): FilterV3Condition {
    return condition(field, '<=', value)
  },
  /** `field in [values]` — `values` must be a non-empty array. */
  in(field: string, values: unknown[]): FilterV3Condition {
    if (!Array.isArray(values) || values.length === 0) {
      throw new SdkError({
        code: 'JSSDK_FILTER_V3_INVALID_IN',
        description: `FilterV3.in("${field}"): value must be a non-empty array.`,
        status: 400
      })
    }
    return condition(field, 'in', values)
  },
  /** `field between [from, to]` — inclusive range of exactly two defined operands. */
  between(field: string, from: unknown, to: unknown): FilterV3Condition {
    if (from === undefined || from === null || to === undefined || to === null) {
      throw new SdkError({
        code: 'JSSDK_FILTER_V3_INVALID_BETWEEN',
        description: `FilterV3.between("${field}"): both range operands must be defined (got [${String(from)}, ${String(to)}]).`,
        status: 400
      })
    }
    return condition(field, 'between', [from, to])
  },

  /** Combine nodes with AND (for nesting inside an OR; the top level is already AND). */
  and(...conditions: FilterV3Node[]): FilterV3Group {
    return { logic: 'and', conditions }
  },
  /** Combine nodes with OR. */
  or(...conditions: FilterV3Node[]): FilterV3Group {
    return { logic: 'or', conditions }
  },
  /**
   * Negate a condition or group (wraps it in a NOT). A bare condition is wrapped
   * in a single-item AND group so the `negative` flag has somewhere to live.
   * Returns a fresh group (the input's `conditions` array is copied, not shared).
   */
  not(node: FilterV3Node): FilterV3Group {
    if (isGroup(node)) {
      return { ...node, conditions: [...node.conditions], negative: true }
    }
    return { logic: 'and', negative: true, conditions: [node] }
  },

  /**
   * Assemble the top-level filter array (its elements are AND-joined) ready to
   * pass as `params.filter`. Falsy nodes are skipped, so you can inline
   * conditionals: `F.build(F.eq('a', 1), flag && F.gt('b', 2))`.
   *
   * Always wrap with `build` (or an array) even for a single condition —
   * `params.filter` must be an array, so pass `build(F.eq('a', 1))`, not the bare
   * `F.eq('a', 1)`. Each surviving node is shape-checked, so a forgotten spread
   * (`build([F.eq(...)])`) or a hand-rolled malformed triple fails fast here
   * instead of as an opaque server error.
   */
  build(...nodes: Array<FilterV3Node | false | null | undefined>): FilterV3Node[] {
    const result = nodes.filter(Boolean) as FilterV3Node[]
    for (const node of result) {
      assertNode(node)
    }
    return result
  }
})

function isGroup(node: unknown): node is FilterV3Group {
  return !Array.isArray(node) && typeof node === 'object' && node !== null && 'conditions' in node
}

function assertNode(node: FilterV3Node): void {
  if (isGroup(node)) {
    return
  }
  const ok = Array.isArray(node)
    && node.length === 3
    && typeof node[0] === 'string'
    && FILTER_V3_OPERATORS.includes(node[1] as FilterV3Operator)
  if (!ok) {
    throw new SdkError({
      code: 'JSSDK_FILTER_V3_INVALID_NODE',
      description: `FilterV3.build: each node must be a [field, operator, value] condition or a group — got ${JSON.stringify(node)}. Did you forget to spread (build(...nodes)) or build a condition with FilterV3 helpers?`,
      status: 400
    })
  }
}
