import { SdkError } from '../core/sdk-error'

/**
 * A `$ref` substitution marker: pulls a single value from an earlier batch
 * command's context by dotted path (reference §8).
 */
export interface BatchRef { $ref: string }

/**
 * A `$refArray` substitution marker: collects one field across the `items[]` of
 * an earlier list/tail command into an array (reference §8).
 */
export interface BatchRefArray { $refArray: string }

function assertPath(path: string, who: string): void {
  if (typeof path !== 'string' || path.length === 0) {
    throw new SdkError({
      code: 'JSSDK_BATCH_REF_V3_INVALID_PATH',
      description: `${who}: path must be a non-empty dotted string (e.g. "tasks.id").`,
      status: 400
    })
  }
}

/**
 * Helpers for the v3 batch `$ref` / `$refArray` substitution markers (reference
 * §8). The **server** performs the substitution: these helpers just build the
 * marker objects you drop into a later command's `params` (the SDK forwards
 * `params` to the wire `query`), with a little client-side validation. Reference
 * an earlier command by its `as` alias — or by its numeric index if you omit `as`.
 * Only `item` (get) and `items` (list/tail) results land in context. A `$ref`
 * over an `add` result is refused with HTTP 400 `INVALIDSELECTEXCEPTION` —
 * measured.
 *
 * **On what `add` and `update` return.** With the stock ORM action traits it is
 * an id and a boolean: `AddResponse` declares one property, `public int $id`,
 * and `UpdateResponse extends BooleanResponse`. Measured through a module using
 * those traits — `add` answered `{ result: { id: 22 } }`, `update` and `delete`
 * answered `{ result: true }`, while `get` answered `{ item: … }`.
 *
 * That is the framework default, not a guarantee: a module can declare its own
 * response, and one measured on a cloud sandbox (`note.collection.*`) returned
 * the whole affected object under `result.item` from both. So read the shape the
 * module you are calling actually documents, rather than assuming either — but
 * whichever it is, it does not reach the batch context.
 *
 * **v3 only.** Substitution is a v3 batch feature. Dropped into a v2 batch
 * (`actions.v2.batch.make`) the markers are NOT substituted — they are encoded
 * as literal filter values and silently yield wrong/empty results.
 *
 * **Security:** the `path` selects from the batch's own response context, but do
 * not build it from untrusted end-user input — a crafted path could read context
 * the caller did not intend to expose to the next command.
 *
 * @example
 * import { BatchRefV3 as R } from '@bitrix24/b24jssdk'
 *
 * const response = await b24.actions.v3.batch.make({
 *   calls: [
 *     { method: 'tasks.task.list', as: 'tasks', params: { select: ['id'] } },
 *     {
 *       method: 'tasks.task.result.list',
 *       // server substitutes the array of ids collected from the first command's items[]
 *       params: { filter: [['taskId', 'in', R.refArray('tasks.id')]] }
 *     }
 *   ]
 * })
 */
export const BatchRefV3 = Object.freeze({
  /**
   * `{ $ref: path }` — substitute a single value from context, e.g.
   * `ref('newTask.item.id')`. Only `item` (get) and `items` (list/tail) land in
   * context (reference §8); an `add` or `update` result does not, whatever shape
   * that module gives it — see the note on the module docblock.
   */
  ref(path: string): BatchRef {
    assertPath(path, 'BatchRefV3.ref')
    return { $ref: path }
  },
  /**
   * `{ $refArray: path }` — collect one field across the `items[]` of an earlier
   * list/tail command, e.g. `refArray('tasks.id')`. The path MUST contain a dot
   * (`alias.field`); the server rejects a dot-less path with INVALIDSELECTEXCEPTION.
   */
  refArray(path: string): BatchRefArray {
    assertPath(path, 'BatchRefV3.refArray')
    if (!path.includes('.')) {
      throw new SdkError({
        code: 'JSSDK_BATCH_REF_V3_INVALID_REF_ARRAY',
        description: `BatchRefV3.refArray: path "${path}" must contain a dot ("alias.field") — the server collects <field> across the alias's items[].`,
        status: 400
      })
    }
    return { $refArray: path }
  }
})
