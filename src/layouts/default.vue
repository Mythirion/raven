<script setup lang="ts">
const isMobileNavOpen = ref(false)

const navItems = [
  { label: 'Phase 0 Dashboard', to: '/' },
  { label: 'Health Endpoint', to: '/api/ops/health' },
]

const closeMobileNav = () => {
  isMobileNavOpen.value = false
}
</script>

<template>
  <div class="min-h-screen bg-slate-50 text-slate-900">
    <header class="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div class="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div class="flex items-center gap-3">
          <button
            class="inline-flex items-center rounded-md border border-slate-200 px-2 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100 lg:hidden"
            type="button"
            aria-label="Toggle navigation"
            @click="isMobileNavOpen = !isMobileNavOpen"
          >
            Menu
          </button>
          <span class="text-base font-semibold">Raven</span>
          <span class="hidden rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 sm:inline">Phase 0 Foundations</span>
        </div>
      </div>
    </header>

    <div class="mx-auto grid max-w-7xl grid-cols-1 lg:grid-cols-[260px_1fr]">
      <aside
        class="border-r border-slate-200 bg-white lg:block"
        :class="isMobileNavOpen ? 'block' : 'hidden'"
      >
        <nav class="space-y-1 p-4">
          <NuxtLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="block rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            @click="closeMobileNav"
          >
            {{ item.label }}
          </NuxtLink>
        </nav>
      </aside>

      <main class="min-h-[calc(100vh-3.5rem)] p-4 sm:p-6 lg:p-8">
        <slot />
      </main>
    </div>
  </div>
</template>
