<script setup lang="ts">
import type { B24Frame, ISODate } from '@bitrix24/b24jssdk'
import type { DateTime } from 'luxon'
import { onMounted, onUnmounted } from 'vue'
import { initializeB24Frame, LoggerFactory, EnumCrmEntityTypeId, Text } from '@bitrix24/b24jssdk'

const devMode = typeof import.meta !== 'undefined' && (import.meta.env?.DEV || import.meta.dev)
const $logger = LoggerFactory.createForBrowser('B24/jsSdk::vue', devMode)
let $b24: undefined | B24Frame

type CompanyResponse = { id: number, title: string, createdTime: ISODate }
type Company = Omit<CompanyResponse, 'createdTime'> & { createdTime: DateTime }

async function loadCompanyList(): Promise<Company[]> {
  const result: Company[] = []
  if (!$b24) {
    return result
  }

  const response = await $b24.actions.v2.call.make<{ items: CompanyResponse[] }>({
    method: 'crm.item.list',
    params: {
      entityTypeId: EnumCrmEntityTypeId.company,
      order: { id: 'DESC' },
      select: ['id', 'title', 'createdTime']
    }
  })
  if (!response.isSuccess) {
    throw new Error(`API Error: ${response.getErrorMessages().join('; ')}`)
  }

  const responseData = response.getData()!.result as { items: CompanyResponse[] }
  responseData.items.forEach((entity) => {
    result.push({
      id: entity.id,
      title: entity.title,
      createdTime: Text.toDateTime(entity.createdTime)
    })
  })

  return result
}

onMounted(async () => {
  try {
    $b24 = await initializeB24Frame()

    const companies = await loadCompanyList()
    $logger.notice('Companies loaded successfully', { companies })
  } catch (error) {
    $logger.error('Some problems', { error })
  }
})

onUnmounted(() => {
  $b24?.destroy()
})
</script>

<template>
  <p>See the result in the developer console</p>
</template>
