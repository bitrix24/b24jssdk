import { AbstractInteractionBatch } from './abstract-interaction-batch'

/**
 * Working with batch requests in API ver3
 * @todo make it work
 */

/**
 * @todo waite docs apiVer3
 */
export const MAX_BATCH_COMMANDS = 50

export class InteractionBatchV3 extends AbstractInteractionBatch {
  override get maxSize(): number {
    return MAX_BATCH_COMMANDS
  }
}
