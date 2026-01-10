import type { IRequestIdGenerator } from '../../types/http'
import { Text } from '../../tools/text'

const DEFAULT_REQUEST_ID_HEADER_FIELD_NAME = 'X-Request-ID'
const DEFAULT_QUERY_STRING_PARAMETER_NAME = 'bx24_request_id'
const DEFAULT_QUERY_STRING_SDK_VER_PARAMETER_NAME = 'bx24_sdk_ver'
const DEFAULT_QUERY_STRING_SDK_TYPE_PARAMETER_NAME = 'bx24_sdk_type'

export class RequestIdGenerator implements IRequestIdGenerator {
  public getQueryStringParameterName(): string {
    return DEFAULT_QUERY_STRING_PARAMETER_NAME
  }

  public getQueryStringSdkParameterName(): string {
    return DEFAULT_QUERY_STRING_SDK_VER_PARAMETER_NAME
  }

  public getQueryStringSdkTypeParameterName(): string {
    return DEFAULT_QUERY_STRING_SDK_TYPE_PARAMETER_NAME
  }

  private generate(): string {
    return Text.getUuidRfc4122()
  }

  public getRequestId(): string {
    return this.generate()
  }

  public getHeaderFieldName(): string {
    return DEFAULT_REQUEST_ID_HEADER_FIELD_NAME
  }
}
