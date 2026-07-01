import type { ActionOptions } from '../abstract-action'
import type { TypeCallParams, TypeCallParamsV3 } from '../../../types/http'
import type { AjaxResult } from '../../http/ajax-result'
import { AbstractAction } from '../abstract-action'
import { Result } from '../../result'
import { SdkError } from '../../sdk-error'

/**
 * The six aggregate functions the v3 `aggregate` action accepts (reference §7).
 * Anything else is rejected server-side with `UNKNOWNAGGREGATEFUNCTIONEXCEPTION`.
 */
export type AggregateFunctionV3 = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'countDistinct'

const AGGREGATE_FUNCTIONS: readonly AggregateFunctionV3[] = ['sum', 'avg', 'min', 'max', 'count', 'countDistinct']

/**
 * Per-function field selection. Two forms (reference §7):
 *   - list: `['amount', 'qty']` — default alias `<func>_<field>`;
 *   - map:  `{ amount: 'totalAmount' }` — custom alias.
 * Note: the response keys buckets by the **field name**, not the alias.
 */
export type AggregateSelectV3 = Partial<Record<AggregateFunctionV3, string[] | Record<string, string>>>

/**
 * Aggregate response buckets: `{ sum: { amount: 12345 }, count: { id: 87 } }`.
 * Keyed by function, then by field name.
 */
export type AggregateResultV3 = Partial<Record<AggregateFunctionV3, Record<string, number>>>

/** @experimental options for the v3 `aggregate` action — unverified live (see {@link AggregateV3}). */
export type ActionAggregateV3 = ActionOptions & {
  method: string
  select: AggregateSelectV3
  params?: Pick<TypeCallParamsV3, 'filter'>
  requestId?: string
}

/**
 * Runs the v3 `aggregate` action for modules that support it (reference §7).
 * `restApi:v3`
 *
 * @experimental NOT verified against a live portal — no module on the SDK's
 * reference test portal currently exposes an `*.aggregate` endpoint. The
 * request/response shapes follow the published v3 reference and may change once
 * verified live; pin to a version if you depend on the exact shape.
 */
export class AggregateV3 extends AbstractAction {
  /**
   * @param {ActionAggregateV3} options
   *     - `method: string` - an `*.aggregate` method name.
   *     - `select: AggregateSelectV3` - per-function field selection (`sum`/`avg`/`min`/`max`/`count`/`countDistinct`).
   *     - `params?: { filter }` - optional v3 filter (array-of-triples; use `FilterV3` to build it).
   *     - `requestId?: string` - tracking id.
   *
   * @returns {Promise<Result<AggregateResultV3>>} buckets keyed by function then field name.
   *
   * @example
   * const response = await b24.actions.v3.aggregate.make({
   *   method: 'some.entity.aggregate',
   *   select: { sum: { amount: 'totalAmount' }, count: ['id'] },
   *   params: { filter: FilterV3.build(FilterV3.eq('status', 'NEW')) }
   * })
   * if (response.isSuccess) {
   *   const total = response.getData()?.sum?.amount
   * }
   */
  public override async make(options: ActionAggregateV3): Promise<Result<AggregateResultV3>> {
    const result: Result<AggregateResultV3> = new Result()

    const select = options?.select ?? {}
    for (const fn of Object.keys(select)) {
      if (!AGGREGATE_FUNCTIONS.includes(fn as AggregateFunctionV3)) {
        throw new SdkError({
          code: 'JSSDK_AGGREGATE_V3_INVALID_FUNCTION',
          description: `AggregateV3: "${fn}" is not an aggregate function — use one of ${AGGREGATE_FUNCTIONS.join(' ')}.`,
          status: 400
        })
      }
      const fields = (select as Record<string, unknown>)[fn]
      if (!Array.isArray(fields) && (typeof fields !== 'object' || fields === null)) {
        throw new SdkError({
          code: 'JSSDK_AGGREGATE_V3_INVALID_SELECT',
          description: `AggregateV3: select.${fn} must be a string[] (default alias) or a { field: alias } map.`,
          status: 400
        })
      }
    }

    // `TypeCallParams.select` is typed `string[]` for the `list` methods, but the
    // v3 `aggregate` action takes an object select (`{ sum: { field: alias } }`);
    // the server accepts it, hence the cast.
    const params: TypeCallParams = { select: select as unknown as TypeCallParams['select'] }
    if (options?.params?.filter) {
      params.filter = options.params.filter
    }

    const response: AjaxResult<unknown> = await this._b24.actions.v3.call.make<unknown>({
      method: options.method,
      params,
      requestId: options.requestId
    })

    if (!response.isSuccess) {
      this._logger.error('aggregateMethod', {
        method: options.method,
        requestId: options.requestId,
        messages: response.getErrorMessages()
      })
      for (const [index, error] of response.errors) {
        result.addError(error, index)
      }
      return result
    }

    // The reference (§7) nests one extra level: { result: { result: { <func>: {...} } } }.
    // `getData()` unwraps the outer `result`, so the buckets are at `payload.result`.
    // This shape is unverified against a live portal — be defensive: if a portal
    // returns the buckets at a single level instead, fall back to the payload and
    // warn rather than silently returning empty data.
    const payload = response.getData()?.result as any
    let buckets: AggregateResultV3
    if (payload && typeof payload === 'object' && 'result' in payload) {
      buckets = (payload.result ?? {}) as AggregateResultV3
    } else if (payload && typeof payload === 'object') {
      this._logger.warning(`aggregate.make: response has no nested 'result.result' envelope (the v3 reference §7 specifies double nesting); falling back to the top-level 'result'. method=${options.method}`)
      buckets = payload as AggregateResultV3
    } else {
      buckets = {}
    }
    return result.setData(buckets)
  }
}
