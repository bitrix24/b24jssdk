<script setup lang="ts">
import type { TypeB24, Result, LoggerBrowser } from '@bitrix24/b24jssdk'
import type { TableColumn } from '@bitrix24/b24ui-nuxt'
import { AjaxError, EnumCrmEntityTypeId } from '@bitrix24/b24jssdk'

// Initialization
let $b24: undefined | TypeB24 = undefined
let $logger: undefined | LoggerBrowser = undefined

// Defining type for contact item
interface ContactItem {
  id: number
  name: string
  lastName: string
  assignedById: number
  assignedByName?: string
}

// Component state
const isLoading = ref(true)
const contacts = ref<ContactItem[]>([])
const totalContacts = ref(0)
const currentPage = ref(1)
const pageSize = ref(50)

// Table reference
const table = useTemplateRef('table')

// Defining table columns
const columns: TableColumn<ContactItem>[] = [
  {
    accessorKey: 'id',
    header: 'ID',
    cell: ({ row }) => `#${row.getValue('id')}`
  },
  {
    accessorKey: 'name',
    header: 'First Name',
    cell: ({ row }) => row.getValue('name') || '-'
  },
  {
    accessorKey: 'lastName',
    header: 'Last Name',
    cell: ({ row }) => row.getValue('lastName') || '-'
  },
  {
    accessorKey: 'assignedByName',
    header: 'Responsible Person',
    cell: ({ row }) => row.getValue('assignedByName') || '-'
  }
]

/**
 * Load contacts list
 */
async function loadContacts(): Promise<void> {
  if (!$b24 || !$logger) {
    throw new Error('$b24 not initialized')
  }

  try {
    isLoading.value = true
    $logger.info('Loading contacts...')

    const start = (currentPage.value - 1) * pageSize.value

    const response: Result = await $b24.callMethod(
      'crm.item.list',
      {
        entityTypeId: EnumCrmEntityTypeId.contact,
        select: ['id', 'name', 'lastName', 'assignedById'],
        order: { id: 'desc' }
      },
      start
    )

    const data = response.getData()

    // Get user information to display responsible person names
    const assignedByIds = [...new Set((data.result?.items || []).map((contact: any) => contact.assignedById))].filter(Boolean)
    const usersMap = new Map()

    if (assignedByIds.length > 0) {
      const usersResponse: Result = await $b24.callMethod(
        'user.get',
        {
          ID: assignedByIds
        }
      )
      const usersData = usersResponse.getData()
      usersData.result?.forEach((user: any) => {
        usersMap.set(Number(user.ID), `${user.NAME} ${user.LAST_NAME}`)
      })
    }

    const dataList: ContactItem[] = (data?.result?.items || []).map((item: any) => ({
      id: Number(item.id),
      name: item.name,
      lastName: item.lastName,
      assignedById: Number(item.assignedById),
      assignedByName: usersMap.get(Number(item.assignedById)) || `ID: ${item.assignedById}`
    }))

    contacts.value = dataList
    totalContacts.value = data?.total || 0

    $logger.info(`Loaded ${dataList.length} contacts, total: ${totalContacts.value}`)
  } catch (error: unknown) {
    $logger.error('Request failed:', error)
    throw error
  } finally {
    isLoading.value = false
  }
}

/**
 * Page change handler
 */
function handlePageChange(page: number): void {
  currentPage.value = page
  loadContacts()
}

// Application initialization
onMounted(async () => {
  const b24Instance = useB24()

  $b24 = b24Instance.get()
  $logger = b24Instance.buildLogger()

  $logger.info('Hi from contact list')

  try {
    if (!$b24) {
      throw new Error('$b24 not initialized')
    }

    // Load initial data
    await loadContacts()
  } catch (error) {
    $logger!.error(error)

    const processErrorData = {}
    let statusMessage = 'Error'
    let message = ''
    let statusCode = 404

    if (error instanceof AjaxError) {
      statusCode = error.status
      statusMessage = error.name
      message = `${error.message}`
    } else if (error instanceof Error) {
      message = error.message
    } else {
      message = error as string
    }

    showError({
      statusCode,
      statusMessage,
      message,
      data: Object.assign({}, processErrorData),
      cause: error,
      fatal: true
    })
  }
})
</script>

<template>
  <B24Card
    variant="outline"
    class="flex-1 w-full"
    :b24ui="{
      header: 'p-[12px] px-[14px] py-[14px] sm:px-[14px] sm:py-[14px]',
      body: 'p-0 sm:px-0 sm:py-0 h-[400px]',
      footer: 'p-[12px] px-[14px] py-[14px] sm:px-[14px] sm:py-[14px])'
    }"
  >
    <template #header>
      <div class="flex flex-wrap items-center justify-between">
        <ProseH5 class="mb-0">
          Contacts List
        </ProseH5>
        <B24Button
          size="sm"
          label="Refresh"
          color="air-secondary-accent-1"
          :disabled="isLoading"
          @click="loadContacts"
        />
      </div>
    </template>

    <!-- Loading state -->
    <div v-if="isLoading" class="p-2">
      <div class="space-y-4">
        <div class="flex gap-4 mt-2">
          <B24Skeleton class="h-6 w-1/6" />
          <B24Skeleton class="h-6 w-1/3" />
          <B24Skeleton class="h-6 w-1/3" />
          <B24Skeleton class="h-6 w-1/3" />
        </div>

        <B24Separator class="my-2" />

        <div class="space-y-3">
          <div v-for="row in 5" :key="row" class="flex gap-4 mt-2">
            <B24Skeleton class="h-4 w-1/6" />
            <B24Skeleton class="h-4 w-1/3" />
            <B24Skeleton class="h-4 w-1/3" />
            <B24Skeleton class="h-4 w-1/3" />
          </div>
        </div>
      </div>
    </div>

    <!-- Empty list state -->
    <B24Empty
      v-else-if="!isLoading && contacts.length === 0"
      title="No contacts found"
      description="There are no contacts in your CRM system yet."
      :actions="[{
        label: 'Refresh',
        color: 'air-primary',
        onClick: loadContacts
      }]"
      :b24ui="{
        root: 'ring-0'
      }"
    />

    <!-- Contacts table -->
    <B24Table
      v-else
      ref="table"
      :data="contacts"
      :columns="columns"
      :loading="isLoading"
      sticky
      class="h-[400px]"
    />

    <!-- Pagination -->
    <template #footer>
      <div class="flex flex-wrap items-center justify-between gap-y-2">
        <ProseP small accent="less" class="mb-0">
          Total: {{ totalContacts }}
        </ProseP>
        <B24Pagination
          v-model:page="currentPage"
          size="sm"
          color="air-tertiary-no-accent"
          :disabled="isLoading"
          :items-per-page="pageSize"
          :total="totalContacts"
          @update:page="handlePageChange"
        />
      </div>
    </template>
  </B24Card>
</template>
