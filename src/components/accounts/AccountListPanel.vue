<script setup lang="ts">
import type { AccountRow } from '../../composables/useAccounts'

interface Props {
  busy: boolean
  accounts: AccountRow[]
  onTest: (accountId: string) => Promise<void>
  onDelete: (accountId: string) => Promise<void>
}

const props = defineProps<Props>()
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
        </div>
        <div class="flex gap-2">
          <BaseButton variant="secondary" size="sm" :disabled="props.busy" @click="props.onTest(account.id)">
            Test
          </BaseButton>
          <BaseButton variant="ghost" size="sm" :disabled="props.busy" @click="props.onDelete(account.id)">
            Delete
          </BaseButton>
        </div>
      </li>
    </ul>
  </BasePanel>
</template>