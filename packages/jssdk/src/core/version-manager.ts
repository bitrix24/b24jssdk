import { ApiVersion } from '../types/b24'
import type {
  BatchCommandsArrayUniversal,
  BatchCommandsObjectUniversal,
  BatchNamedCommandsUniversal
} from '../types/http'

/**
 * Decides which REST API version a method is routed through.
 *
 * The SDK no longer maintains a hardcoded v3 method allowlist. A portal's set of
 * v3 methods is large and version/edition-dependent (the authoritative list is
 * the portal's own OpenAPI document, `rest.documentation.openapi`), so gating on
 * a static list both lagged behind the server and blocked valid methods. The
 * server is now the single source of truth: an unknown v3 method simply comes
 * back as `METHODNOTFOUNDEXCEPTION`.
 *
 * Consequences:
 * - `actions.v3.*` no longer pre-flight-rejects a method — it is sent to the v3
 *   endpoint and the server validates it.
 * - v3 is opt-in only via the explicit `actions.v3.*` surface; version
 *   auto-detection therefore defaults to v2 (the universal endpoint).
 */
class VersionManager {
  static create(): VersionManager {
    return new VersionManager()
  }

  /**
   * List of supported API versions.
   * The highest version must be first.
   */
  public getAllApiVersions(): ApiVersion[] {
    return [ApiVersion.v3, ApiVersion.v2]
  }

  /**
   * Retained for backward compatibility. The SDK no longer keeps a v3 method
   * allowlist, so support is not decided client-side any more — always returns
   * `true`. Method existence is validated by the server.
   */
  public isSupport(_version: ApiVersion, _method: string): boolean {
    return true
  }

  /**
   * Returns the API version to use when the caller did not specify one. With the
   * allowlist removed there is no client-side signal that a method is a v3
   * method, so this defaults to v2 (the universal endpoint). Use the explicit
   * `actions.v3.*` surface to call a method on v3.
   */
  public automaticallyObtainApiVersion(_method: string): ApiVersion {
    return ApiVersion.v2
  }

  /**
   * Batch counterpart of {@link automaticallyObtainApiVersion}. Defaults to v2;
   * call `actions.v3.batch.make` explicitly to run a batch on v3.
   */
  public automaticallyObtainApiVersionForBatch(
    _calls: BatchCommandsArrayUniversal | BatchCommandsObjectUniversal | BatchNamedCommandsUniversal
  ): ApiVersion {
    return ApiVersion.v2
  }
}

export const versionManager = VersionManager.create()
