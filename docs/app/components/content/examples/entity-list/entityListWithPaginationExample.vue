<script setup lang="ts">
import type { TypeB24, LoggerBrowser, Result } from '@bitrix24/b24jssdk'
import type { TableColumn } from '@bitrix24/b24ui-nuxt'

// Initialization
const propsWithB24 = inject<{ logger: LoggerBrowser, b24: TypeB24 }>('propsWithB24')
const $b24: TypeB24 | undefined = propsWithB24?.b24
const $logger: LoggerBrowser | undefined = propsWithB24?.logger

if (typeof $b24 !== 'object' || typeof $logger !== 'object') {
  showError({
    statusCode: 404,
    statusMessage: 'B24 not init',
    data: {
      description: 'Problem in app'
    },
    fatal: true
  })
}

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
  if (!$b24) {
    throw new Error('$b24 not initialized')
  }

  try {
    isLoading.value = true
    $logger.info('Loading contacts...')

    const start = (currentPage.value - 1) * pageSize.value

    const response: Result = await $b24.callMethod(
      'crm.contact.list',
      {
        select: ['ID', 'NAME', 'LAST_NAME', 'ASSIGNED_BY_ID'],
        order: { ID: 'desc' }
      },
      start
    )

    const data = response.getData()

    // Get user information to display responsible person names
    const assignedByIds = [...new Set(data.result?.map((contact: any) => contact.ASSIGNED_BY_ID))].filter(Boolean)
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

    const dataList: ContactItem[] = (data?.result || []).map((item: any) => ({
      id: Number(item.ID),
      name: item.NAME,
      lastName: item.LAST_NAME,
      assignedById: Number(item.ASSIGNED_BY_ID),
      assignedByName: usersMap.get(Number(item.ASSIGNED_BY_ID)) || `ID: ${item.ASSIGNED_BY_ID}`
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
  try {
    // Load initial data
    await loadContacts()
  } catch (error) {
    $logger?.error('Failed to initialize contacts app:', error)
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
      footer: 'p-[12px] px-[14px] py-[14px] sm:px-[14px] sm:py-[14px] text-(length:--ui-font-size-xs) text-(--b24ui-typography-legend-color)'
    }"
  >
    <template #header>
      <div class="flex items-center justify-between">
        <h2 class="text-(length:--ui-font-size-lg) font-(--ui-font-weight-medium)">
          Contacts List
        </h2>
        <B24Button
          label="Refresh"
          color="air-secondary-accent-1"
          :disabled="isLoading"
          @click="loadContacts"
        />
      </div>
    </template>

    <!-- Loading state -->
    <div v-if="isLoading" class="p-8">
      <div class="space-y-4">
        <B24Skeleton class="h-4 w-full" />
        <B24Skeleton class="h-4 w-full" />
        <B24Skeleton class="h-4 w-full" />
        <B24Skeleton class="h-4 w-3/4" />
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
      <div class="flex items-center justify-between">
        <div class="text-(length:--ui-font-size-sm)">
          Showing {{ contacts.length }} of {{ totalContacts }} contacts
        </div>
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
