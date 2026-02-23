<script setup lang="ts">
const { data, status, error, refresh } = await useFetch('/api/ops/health')
</script>

<template>
  <div class="space-y-6">
    <header class="space-y-2">
      <h1 class="text-2xl font-bold tracking-tight">Raven Phase 0 Dashboard</h1>
      <p class="text-sm text-slate-600">
        Foundations are in place. This page validates frontend shell, shared primitives, and backend health wiring.
      </p>
    </header>

    <BasePanel title="Service Readiness" description="Live status from GET /api/ops/health">
      <div class="mb-4 flex items-center gap-3">
        <StatusBadge
          :label="status === 'pending' ? 'Loading' : status === 'error' ? 'Error' : 'Ready'"
          :tone="status === 'error' ? 'danger' : status === 'pending' ? 'warn' : 'success'"
        />
        <BaseButton variant="secondary" size="sm" @click="refresh()">
          Refresh
        </BaseButton>
      </div>

      <div v-if="status === 'error'" class="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
        Failed to load health status: {{ error?.message || 'unknown error' }}
      </div>

      <pre v-else class="overflow-x-auto rounded-md bg-slate-950 p-4 text-xs text-slate-100">{{ data }}</pre>
    </BasePanel>
  </div>
</template>
