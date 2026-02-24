<script setup lang="ts">
import type { AccountCreateInput } from '../composables/useAccounts'

const auth = useAuth()
const accountState = useAccounts()

await auth.ensureLoaded()

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

async function deleteAccount(accountId: string) {
  await accountState.removeAccount(accountId, auth.csrfHeaders())
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
        Phase 1 scaffold: auth state handling plus account list/create/test/delete flows.
      </p>
    </header>

    <div v-if="accountState.errorMessage.value" class="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
      {{ accountState.errorMessage.value }}
    </div>
    <div v-if="accountState.successMessage.value" class="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
      {{ accountState.successMessage.value }}
    </div>

    <AuthLoginPanel
      v-if="!auth.state.value.user"
      :busy="accountState.busy.value"
      :on-submit="handleLogin"
    />

    <template v-else>
      <SessionPanel :busy="accountState.busy.value" :user="auth.state.value.user" :on-logout="handleLogout" />
      <AccountListPanel
        :busy="accountState.busy.value"
        :accounts="accountState.accounts.value"
        :on-test="runConnectivityTest"
        :on-delete="deleteAccount"
      />
      <AccountCreateForm :busy="accountState.busy.value" :on-submit="submitAccount" />
    </template>
  </div>
</template>
