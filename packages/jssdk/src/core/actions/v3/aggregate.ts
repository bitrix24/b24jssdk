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
 *   - list: `['amount', 'qty']`;
 *   - map:  `{ amount: 'totalAmount' }`.
 *
 * The alias in the map form is accepted, but it names the column only inside the
 * portal's own query: the response keys buckets by **function then field name**
 * in both forms. Measured — an alias never appears in an answer.
 *
 * **Every aggregated field must be filterable on the entity**, which is not the
 * same as being selectable. Ask `<entity>.field.list`: each field reports its own
 * `filterable` flag, and only fields where it is `true` may be aggregated.
 *
 * Measured on a purpose-built module (`SM_VERSION 26.150.0`) with one field left
 * without the attribute. It is returned by `list` and appears in `select`
 * normally — and aggregating it answers HTTP 400 in the v3 envelope:
 *
 * ```json
 * {"error":{"code":"BITRIX_REST_V3_EXCEPTION_VALIDATION_REQUESTVALIDATIONEXCEPTION",
 *   "validation":[{"field":"severity","message":"…требуется наличие атрибута `Filterable`…"}]}}
 * ```
 *
 * A 4xx in the v3 envelope, so it arrives **soft** — `isSuccess === false` with
 * the offending field in `AjaxError.validation[].field`. Match on the code and
 * the field, never on the message: it is localised. The same request shape put
 * through `filter` instead of the aggregate `select` answers byte-identically,
 * which is the shared validation exception showing through.
 */
export type AggregateSelectV3 = Partial<Record<AggregateFunctionV3, string[] | Record<string, string>>>

/**
 * Aggregate response buckets: `{ sum: { amount: '12345' }, count: { id: '87' } }`.
 * Keyed by function, then by field name.
 *
 * **Values are not numbers.** Measured against a portal (`SM_VERSION 26.150.0`,
 * MySQL): every value came back as a **string** — `count` as `'18'`, `avg` as
 * `'9.5000'` with the scale MySQL chose. And over a filter that matches no rows,
 * `count` is `'0'` while `sum` and `avg` are **`null`**, because SQL aggregates
 * over an empty set are null and only `count` has a zero.
 *
 * The type says so rather than lying, and the SDK does not convert. `Number()`
 * is right for a count; for a money `sum` it is not — `'12345.6700'` through a
 * float is exactly the rounding a ledger cannot have. Convert deliberately, with
 * `Text.toNumber()` or a decimal library, once you know which kind of number you
 * are holding.
 *
 * `number` is in the union because the string is what the MySQL driver returns,
 * not something the portal formats: a build on another database may well hand
 * back a native number, and that was not measured here.
 *
 * Both levels are `Partial`. The outer one because a function you did not ask
 * for is absent; the inner one because a field key is only there if the portal
 * put it there, and a plain `Record<string, …>` would promise that every string
 * key exists. `noUncheckedIndexedAccess` is on for this package but not for
 * whoever consumes the published types, so the honesty has to sit in the type.
 */
export type AggregateResultV3 = Partial<Record<AggregateFunctionV3, Partial<Record<string, string | number | null>>>>

/** @experimental options for the v3 `aggregate` action (see {@link AggregateV3}). */
export type ActionAggregateV3 = {
  method: string
  select: AggregateSelectV3
  params?: Pick<TypeCallParamsV3, 'filter'>
  requestId?: string
}

/**
 * Runs the v3 `aggregate` action for modules that support it (reference §7).
 * `restApi:v3`
 *
 * The request and response shapes here are measured, not read off the
 * reference. No **shipped** module publishes an `*.aggregate` action — checked
 * on four portals, cloud and on-premise — so they were verified against a module
 * written for the purpose, which reaches the same implementation every future
 * module will: `AggregateOrmActionTrait` on a `RestController`, and
 * `OrmRepository::getAllWithAggregate()` underneath. What that pins is the
 * framework's contract; what it cannot pin is any per-module behaviour, because
 * there is none yet to observe.
 *
 * @experimental Still experimental, for that reason: the contract is confirmed
 * but nothing in the product exercises it, so the first module to ship one may
 * surface something no synthetic caller could. Pin a version if you depend on
 * the exact shape.
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
   * @check-ignore: `some.entity.aggregate` is a placeholder, not a portal method
   *
   * @example
   * import { FilterV3, Text } from '@bitrix24/b24jssdk'
   *
   * const response = await b24.actions.v3.aggregate.make({
   *   method: 'some.entity.aggregate',
   *   select: { sum: ['amount'], count: ['id'] },
   *   params: { filter: FilterV3.build(FilterV3.eq('status', 'NEW')) }
   * })
   * if (response.isSuccess) {
   *   // Buckets are keyed by function then FIELD name — an alias, if you pass
   *   // one, never appears in the answer.
   *   const rows = Text.toNumber(response.getData()?.count?.id ?? 0)
   *   // `sum` is a string, and `null` when the filter matched nothing. Convert
   *   // deliberately: a money total through a float is a rounding you cannot undo.
   *   const rawTotal = response.getData()?.sum?.amount ?? null
   * }
   */
  public override async make(options: ActionAggregateV3): Promise<Result<AggregateResultV3>> {
    const result: Result<AggregateResultV3> = new Result()

    const select = options?.select ?? {}
    const functions = Object.keys(select)

    // Every function has to be one the portal has, and its value has to be one
    // of the two select shapes. Both are decidable from the argument alone.
    let columns = 0
    for (const fn of functions) {
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
      columns += Array.isArray(fields) ? fields.length : Object.keys(fields as object).length
    }

    // What the portal cannot answer is a query with **no aggregate column at
    // all** — `select: {}`, `select: { count: [] }`, `select: { count: {} }`.
    // Each comes back `INTERNAL_INTERNALEXCEPTION` / "Что-то пошло не так": a 500
    // with nothing in it to act on, and 500 is not a soft error, so it is
    // rethrown after the whole retry budget for a request that was never going
    // to work. Refused here instead, where the message can name the problem.
    //
    // Counted over the **whole select**, deliberately. An empty list beside a
    // non-empty one is accepted — measured: `{ count: ['id'], sum: [] }` and
    // `{ count: ['id'], sum: {} }` both answer 200 with the `count` bucket. So a
    // caller writing `sum: wantRevenue ? ['amount'] : []` is doing something the
    // portal answers, and a per-function check would refuse it with no way past.
    // A false rejection costs more than the round trip it saves, because the
    // portal would have replied.
    //
    // (Omitting `select` entirely is a different case, and one the portal
    // handles properly: 400 with `validation: [{ field: 'select' }]`.)
    if (columns === 0) {
      throw new SdkError({
        code: 'JSSDK_AGGREGATE_V3_EMPTY_SELECT',
        description: 'AggregateV3: `select` names no field to aggregate, e.g. { count: [\'id\'] }. The portal answers such a request with a 500 that says nothing, so it is refused here.',
        status: 400
      })
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
      }).catch(() => {})
      for (const [index, error] of response.errors) {
        result.addError(error, index)
      }
      return result
    }

    // The double nesting the reference (§7) describes is real, and measured:
    //   { result: { result: { count: { id: '18' } } }, time: {…} }
    // It comes from `AggregateResponse` carrying its payload in a public
    // `$result` property, which the serializer emits by name inside the envelope
    // the transport already adds. `getData()` unwraps the outer one, so the
    // buckets sit at `payload.result`.
    //
    // The fallback below stays anyway: it costs a branch, and a changed envelope
    // then degrades to a warning rather than to silence. Both off-contract arms
    // warn — the last one especially, because `{ result: null }` and a body that
    // is not an object at all are exactly the shapes where empty buckets would
    // read as a legitimately empty answer.
    const payload = response.getData()?.result as any
    let buckets: AggregateResultV3
    if (payload && typeof payload === 'object' && 'result' in payload) {
      buckets = (payload.result ?? {}) as AggregateResultV3
    } else if (payload && typeof payload === 'object') {
      this._logger.warning(`aggregate.make: response has no nested 'result.result' envelope, which is what a portal was measured to send and what the v3 reference §7 specifies; falling back to the top-level 'result'. method=${options.method}`).catch(() => {})
      buckets = payload as AggregateResultV3
    } else {
      this._logger.warning(`aggregate.make: response carried no usable 'result' object — returning empty buckets, which is not the same as an aggregate over no rows (that answers null per function). method=${options.method}`).catch(() => {})
      buckets = {}
    }
    return result.setData(buckets)
  }
}
