<script setup lang="ts">
import type { GroupRow } from '#shared/types/base'
import infoMetaData from '@bitrix24/b24icons-vue/info-metadata.json'

const groups: Ref<GroupRow[]> = ref(infoMetaData.list as unknown as GroupRow[])

const title = ''
const prefix = ''
const suffix = ''
const description = ''

useSeoMeta({
  titleTemplate: `${prefix}%s ${suffix}- Bitrix24 Icons`,
  title,
  ogTitle: `${prefix}${title} ${suffix}- Bitrix24 Icons`,
  description,
  ogDescription: description
})

const { mobileLinks } = useHeader()
</script>

<template>
  <B24SidebarLayout
    :use-light-content="false"
  >
    <template #sidebar>
      <B24SidebarHeader>
        <LogoWithVersion />
      </B24SidebarHeader>
      <B24SidebarBody>
        <B24NavigationMenu
          :items="mobileLinks"
          orientation="vertical"
        />
      </B24SidebarBody>
      <B24SidebarFooter>
        <B24SidebarSection>
          <ExtLinks />
        </B24SidebarSection>
      </B24SidebarFooter>
    </template>
    <template #navbar>
      <Header />
    </template>

    <IconsList :groups="groups" />
  </B24SidebarLayout>
</template>
