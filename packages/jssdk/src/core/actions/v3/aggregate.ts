import type { ActionOptions } from '../abstract-action'
import type { TypeCallParams } from '../../../types/http'
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

export type ActionAggregateV3 = ActionOptions & {
  method: string
  select: AggregateSelectV3
  params?: Pick<TypeCallParams, 'filter'>
  requestId?: string
}

/**
 * Runs the v3 `aggregate` action for modules that support it (reference §7).
 * `restApi:v3`
 *
 * NOTE: not verified against a live portal — no module on the SDK's reference
 * test portal currently exposes an `*.aggregate` endpoint. The request/response
 * shapes follow the published v3 reference.
 */
export class AggregateV3 extends AbstractAction {
  /**
   * @template T - bucket value type (default `number`).
   *
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
  public override async make<T = number>(options: ActionAggregateV3): Promise<Result<AggregateResultV3 & Record<string, Record<string, T>>>> {
    const result: Result<AggregateResultV3 & Record<string, Record<string, T>>> = new Result()

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

    const responseData = response.getData()
    // The aggregate payload nests one extra level: { result: { result: { <func>: {...} } } }.
    const buckets = ((responseData?.result as any)?.result ?? {}) as AggregateResultV3 & Record<string, Record<string, T>>
    return result.setData(buckets)
  }
}
