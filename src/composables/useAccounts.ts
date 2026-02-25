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

export interface SyncStatusRow {
  accountId: string
  providerLabel: string
  emailAddress: string
  state: 'idle' | 'syncing' | 'retrying' | 'failed'
  lastAttemptedAt: string | null
  lastSuccessfulAt: string | null
  retryCount: number
  nextRetryAt: string | null
  lastErrorCode: string | null
  lastErrorMessage: string | null
  cursorCount: number
  messageCount: number
}

export interface SyncedMessageRow {
  id: string
  remoteMessageId: string
  subject: string
  fromAddress: string | null
  toAddress: string | null
  receivedAt: string | null
  snippet: string | null
  bodyText: string | null
}

function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function apiErrorPayload(error: unknown): { code?: string, message?: string } | null {
  const asRecord = error as {
    data?: { error?: { code?: string, message?: string } }
    response?: { _data?: { error?: { code?: string, message?: string } } }
  }

  const direct = asRecord?.data?.error
  if (direct) {
    return {
      code: direct.code,
      message: direct.message,
    }
  }

  const responseData = asRecord?.response?._data?.error
  if (responseData) {
    return {
      code: responseData.code,
      message: responseData.message,
    }
  }

  return null
}

export function useAccounts() {
  const busy = ref(false)
  const errorMessage = ref<string | null>(null)
  const successMessage = ref<string | null>(null)
  const accounts = ref<AccountRow[]>([])
  const syncStatusByAccountId = ref<Record<string, SyncStatusRow>>({})
  const recentMessagesByAccountId = ref<Record<string, SyncedMessageRow[]>>({})

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
    syncStatusByAccountId.value = {}
    recentMessagesByAccountId.value = {}
  }

  async function loadRecentMessages(accountId: string, limit = 12) {
    try {
      const response = await fetcher<{ data?: { messages?: SyncedMessageRow[] } }>(`/api/accounts/${accountId}/messages?limit=${limit}`)
      recentMessagesByAccountId.value = {
        ...recentMessagesByAccountId.value,
        [accountId]: response?.data?.messages || [],
      }
    }
    catch {
      recentMessagesByAccountId.value = {
        ...recentMessagesByAccountId.value,
        [accountId]: [],
      }
    }
  }

  async function refreshSyncStatus() {
    try {
      const response = await fetcher<{ data?: { sync?: SyncStatusRow[] } }>('/api/ops/sync-status')
      const next: Record<string, SyncStatusRow> = {}
      for (const row of response?.data?.sync || []) {
        next[row.accountId] = row
      }
      syncStatusByAccountId.value = next
    }
    catch {
      syncStatusByAccountId.value = {}
    }
  }

  async function refreshAccounts() {
    busy.value = true
    clearMessages()
    try {
      const response = await fetcher<{ data?: { accounts?: AccountRow[] } }>('/api/accounts')
      accounts.value = response?.data?.accounts || []
      await refreshSyncStatus()
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
      const payload = apiErrorPayload(error)
      if (payload?.code === 'ACCOUNT_DELETE_BUSY') {
        setError('This account is syncing right now. Please try deleting again in a few seconds.')
        return
      }

      setError(messageFromError(error, 'Could not remove account'))
    }
    finally {
      busy.value = false
    }
  }

  async function runAccountSync(accountId: string, csrfHeaders: Record<string, string>) {
    busy.value = true
    clearMessages()
    try {
      await fetcher(`/api/accounts/${accountId}/sync`, {
        method: 'POST',
        headers: csrfHeaders,
      })
      await refreshSyncStatus()
      setSuccess('Sync run completed.')
    }
    catch (error) {
      const payload = apiErrorPayload(error)
      if (payload?.code === 'SYNC_AUTH_FAILED') {
        setError('Sync failed due to provider authentication. Re-check mailbox credentials and try again.')
      }
      else if (payload?.code === 'SYNC_PROVIDER_UNAVAILABLE') {
        setError('Sync provider is temporarily unavailable. Please retry shortly.')
      }
      else if (payload?.code === 'SYNC_CURSOR_INVALID') {
        setError('Sync cursor is invalid and must be rebuilt. Please run sync again.')
      }
      else {
        setError(messageFromError(error, 'Sync run failed'))
      }

      await refreshSyncStatus()
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
    syncStatusByAccountId,
    recentMessagesByAccountId,
    clearMessages,
    setError,
    setSuccess,
    clearAccounts,
    refreshAccounts,
    refreshSyncStatus,
    createAccount,
    testAccountConnectivity,
    removeAccount,
    runAccountSync,
    loadRecentMessages,
  }
}

async function fetcher<T = unknown>(url: string, options?: unknown): Promise<T> {
  return $fetch<T>(url, options as never)
}