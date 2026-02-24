export interface AccountRow {
  id: string
  providerLabel: string
  emailAddress: string
  imapHost: string
  imapPort: number
  smtpHost: string
  smtpPort: number
}

export interface AccountCreateInput {
  providerLabel: string
  emailAddress: string
  imapHost: string
  imapPort: number
  imapTls: boolean
  smtpHost: string
  smtpPort: number
  smtpTls: boolean
  secret: string
}

function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function useAccounts() {
  const nuxtApp = useNuxtApp()
  const fetcher = nuxtApp.$fetch
  const busy = ref(false)
  const errorMessage = ref<string | null>(null)
  const successMessage = ref<string | null>(null)
  const accounts = ref<AccountRow[]>([])

  function clearMessages() {
    errorMessage.value = null
    successMessage.value = null
  }

  function setError(message: string) {
    errorMessage.value = message
    successMessage.value = null
  }

  function setSuccess(message: string) {
    successMessage.value = message
    errorMessage.value = null
  }

  function clearAccounts() {
    accounts.value = []
  }

  async function refreshAccounts() {
    busy.value = true
    clearMessages()
    try {
      const response = await fetcher<{ data?: { accounts?: AccountRow[] } }>('/api/accounts')
      accounts.value = response?.data?.accounts || []
    }
    catch (error) {
      setError(messageFromError(error, 'Could not load accounts'))
    }
    finally {
      busy.value = false
    }
  }

  async function createAccount(input: AccountCreateInput, csrfHeaders: Record<string, string>) {
    busy.value = true
    clearMessages()
    try {
      await fetcher('/api/accounts', {
        method: 'POST',
        headers: csrfHeaders,
        body: input,
      })
      await refreshAccounts()
      setSuccess('Account saved.')
      return true
    }
    catch (error) {
      setError(messageFromError(error, 'Could not save account'))
      return false
    }
    finally {
      busy.value = false
    }
  }

  async function testAccountConnectivity(accountId: string, csrfHeaders: Record<string, string>) {
    busy.value = true
    clearMessages()
    try {
      await fetcher(`/api/accounts/${accountId}/test`, {
        method: 'POST',
        headers: csrfHeaders,
      })
      setSuccess('Connectivity test passed.')
    }
    catch (error) {
      setError(messageFromError(error, 'Connectivity test failed'))
    }
    finally {
      busy.value = false
    }
  }

  async function removeAccount(accountId: string, csrfHeaders: Record<string, string>) {
    busy.value = true
    clearMessages()
    try {
      await fetcher(`/api/accounts/${accountId}`, {
        method: 'DELETE',
        headers: csrfHeaders,
      })
      await refreshAccounts()
      setSuccess('Account removed.')
    }
    catch (error) {
      setError(messageFromError(error, 'Could not remove account'))
    }
    finally {
      busy.value = false
    }
  }

  return {
    busy,
    errorMessage,
    successMessage,
    accounts,
    clearMessages,
    setError,
    setSuccess,
    clearAccounts,
    refreshAccounts,
    createAccount,
    testAccountConnectivity,
    removeAccount,
  }
}