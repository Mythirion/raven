<script setup lang="ts">
interface Props {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md'
  type?: 'button' | 'submit' | 'reset'
}

withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  type: 'button',
})
</script>

<template>
  <button
    :type="type"
    class="inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
    :class="[
      size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm',
      variant === 'primary' && 'bg-sky-600 text-white hover:bg-sky-700',
      variant === 'secondary' && 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100',
      variant === 'ghost' && 'text-slate-700 hover:bg-slate-100',
    ]"
  >
    <slot />
  </button>
</template>
