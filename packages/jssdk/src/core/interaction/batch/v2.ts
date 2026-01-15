import { AbstractInteractionBatch } from './abstract-interaction-batch'

/**
 * Working with batch requests in API ver2
 */

export const MAX_BATCH_COMMANDS = 50

export class InteractionBatchV2 extends AbstractInteractionBatch {
  override get maxSize(): number {
    return MAX_BATCH_COMMANDS
  }
}
