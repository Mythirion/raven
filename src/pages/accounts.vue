<script setup lang="ts">
type AccountRow = {
  id: string
  providerLabel: string
  emailAddress: string
  imapHost: string
  imapPort: number
  smtpHost: string
  smtpPort: number
}

const auth = useAuth()
await auth.ensureLoaded()

const busy = ref(false)
const errorMessage = ref<string | null>(null)
const successMessage = ref<string | null>(null)
const accounts = ref<AccountRow[]>([])

const form = reactive({
  providerLabel: '',
  emailAddress: '',
  imapHost: '',
  imapPort: 993,
  imapTls: true,
  smtpHost: '',
  smtpPort: 465,
  smtpTls: true,
  secret: '',
})

async function refreshAccounts() {
  if (!auth.state.value.user) {
    accounts.value = []
    return
  }

  const response = await $fetch<{ data?: { accounts?: AccountRow[] } }>('/api/accounts')
  accounts.value = response?.data?.accounts || []
}

async function submitLogin(event: SubmitEvent) {
  event.preventDefault()
  const target = event.target as HTMLFormElement
  const fd = new FormData(target)

  busy.value = true
  errorMessage.value = null
  successMessage.value = null

  try {
    await auth.login(String(fd.get('email') || ''), String(fd.get('password') || ''))
    await refreshAccounts()
    successMessage.value = 'Signed in successfully.'
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Login failed'
  }
  finally {
    busy.value = false
  }
}

async function submitAccount(event: SubmitEvent) {
  event.preventDefault()
  busy.value = true
  errorMessage.value = null
  successMessage.value = null

  try {
    await $fetch('/api/accounts', {
      method: 'POST',
      headers: auth.csrfHeaders(),
      body: {
        ...form,
      },
    })
    form.providerLabel = ''
    form.emailAddress = ''
    form.imapHost = ''
    form.smtpHost = ''
    form.secret = ''
    await refreshAccounts()
    successMessage.value = 'Account saved.'
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Could not save account'
  }
  finally {
    busy.value = false
  }
}

async function runConnectivityTest(accountId: string) {
  busy.value = true
  errorMessage.value = null
  successMessage.value = null

  try {
    await $fetch(`/api/accounts/${accountId}/test`, {
      method: 'POST',
      headers: auth.csrfHeaders(),
    })
    successMessage.value = 'Connectivity test passed.'
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Connectivity test failed'
  }
  finally {
    busy.value = false
  }
}

async function deleteAccount(accountId: string) {
  busy.value = true
  errorMessage.value = null
  successMessage.value = null

  try {
    await $fetch(`/api/accounts/${accountId}`, {
      method: 'DELETE',
      headers: auth.csrfHeaders(),
    })
    await refreshAccounts()
    successMessage.value = 'Account removed.'
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Could not remove account'
  }
  finally {
    busy.value = false
  }
}

async function handleLogout() {
  busy.value = true
  errorMessage.value = null
  successMessage.value = null

  try {
    await auth.logout()
    accounts.value = []
    successMessage.value = 'Signed out.'
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Could not sign out'
  }
  finally {
    busy.value = false
  }
}

if (auth.state.value.user) {
  await refreshAccounts()
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

    <div v-if="errorMessage" class="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
      {{ errorMessage }}
    </div>
    <div v-if="successMessage" class="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
      {{ successMessage }}
    </div>

    <BasePanel v-if="!auth.state.value.user" title="Sign in" description="Login to manage mailbox accounts">
      <form class="grid gap-3 sm:max-w-md" @submit="submitLogin">
        <label class="grid gap-1 text-sm">
          <span>Email</span>
          <input name="email" type="email" required class="rounded-md border border-slate-300 px-3 py-2" />
        </label>
        <label class="grid gap-1 text-sm">
          <span>Password</span>
          <input name="password" type="password" required class="rounded-md border border-slate-300 px-3 py-2" />
        </label>
        <div>
          <BaseButton type="submit" :disabled="busy">
            {{ busy ? 'Signing in…' : 'Sign in' }}
          </BaseButton>
        </div>
      </form>
    </BasePanel>

    <template v-else>
      <BasePanel title="Session" description="Authenticated user context">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-sm text-slate-700">
            Signed in as <strong>{{ auth.state.value.user.email }}</strong>
          </p>
          <BaseButton variant="secondary" :disabled="busy" @click="handleLogout">
            Logout
          </BaseButton>
        </div>
      </BasePanel>

      <BasePanel title="Connected Accounts" description="Ownership-scoped mailbox account list">
        <div v-if="accounts.length === 0" class="text-sm text-slate-600">
          No accounts yet.
        </div>
        <ul v-else class="space-y-2">
          <li
            v-for="account in accounts"
            :key="account.id"
            class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 p-3"
          >
            <div>
              <p class="text-sm font-semibold text-slate-900">{{ account.providerLabel }} — {{ account.emailAddress }}</p>
              <p class="text-xs text-slate-600">IMAP {{ account.imapHost }}:{{ account.imapPort }} · SMTP {{ account.smtpHost }}:{{ account.smtpPort }}</p>
            </div>
            <div class="flex gap-2">
              <BaseButton variant="secondary" size="sm" :disabled="busy" @click="runConnectivityTest(account.id)">
                Test
              </BaseButton>
              <BaseButton variant="ghost" size="sm" :disabled="busy" @click="deleteAccount(account.id)">
                Delete
              </BaseButton>
            </div>
          </li>
        </ul>
      </BasePanel>

      <BasePanel title="Add Account" description="Create new IMAP/SMTP mailbox account">
        <form class="grid gap-3 sm:grid-cols-2" @submit="submitAccount">
          <label class="grid gap-1 text-sm">
            <span>Provider label</span>
            <input v-model="form.providerLabel" required class="rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label class="grid gap-1 text-sm">
            <span>Email address</span>
            <input v-model="form.emailAddress" type="email" required class="rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label class="grid gap-1 text-sm">
            <span>IMAP host</span>
            <input v-model="form.imapHost" required class="rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label class="grid gap-1 text-sm">
            <span>IMAP port</span>
            <input v-model.number="form.imapPort" type="number" min="1" max="65535" required class="rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label class="grid gap-1 text-sm">
            <span>SMTP host</span>
            <input v-model="form.smtpHost" required class="rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label class="grid gap-1 text-sm">
            <span>SMTP port</span>
            <input v-model.number="form.smtpPort" type="number" min="1" max="65535" required class="rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label class="grid gap-1 text-sm sm:col-span-2">
            <span>Account secret (password/app token)</span>
            <input v-model="form.secret" type="password" required class="rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <div class="sm:col-span-2">
            <BaseButton type="submit" :disabled="busy">
              {{ busy ? 'Saving…' : 'Save account' }}
            </BaseButton>
          </div>
        </form>
      </BasePanel>
    </template>
  </div>
</template>
