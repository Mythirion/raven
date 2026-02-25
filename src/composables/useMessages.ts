export interface MessageSummaryRow {
  id: string
  accountId: string
  folderId: string
  subject: string
  fromAddress: string | null
  toAddress: string | null
  snippet: string | null
  receivedAt: string | null
  isRead: boolean
  isStarred: boolean
  isArchived: boolean
  isDeleted: boolean
}

export interface MessageDetailRow extends MessageSummaryRow {
  bodyText: string | null
  bodyHtmlSanitized: string | null
}

export interface MessageListFilters {
  accountId?: string
  folderId?: string
  q?: string
  limit?: number
}

function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function useMessages() {
  const busy = ref(false)
  const detailBusy = ref(false)
  const actionBusy = ref(false)

  const errorMessage = ref<string | null>(null)
  const successMessage = ref<string | null>(null)

  const filters = ref<MessageListFilters>({ limit: 25 })
  const nextCursor = ref<string | null>(null)
  const messages = ref<MessageSummaryRow[]>([])
  const selectedMessageId = ref<string | null>(null)
  const messageDetail = ref<MessageDetailRow | null>(null)
  const selectedMessageIds = ref<string[]>([])

  function clearMessages() {
    errorMessage.value = null
    successMessage.value = null
  }

  function clearSelection() {
    selectedMessageIds.value = []
  }

  function setSelectedMessages(messageIds: string[]) {
    selectedMessageIds.value = [...new Set(messageIds.map((id) => String(id || '').trim()).filter(Boolean))]
  }

  function setError(message: string) {
    errorMessage.value = message
    successMessage.value = null
  }

  function setSuccess(message: string) {
    successMessage.value = message
    errorMessage.value = null
  }

  function toggleSelectedMessage(messageId: string) {
    if (selectedMessageIds.value.includes(messageId)) {
      selectedMessageIds.value = selectedMessageIds.value.filter((id) => id !== messageId)
      return
    }

    selectedMessageIds.value = [...selectedMessageIds.value, messageId]
  }

  function applyFilters(nextFilters: MessageListFilters) {
    filters.value = {
      ...filters.value,
      ...nextFilters,
    }
  }

  function listQuery(cursor?: string | null): string {
    const q = new URLSearchParams()
    if (filters.value.accountId) {
      q.set('accountId', filters.value.accountId)
    }
    if (filters.value.folderId) {
      q.set('folderId', filters.value.folderId)
    }
    if (filters.value.q) {
      q.set('q', filters.value.q)
    }
    q.set('limit', String(filters.value.limit || 25))
    if (cursor) {
      q.set('cursor', cursor)
    }
    return q.toString()
  }

  async function refreshMessages() {
    busy.value = true
    clearMessages()

    try {
      const response = await $fetch<{ data?: { messages?: MessageSummaryRow[], nextCursor?: string | null } }>(`/api/messages?${listQuery()}`)
      messages.value = response?.data?.messages || []
      nextCursor.value = response?.data?.nextCursor || null
      clearSelection()
    }
    catch (error) {
      messages.value = []
      nextCursor.value = null
      setError(messageFromError(error, 'Could not load messages'))
    }
    finally {
      busy.value = false
    }
  }

  async function loadMoreMessages() {
    if (!nextCursor.value) {
      return
    }

    busy.value = true
    clearMessages()
    try {
      const response = await $fetch<{ data?: { messages?: MessageSummaryRow[], nextCursor?: string | null } }>(`/api/messages?${listQuery(nextCursor.value)}`)
      messages.value = [...messages.value, ...(response?.data?.messages || [])]
      nextCursor.value = response?.data?.nextCursor || null
    }
    catch (error) {
      setError(messageFromError(error, 'Could not load more messages'))
    }
    finally {
      busy.value = false
    }
  }

  async function loadMessageDetail(messageId: string) {
    detailBusy.value = true
    clearMessages()

    try {
      selectedMessageId.value = messageId
      const response = await $fetch<{ data?: { message?: MessageDetailRow } }>(`/api/messages/${messageId}`)
      messageDetail.value = response?.data?.message || null
    }
    catch (error) {
      messageDetail.value = null
      setError(messageFromError(error, 'Could not load message detail'))
    }
    finally {
      detailBusy.value = false
    }
  }

  async function runSingleAction(
    messageId: string,
    action: 'mark_read' | 'mark_unread' | 'star' | 'unstar' | 'archive' | 'delete' | 'move',
    csrfHeaders: Record<string, string>,
    targetFolderId?: string,
  ) {
    actionBusy.value = true
    clearMessages()
    try {
      await $fetch(`/api/messages/${messageId}/actions`, {
        method: 'POST',
        headers: csrfHeaders,
        body: {
          action,
          ...(targetFolderId ? { targetFolderId } : {}),
        },
      })

      await refreshMessages()
      if (selectedMessageId.value === messageId) {
        await loadMessageDetail(messageId)
      }
      setSuccess('Message action applied.')
    }
    catch (error) {
      setError(messageFromError(error, 'Message action failed'))
    }
    finally {
      actionBusy.value = false
    }
  }

  async function runBulkAction(
    action: 'mark_read' | 'mark_unread' | 'star' | 'unstar' | 'archive' | 'delete' | 'move',
    csrfHeaders: Record<string, string>,
    targetFolderId?: string,
  ) {
    const ids = [...selectedMessageIds.value]
    if (ids.length === 0) {
      setError('Select one or more messages first.')
      return
    }

    actionBusy.value = true
    clearMessages()
    try {
      await $fetch('/api/messages/actions/bulk', {
        method: 'POST',
        headers: csrfHeaders,
        body: {
          action,
          messageIds: ids,
          ...(targetFolderId ? { targetFolderId } : {}),
        },
      })

      await refreshMessages()
      clearSelection()
      setSuccess('Bulk action applied.')
    }
    catch (error) {
      setError(messageFromError(error, 'Bulk action failed'))
    }
    finally {
      actionBusy.value = false
    }
  }

  return {
    busy,
    detailBusy,
    actionBusy,
    errorMessage,
    successMessage,
    filters,
    messages,
    messageDetail,
    selectedMessageId,
    selectedMessageIds,
    nextCursor,
    clearMessages,
    clearSelection,
    setSelectedMessages,
    toggleSelectedMessage,
    applyFilters,
    refreshMessages,
    loadMoreMessages,
    loadMessageDetail,
    runSingleAction,
    runBulkAction,
  }
}
