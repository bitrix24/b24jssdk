import { B24Hook } from '@bitrix24/b24jssdk'

// Method 1: From an environment variable with a full URL
const webhookUrl = process.env.BITRIX24_WEBHOOK_URL
const $b24 = useB24().get() as B24Hook || B24Hook.fromWebhookUrl(webhookUrl!)

// Method 2: From separate environment variables
// const $b24 = new B24Hook({
//   b24Url: process.env.BITRIX24_URL!,
//   userId: Number.parseInt(process.env.BITRIX24_USER_ID!),
//   secret: process.env.BITRIX24_WEBHOOK_SECRET!
// })

// Example of using the created instance
async function testConnection(): Promise<boolean> {
  try {
    // Check the connection by requesting server time information
    const response = await $b24.callMethod('server.time')

    if (!response.isSuccess) {
      throw new Error(`Connection error: ${response.getErrorMessages().join('; ')}`)
    }

    const serverTime = response.getData().result
    console.log(`Connected to Bitrix24: time ${serverTime}`)
    return true
  } catch (error) {
    console.error('Problem connecting:', error)
    return false
  }
}

// Start connection check
const isConnected = await testConnection()
if (isConnected) {
  console.log('B24Hook successfully initialized')
}
