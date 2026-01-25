import type { ToolOptions } from './abstract-tool'
import { AbstractTool } from './abstract-tool'

/**
 * HealthCheck `restApi:v2`
 *
 * @todo use apiVer3
 * @todo add docs
 */
export class HealthCheck extends AbstractTool {
  /**
   * Checks the availability of the Bitrix24 REST API.
   * Performs a simple request to the API to verify the service is operational and that the required access rights are present.
   *
   * @note The method uses a minimal API request (`server.time`) to check availability.
   *   Does not overload the server with large amounts of data.
   *
   * @param options Some options for executing
   *   - `requestId?: string` - Unique request identifier for tracking. Used for query deduplication and debugging (default: undefined)
   *
   * @returns {Promise<false>} Promise that resolves to a Boolean value:
   *   - `true`: the API is available and responding
   *   - `false`: the API is unavailable, an error occurred, or the required access rights are missing
   *
   * @see {@link Ping} To measure API response speed
   */
  public override async make(options?: ToolOptions & { requestId?: string }): Promise<boolean> {
    try {
      const response = await this._b24.actions.v2.call.make({
        method: 'server.time',
        params: {},
        requestId: options?.requestId
      })
      return response.isSuccess
    } catch {
      return false
    }
  }
}
