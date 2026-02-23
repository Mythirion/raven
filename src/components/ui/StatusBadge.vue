<script setup lang="ts">
interface Props {
  label: string
  tone?: 'neutral' | 'success' | 'warn' | 'danger'
}

withDefaults(defineProps<Props>(), {
  tone: 'neutral',
})
</script>

<template>
  <span
    class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
    :class="[
      tone === 'neutral' && 'bg-slate-100 text-slate-700',
      tone === 'success' && 'bg-emerald-100 text-emerald-700',
      tone === 'warn' && 'bg-amber-100 text-amber-700',
      tone === 'danger' && 'bg-rose-100 text-rose-700',
    ]"
  >
    {{ label }}
  </span>
</template>
