<script setup lang="ts">
import BasePanel from '../components/ui/BasePanel.vue'
import StatusBadge from '../components/ui/StatusBadge.vue'

const { data, status, error, refresh } = await useFetch('/api/ops/health')
const refreshing = ref(false)
const lastRefreshedAt = ref<string | null>(null)

async function handleRefresh() {
  refreshing.value = true
  try {
    await refresh()
    lastRefreshedAt.value = new Date().toLocaleTimeString()
  }
  finally {
    refreshing.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <header class="space-y-2">
      <h1 class="text-2xl font-bold tracking-tight">Health</h1>
      <p class="text-sm text-slate-600">
        Live API/database/scheduler health payload from <code>GET /api/ops/health</code>.
      </p>
    </header>

    <BasePanel title="Service Health" description="Operational health snapshot">
      <div class="mb-4 flex items-center gap-3">
        <StatusBadge
          :label="status === 'pending' ? 'Loading' : status === 'error' ? 'Error' : 'Ready'"
          :tone="status === 'error' ? 'danger' : status === 'pending' ? 'warn' : 'success'"
        />
        <button
          type="button"
          class="inline-flex h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="refreshing"
          @click="handleRefresh"
        >
          {{ refreshing ? 'Refreshing…' : 'Refresh' }}
        </button>
        <span v-if="lastRefreshedAt" class="text-xs text-slate-500">Updated at {{ lastRefreshedAt }}</span>
      </div>

      <div v-if="status === 'error'" class="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
        Failed to load health status: {{ error?.message || 'unknown error' }}
      </div>

      <pre v-else class="overflow-x-auto rounded-md bg-slate-950 p-4 text-xs text-slate-100">{{ data }}</pre>
    </BasePanel>
  </div>
</template>
