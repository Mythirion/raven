<script setup lang="ts">
interface Props {
  title: string
  description?: string
}

defineProps<Props>()
</script>

<template>
  <section class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <header class="mb-4 space-y-1">
      <h2 class="text-base font-semibold text-slate-900">{{ title }}</h2>
      <p v-if="description" class="text-sm text-slate-600">{{ description }}</p>
    </header>
    <div>
      <slot />
    </div>
  </section>
</template>
