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
 * marker objects you drop into a later command's `query`, with a little
 * client-side validation. Reference an earlier command by its `as` alias.
 *
 * @example
 * import { BatchRefV3 as R } from '@bitrix24/b24jssdk'
 *
 * const response = await b24.actions.v3.batch.make({
 *   calls: [
 *     { method: 'tasks.task.list', as: 'tasks', query: { select: ['id'] } },
 *     {
 *       method: 'tasks.task.comment.list',
 *       // server substitutes the array of ids collected from the first command's items[]
 *       query: { filter: [['taskId', 'in', R.refArray('tasks.id')]] }
 *     }
 *   ]
 * })
 */
export const BatchRefV3 = Object.freeze({
  /**
   * `{ $ref: path }` — substitute a single value from context, e.g.
   * `ref('newTask.item.id')`. `add` → id / `update` → bool results are NOT in
   * context (reference §8); only `item` (get) and `items` (list/tail) are.
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
