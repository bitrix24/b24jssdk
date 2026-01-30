import { B24Hook, ApiVersion } from '@bitrix24/b24jssdk'
import * as http from 'node:http'

const $b24 = B24Hook.fromWebhookUrl('https://your_domain.bitrix24.com/rest/1/webhook_code/')

const axiosClient = $b24.getHttpClient(ApiVersion.v2).ajaxClient
axiosClient.default.httpAgent = new http.Agent({ keepAlive: false })
axiosClient.default.httpsAgent = new http.Agent({ keepAlive: false })
axiosClient.default.timeout = 300_000
