/**
 * Displays an animated progress bar in the console.
 *
 * This function clears the current output line and draws a bar consisting of
 * filled (█) and empty (░) blocks, as well as a percentage.
 *
 * @param {number} createdCount - Number of items already processed.
 * @param {number} total - Total number of items to process.
 *
 * @example
 * showProgress(50, 100); // Outputs: Progress: [██████████░░░░░░░░░] 50% (50/100)
 *
 * @returns {void}
 */
export function showProgress(createdCount: number, total: number): void {
  const percentage = Math.round((createdCount / total) * 100)

  const progressBarLength = 20
  const filledLength = Math.floor((percentage / 100) * progressBarLength)
  const progressBar = '█'.repeat(filledLength) + '░'.repeat(progressBarLength - filledLength)

  process.stdout.clearLine(0)
  process.stdout.cursorTo(0)
  process.stdout.write(`\rProgress: [${progressBar}] ${percentage}% (${createdCount}/${total})`)
}
