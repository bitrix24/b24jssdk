import type { ToolOptions } from './abstract-tool'
import { AbstractTool } from './abstract-tool'

/**
 * Ping
 *
 * @todo use apiVer3
 * @todo add docs
 */
export class Ping extends AbstractTool {
  /**
   * Measures the response speed of the Bitrix24 REST API.
   * Performs a test request and returns the response time in milliseconds.
   * Useful for performance monitoring and diagnosing latency issues.
   *
   * @note The method uses a minimal API request (`server.time`) to check availability.
   *   Does not overload the server with large amounts of data.
   *
   * @param options Some options for executing
   *   - `requestId?: string` - Unique request identifier for tracking. Used for query deduplication and debugging (default: undefined)
   *
   * @returns {Promise<number>} Promise that resolves to a response time in milliseconds:
   *   - Positive number: time from sending the request to receiving the response
   *   - In case of an error or timeout: `-1`
   *
   * @see {@link HealthCheck} To check API availability
   */
  public override async make(options?: ToolOptions & { requestId?: string }): Promise<number> {
    const startTime = Date.now()
    try {
      await this._b24.actions.v2.call.make({
        method: 'server.time',
        params: {},
        requestId: options?.requestId
      })
      return Date.now() - startTime
    } catch {
      return -1
    }
  }
}
