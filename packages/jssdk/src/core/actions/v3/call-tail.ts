import type { WalkBoundsOptions, WalkProgress } from '../_walk-bounds'
import { isWalkBoundsError } from '../_walk-bounds'
import type { TypeCallParams, TypeCallParamsV3, TypeFilterV3 } from '../../../types/http'
import { AbstractAction } from '../abstract-action'
import { Result } from '../../result'
import { SdkError } from '../../sdk-error'
import type { FilterV3Group } from '../../../tools/filter-v3'
import { assertTailFilter, filterMentionsField, keysetPaginate, KeysetPaginationError } from './_keyset-paginate'
import { CURSOR_STALLED_HINT_TAIL } from '../_cursor-stalled'

export type ActionCallTailV3 = WalkBoundsOptions & {
  /** Called after each collected page; see `WalkProgress`. */
  progress?: WalkProgress
  method: string
  /**
   * `filter` is narrowed away from the `restApi:v2` object dialect, which the
   * portal rejects everywhere in v3. A **logic group** stays allowed: this
   * walker forwards `filter` untouched, and the portal accepts a bare group as
   * the whole filter — measured.
   */
  params?: Omit<TypeCallParamsV3, 'pagination' | 'order' | 'cursor' | 'filter'> & { filter?: TypeFilterV3 | FilterV3Group }
  cursorField?: string
  order?: 'ASC' | 'DESC' | 'asc' | 'desc' | string
  customKeyForResult?: string
  requestId?: string
  limit?: number
  initialValue?: number | string
}

/**
 * Fast data retrieval via the native `tail` (keyset cursor) action, without
 * counting the total number of records. `restApi:v3`
 *
 * The eager counterpart of `fetchTail`: it walks the same native
 * `cursor: { field, value, order, limit }` pagination and returns every record
 * as a single array. See the v3 reference §6.2. The cursor field MUST NOT appear
 * in `filter`.
 */
export class CallTailV3 extends AbstractAction {
  /**
   * Returns every record of a `tail` method as one array.
   *
   * @template T - The type of the elements of the returned array (default is `unknown`).
   *
   * @param {ActionCallTailV3} options - parameters for executing the request.
   *     - `method: string` - A REST API `tail` method name (for example: `main.eventlog.tail`).
   *     - `params?: Omit<TypeCallParamsV3, 'pagination' | 'order' | 'cursor'>` - Request parameters
   *         (`filter`, `select`). `pagination`, `order` and `cursor` are managed by this helper.
   *         The cursor field must NOT be used in `filter`.
   *     - `cursorField?: string` - The DTO field that drives the cursor. Default is `id`.
   *     - `order?: 'ASC' | 'DESC'` - Cursor direction. Default is `ASC`. For `DESC` you MUST pass
   *         `initialValue` (the server pages by `field < value`, so the default `0` returns nothing).
   *     - `customKeyForResult?: string` - The key the response groups rows under. Default is `items`.
   *     - `requestId?: string` - Unique request identifier for tracking.
   *     - `maxPages?: number` - Stop after this many pages and throw
   *         `JSSDK_ACTION_MAX_PAGES_EXCEEDED` naming the method. Defaults to 10 000 — a
   *         backstop, not a policy. Nothing is returned when it fires.
   *     - `signal?: AbortSignal` - Stop the walk. Checked at the top of each iteration, so an
   *         already-aborted signal costs no request. Throws `JSSDK_ACTION_ABORTED`.
   *     - `progress?: (p: { pages: number, rows: number }) => void` - Called after each
   *         collected page. Counts, not a percentage — cursor paging reads no total.
   *     - `limit?: number` - How many records to retrieve at a time. Default is `50`.
   *         **A request, not a guarantee.** Each method applies its own maximum and a page
   *         shorter than `limit` is not the end of the data — `tasks.task.list` answers 50
   *         however much you ask for, measured with 60 rows available. This walker is
   *         cap-tolerant; hand-rolled paging on `call.make` is not. On the build measured, a
   *         `limit` of `0` or a non-numeric one was refused with
   *         `INVALIDPAGINATIONEXCEPTION` and a negative one answered a bare 500 — one
   *         method on one on-premise build, so treat the codes as what to expect rather
   *         than a contract.
   *     - `initialValue?: number | string` - Cursor start value for the first page. Default is `0`
   *         (valid for ascending numeric fields); required for `DESC` and for non-numeric fields.
   *
   * @returns {Promise<Result<T[]>>} A promise that resolves to the result of an REST API call.
   *
   * @example
   * const response = await b24.actions.v3.callTail.make<{ id: string }>({
   *   method: 'main.eventlog.tail',
   *   params: { select: ['id', 'auditType'] },
   *   cursorField: 'id',
   *   customKeyForResult: 'items'
   * })
   * if (!response.isSuccess) {
   *   throw new Error(`Problem: ${response.getErrorMessages().join('; ')}`)
   * }
   * console.log(`Result: ${response.getData()?.length}`)
   */
  public override async make<T = unknown>(options: ActionCallTailV3): Promise<Result<T[]>> {
    const batchSize = options?.limit ?? 50
    const result: Result<T[]> = new Result()

    const cursorField = options?.cursorField ?? 'id'
    const order = options?.order ?? 'ASC'
    const customKeyForResult = options?.customKeyForResult ?? 'items'
    const params = options?.params ?? {}

    assertTailFilter(params['filter'], 'callTail.make')

    // DESC keyset needs an explicit start: the server pages by `field < value`,
    // so the default first-page value 0 would match nothing for a non-negative
    // field. Require `initialValue` (the type maximum / newest value) for DESC.
    if (/desc/i.test(order) && options?.initialValue === undefined) {
      throw new SdkError({
        code: 'JSSDK_CORE_B24_CALL_TAIL_DESC_REQUIRES_INITIAL_VALUE',
        description: 'callTail.make: order "DESC" requires an explicit `initialValue` (the server pages by `field < value`, so the default 0 returns nothing). Pass `initialValue` set to the type maximum / newest value.',
        status: 500
      })
    }

    // Cursor field must not also live in `filter` (server rejects with
    // INVALIDFILTEREXCEPTION). The scan descends into logic groups: it used to
    // look only at a top-level array of triples, which stopped seeing anything
    // at all once a bare group became a legal filter here, and had never seen a
    // group nested inside the array form.
    if (filterMentionsField(params['filter'], cursorField)) {
      this._logger.warning(`callTail.make: the cursor field "${cursorField}" must not appear in \`filter\` — the server orders and pages by it and will reject a filter on the same field (INVALIDFILTEREXCEPTION). Remove it from \`filter\`.`).catch(() => {})
    }

    // Cursor field must be readable to advance. Append it to an explicit
    // `select`; warn for a non-default cursorField when `select` is omitted.
    let select = params['select'] as string[] | undefined
    if (Array.isArray(select)) {
      if (!select.includes(cursorField)) {
        select = [...select, cursorField]
      }
    } else if (cursorField !== 'id') {
      this._logger.warning(`callTail.make: no \`select\` provided with a non-default cursorField "${cursorField}" — make sure it is in the server's default field set, otherwise pass \`select\` including "${cursorField}" so the cursor can advance.`).catch(() => {})
    }

    const { select: _ignoredSelect, ...restParams } = params as TypeCallParams

    const allItems: T[] = []
    let pages = 0
    try {
      for await (const page of keysetPaginate<T>(this._b24, this._logger, {
        method: options.method,
        requestId: options.requestId,
        customKeyForResult,
        initialCursor: options?.initialValue ?? 0,
        // Native keyset: drive the server's `cursor: { field, value, order, limit }`.
        buildParams: cursor => ({
          ...restParams,
          ...(select ? { select } : {}),
          cursor: { field: cursorField, value: cursor, order, limit: batchSize }
        }),
        // Advance by the raw cursor-field value from the last item; a missing
        // value (cursorField not selected / wrong name) stops the walk.
        readNextCursor: lastItem => lastItem[cursorField] ?? null,
        noCursorWarning: `callTail.make: pagination stops here — no value could be read from the returned items via cursorField "${cursorField}". Make sure cursorField matches a field present in the response (and in \`select\`).`,
        errorLabel: 'callTailMethod',
        actionLabel: 'callTail.make',
        stalledCursorHint: CURSOR_STALLED_HINT_TAIL,
        maxPages: options?.maxPages,
        signal: options?.signal
      })) {
        for (const item of page) {
          allItems.push(item)
        }
        pages += 1
        options.progress?.({ pages, rows: allItems.length })
      }
    } catch (error) {
      if (error instanceof KeysetPaginationError) {
        for (const [index, err] of error.errors) {
          result.addError(err, index)
        }
      } else if (isWalkBoundsError(error)) {
        // A bound the caller set, not a fault in the data: the pages already
        // collected are correct, so they are returned with the error attached
        // rather than discarded — the same shape this walker already produces
        // for a soft error from the portal.
        result.addError(error)
      } else {
        throw error
      }
    }

    return result.setData(allItems)
  }
}
