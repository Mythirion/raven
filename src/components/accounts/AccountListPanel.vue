<script setup lang="ts">
import type { AccountRow, SyncStatusRow } from '../../composables/useAccounts'
import BaseButton from '../ui/BaseButton.vue'
import BasePanel from '../ui/BasePanel.vue'
import StatusBadge from '../ui/StatusBadge.vue'

interface Props {
  busy: boolean
  accounts: AccountRow[]
  syncStatusByAccountId: Record<string, SyncStatusRow>
  onSync: (accountId: string) => Promise<void>
  onTest: (accountId: string) => Promise<void>
  onDelete: (accountId: string) => Promise<void>
  onInspectMessages: (accountId: string) => Promise<void>
}

const props = defineProps<Props>()

function toneForState(state: SyncStatusRow['state'] | undefined): 'neutral' | 'success' | 'warn' | 'danger' {
  if (!state || state === 'idle') {
    return 'neutral'
  }
  if (state === 'syncing') {
    return 'success'
  }
  if (state === 'retrying') {
    return 'warn'
  }
  return 'danger'
}
</script>

<template>
  <BasePanel title="Connected Accounts" description="Ownership-scoped mailbox account list">
    <div v-if="props.accounts.length === 0" class="text-sm text-slate-600">
      No accounts yet.
    </div>
    <ul v-else class="space-y-2">
      <li
        v-for="account in props.accounts"
        :key="account.id"
        class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 p-3"
      >
        <div>
          <p class="text-sm font-semibold text-slate-900">{{ account.providerLabel }} — {{ account.emailAddress }}</p>
          <p class="text-xs text-slate-600">IMAP {{ account.imapHost }}:{{ account.imapPort }} · SMTP {{ account.smtpHost }}:{{ account.smtpPort }}</p>
          <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <StatusBadge
              :label="`Sync ${props.syncStatusByAccountId[account.id]?.state || 'idle'}`"
              :tone="toneForState(props.syncStatusByAccountId[account.id]?.state)"
            />
            <span>messages: {{ props.syncStatusByAccountId[account.id]?.messageCount || 0 }}</span>
            <span>cursors: {{ props.syncStatusByAccountId[account.id]?.cursorCount || 0 }}</span>
          </div>
        </div>
        <div class="flex gap-2">
          <BaseButton variant="primary" size="sm" :disabled="props.busy" @click="props.onSync(account.id)">
            Sync now
          </BaseButton>
          <BaseButton variant="secondary" size="sm" :disabled="props.busy" @click="props.onTest(account.id)">
            Test
          </BaseButton>
          <BaseButton variant="secondary" size="sm" :disabled="props.busy" @click="props.onInspectMessages(account.id)">
            Inspect
          </BaseButton>
          <BaseButton variant="ghost" size="sm" :disabled="props.busy" @click="props.onDelete(account.id)">
            Delete
          </BaseButton>
        </div>
      </li>
    </ul>
  </BasePanel>
</template>