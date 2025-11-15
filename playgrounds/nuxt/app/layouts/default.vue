<template>
  <B24SidebarLayout>
    <template #navbar>
      <ProseH1 class="mb-0">
        @bitrix24/b24jssdk-nuxt playground
      </ProseH1>
    </template>

    <!-- Content -->
    <slot />
  </B24SidebarLayout>
</template>
