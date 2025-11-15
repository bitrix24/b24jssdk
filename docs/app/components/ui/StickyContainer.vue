<template>
  <B24Card
    variant="plain"
    class="sticky z-10 top-1 my-8 w-full flex backdrop-blur-md bg-(--ui-color-base-white-fixed)/10 dark:bg-(--ui-color-design-outline-bg)"
    :b24ui="{ body: 'w-full md:w-1/2 lg:w-1/3' }"
  >
    <slot />
  </B24Card>
</template>
