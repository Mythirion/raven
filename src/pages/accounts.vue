<script setup lang="ts">
import type { AccountCreateInput } from '../composables/useAccounts'
import BasePanel from '../components/ui/BasePanel.vue'
import AuthLoginPanel from '../components/accounts/AuthLoginPanel.vue'
import SessionPanel from '../components/accounts/SessionPanel.vue'
import AccountListPanel from '../components/accounts/AccountListPanel.vue'
import AccountCreateForm from '../components/accounts/AccountCreateForm.vue'

const auth = useAuth()
const accountState = useAccounts()
const authReady = ref(false)
const selectedInspectAccountId = ref<string | null>(null)

await auth.ensureLoaded()
authReady.value = true

async function handleLogin(email: string, password: string): Promise<boolean> {
  accountState.clearMessages()
  try {
    await auth.login(email, password)
    await accountState.refreshAccounts()
    accountState.setSuccess('Signed in successfully.')
    return true
  }
  catch (error) {
    accountState.setError(error instanceof Error ? error.message : 'Login failed')
    return false
  }
}

async function runConnectivityTest(accountId: string) {
  await accountState.testAccountConnectivity(accountId, auth.csrfHeaders())
}

async function runSync(accountId: string) {
  await accountState.runAccountSync(accountId, auth.csrfHeaders())
}

async function deleteAccount(accountId: string) {
  await accountState.removeAccount(accountId, auth.csrfHeaders())
}

async function inspectMessages(accountId: string) {
  selectedInspectAccountId.value = accountId
  await accountState.loadRecentMessages(accountId)
}

async function submitAccount(input: AccountCreateInput): Promise<boolean> {
  return accountState.createAccount(input, auth.csrfHeaders())
}

async function handleLogout() {
  accountState.clearMessages()
  try {
    await auth.logout()
    accountState.clearAccounts()
    accountState.setSuccess('Signed out.')
  }
  catch (error) {
    accountState.setError(error instanceof Error ? error.message : 'Could not sign out')
  }
}

if (auth.state.value.user) {
  await accountState.refreshAccounts()
}
</script>

<template>
  <div class="space-y-6">
    <header class="space-y-2">
      <h1 class="text-2xl font-bold tracking-tight">Accounts</h1>
      <p class="text-sm text-slate-600">
        Manage mailbox accounts with secure ownership boundaries, connectivity checks, and Phase 2 sync controls.
      </p>
    </header>

    <div v-if="accountState.errorMessage.value" class="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
      {{ accountState.errorMessage.value }}
    </div>
    <div v-if="accountState.successMessage.value" class="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
      {{ accountState.successMessage.value }}
    </div>

    <AuthLoginPanel
      v-if="authReady && !auth.state.value.user"
      :busy="accountState.busy.value"
      :on-submit="handleLogin"
    />

    <BasePanel v-else-if="!authReady" title="Loading session" description="Checking current authentication state">
      <p class="text-sm text-slate-600">Please wait…</p>
    </BasePanel>

    <template v-else-if="authReady">
      <SessionPanel :busy="accountState.busy.value" :user="auth.state.value.user" :on-logout="handleLogout" />
      <AccountListPanel
        :busy="accountState.busy.value"
        :accounts="accountState.accounts.value"
        :sync-status-by-account-id="accountState.syncStatusByAccountId.value"
        :on-sync="runSync"
        :on-test="runConnectivityTest"
        :on-delete="deleteAccount"
        :on-inspect-messages="inspectMessages"
      />
      <BasePanel
        v-if="selectedInspectAccountId"
        title="Recent Synced Messages"
        description="Inspect latest synced message metadata/body samples"
      >
        <ul class="space-y-2">
          <li
            v-for="message in (accountState.recentMessagesByAccountId.value[selectedInspectAccountId] || [])"
            :key="message.id"
            class="rounded-md border border-slate-200 p-3"
          >
            <p class="text-sm font-semibold text-slate-900">{{ message.subject }}</p>
            <p class="text-xs text-slate-600">{{ message.remoteMessageId }} · {{ message.receivedAt || 'n/a' }}</p>
            <p class="mt-2 text-xs text-slate-700">{{ message.bodyText || message.snippet || '(no content)' }}</p>
          </li>
        </ul>
      </BasePanel>
      <AccountCreateForm :busy="accountState.busy.value" :on-submit="submitAccount" />
    </template>
  </div>
</template>
