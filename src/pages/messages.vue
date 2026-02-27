<script setup lang="ts">
import BaseButton from '../components/ui/BaseButton.vue'
import BasePanel from '../components/ui/BasePanel.vue'

const auth = useAuth()
const messagesState = useMessages()
const activeAccountId = useState<string>('messages-active-account-id', () => '')
const activeFolderId = useState<string>('messages-active-folder-id', () => '')
const themeMode = useState<'light' | 'dark'>('ui-theme-mode', () => 'light')

await auth.ensureLoaded()

const htmlMode = ref<'text' | 'html'>('html')
const mobilePane = ref<'list' | 'detail'>('list')
const workspaceRef = ref<HTMLElement | null>(null)
const isLargeScreen = ref(false)
const isResizing = ref(false)
const listPanePercent = ref(45)
const selectedCount = computed(() => messagesState.selectedMessageIds.value.length)
const visibleMessageIds = computed(() => messagesState.messages.value.map((message) => message.id))
const allVisibleSelected = computed(() => {
  const ids = visibleMessageIds.value
  return ids.length > 0 && ids.every((id) => messagesState.selectedMessageIds.value.includes(id))
})

const workspaceStyle = computed(() => {
  if (!isLargeScreen.value) {
    return undefined
  }

  const list = Math.max(30, Math.min(70, listPanePercent.value))
  return {
    gridTemplateColumns: `${list}% 0.5rem calc(${100 - list}% - 0.5rem)`,
  }
})

async function refreshWithCurrentFilters() {
  messagesState.applyFilters({
    accountId: activeAccountId.value || undefined,
    folderId: activeFolderId.value || undefined,
  })
  await messagesState.refreshMessages()
}

async function inspectMessage(messageId: string) {
  await messagesState.loadMessageDetail(messageId)
  mobilePane.value = 'detail'
}

function toggleSelectAllVisible() {
  if (allVisibleSelected.value) {
    messagesState.clearSelection()
    return
  }

  messagesState.setSelectedMessages(visibleMessageIds.value)
}

function showListPane() {
  mobilePane.value = 'list'
}

function updateLargeScreen() {
  isLargeScreen.value = window.innerWidth >= 1024
}

function applyResizeFromClientX(clientX: number) {
  if (!workspaceRef.value) {
    return
  }

  const bounds = workspaceRef.value.getBoundingClientRect()
  if (!bounds.width) {
    return
  }

  const raw = ((clientX - bounds.left) / bounds.width) * 100
  listPanePercent.value = Math.max(30, Math.min(70, raw))
}

function stopResize() {
  if (!isResizing.value) {
    return
  }

  isResizing.value = false
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', stopResize)
  if (import.meta.client) {
    localStorage.setItem('messages-list-pane-percent', String(listPanePercent.value))
  }
}

function onPointerMove(event: PointerEvent) {
  if (!isResizing.value) {
    return
  }

  applyResizeFromClientX(event.clientX)
}

function startResize(event: PointerEvent) {
  if (!isLargeScreen.value) {
    return
  }

  isResizing.value = true
  applyResizeFromClientX(event.clientX)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', stopResize)
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function formatMessageDate(input: string | null | undefined): string {
  if (!input) {
    return 'n/a'
  }

  const value = new Date(input)
  if (Number.isNaN(value.getTime())) {
    return input
  }

  const now = new Date()
  const today = startOfDay(now)
  const dateDay = startOfDay(value)
  const diffDays = Math.round((today.getTime() - dateDay.getTime()) / 86400000)

  if (diffDays === 0) {
    return value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  if (diffDays === 1) {
    return 'Yesterday'
  }

  const weekdayIndex = (today.getDay() + 6) % 7
  const startOfCurrentWeek = new Date(today)
  startOfCurrentWeek.setDate(today.getDate() - weekdayIndex)
  const startOfLastWeek = new Date(startOfCurrentWeek)
  startOfLastWeek.setDate(startOfCurrentWeek.getDate() - 7)

  if (dateDay >= startOfCurrentWeek) {
    return value.toLocaleDateString([], { weekday: 'long' })
  }

  if (dateDay >= startOfLastWeek) {
    return `Last ${value.toLocaleDateString([], { weekday: 'long' })}`
  }

  const yyyy = value.getFullYear()
  const mm = String(value.getMonth() + 1).padStart(2, '0')
  const dd = String(value.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function compactPreview(input: string | null | undefined): string {
  const firstLine = String(input || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  const cleaned = (firstLine || '(no preview)').replace(/\s+/g, ' ').trim()
  const maxChars = 120

  if (cleaned.length <= maxChars) {
    return cleaned
  }

  return `${cleaned.slice(0, maxChars - 1).trimEnd()}…`
}

function rowClass(messageId: string) {
  const isActive = messagesState.selectedMessageId.value === messageId
  if (themeMode.value === 'dark') {
    return isActive
      ? 'border-sky-700 bg-sky-900/40 text-sky-100'
      : 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
  }

  return isActive
    ? 'border-sky-400 bg-sky-50/60 text-slate-900'
    : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50'
}

async function runSingleAction(
  messageId: string,
  action: 'mark_read' | 'mark_unread' | 'star' | 'unstar' | 'archive' | 'delete',
) {
  await messagesState.runSingleAction(messageId, action, auth.csrfHeaders())
}

async function runBulkAction(
  action: 'mark_read' | 'mark_unread' | 'star' | 'unstar' | 'archive' | 'delete',
) {
  await messagesState.runBulkAction(action, auth.csrfHeaders())
}

if (auth.state.value.user) {
  await refreshWithCurrentFilters()
}

watch(
  () => messagesState.messages.value.map((message) => message.id),
  async (ids) => {
    if (!ids.length) {
      return
    }

    const currentDetailId = messagesState.messageDetail.value?.id || null
    if (currentDetailId && ids.includes(currentDetailId)) {
      return
    }

    await inspectMessage(ids[0]!)
  },
)

watch([activeAccountId, activeFolderId], () => {
  mobilePane.value = 'list'
  refreshWithCurrentFilters()
})

onMounted(() => {
  updateLargeScreen()
  window.addEventListener('resize', updateLargeScreen)
  if (import.meta.client) {
    const saved = Number(localStorage.getItem('messages-list-pane-percent') || '')
    if (Number.isFinite(saved)) {
      listPanePercent.value = Math.max(30, Math.min(70, saved))
    }
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateLargeScreen)
  stopResize()
})
</script>

<template>
  <div class="space-y-4">
    <header class="space-y-2">
      <h1 class="text-2xl font-bold tracking-tight">Messages</h1>
      <p class="text-sm text-slate-600">
        Mock-up: Discord/Outlook-inspired account rail + folder rail + message workspace.
      </p>
    </header>

    <div v-if="messagesState.errorMessage.value" class="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
      {{ messagesState.errorMessage.value }}
    </div>
    <div v-if="messagesState.successMessage.value" class="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
      {{ messagesState.successMessage.value }}
    </div>

    <BasePanel title="Message Workspace" description="List/detail with single and bulk actions">
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <BaseButton variant="secondary" :disabled="messagesState.busy.value" @click="refreshWithCurrentFilters">
            {{ messagesState.busy.value ? 'Refreshing…' : 'Refresh' }}
          </BaseButton>
          <span class="text-xs text-slate-500">
            {{ activeAccountId ? 'Scoped account' : 'All accounts' }} · {{ activeFolderId || 'all folders' }}
          </span>
        </div>

        <div ref="workspaceRef" class="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_0.5rem_minmax(0,1fr)]" :style="workspaceStyle">
          <section :class="mobilePane === 'detail' ? 'hidden lg:block' : 'block'">
            <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Message list</p>
        <div class="mb-3 flex flex-wrap gap-2">
          <BaseButton variant="secondary" size="sm" :disabled="messagesState.actionBusy.value || selectedCount === 0" @click="runBulkAction('mark_read')">
            Bulk read
          </BaseButton>
          <BaseButton variant="secondary" size="sm" :disabled="messagesState.actionBusy.value || selectedCount === 0" @click="runBulkAction('mark_unread')">
            Bulk unread
          </BaseButton>
          <BaseButton variant="secondary" size="sm" :disabled="messagesState.actionBusy.value || selectedCount === 0" @click="runBulkAction('star')">
            Bulk star
          </BaseButton>
          <BaseButton variant="ghost" size="sm" :disabled="messagesState.actionBusy.value || selectedCount === 0" @click="runBulkAction('archive')">
            Bulk archive
          </BaseButton>
          <BaseButton variant="ghost" size="sm" :disabled="messagesState.actionBusy.value || selectedCount === 0" @click="runBulkAction('delete')">
            Bulk delete
          </BaseButton>
        </div>

        <div class="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span>Selected: {{ selectedCount }}</span>
          <BaseButton size="sm" variant="secondary" :disabled="messagesState.messages.value.length === 0" @click="toggleSelectAllVisible">
            {{ allVisibleSelected ? 'Clear visible' : 'Select visible' }}
          </BaseButton>
          <BaseButton size="sm" variant="ghost" :disabled="selectedCount === 0" @click="messagesState.clearSelection">
            Clear selection
          </BaseButton>
        </div>

        <div v-if="messagesState.busy.value && messagesState.messages.value.length === 0" class="text-sm text-slate-600">
          Loading messages…
        </div>

        <div v-if="messagesState.messages.value.length === 0" class="text-sm text-slate-600">
          No messages available in the current filter set.
        </div>

        <ul v-else class="space-y-2">
          <li
            v-for="message in messagesState.messages.value"
            :key="message.id"
            class="min-w-0 cursor-pointer rounded-lg border px-3 py-2.5 transition"
            :class="rowClass(message.id)"
            role="button"
            tabindex="0"
            @click="inspectMessage(message.id)"
            @keydown.enter.prevent="inspectMessage(message.id)"
            @keydown.space.prevent="inspectMessage(message.id)"
          >
            <div class="mb-1.5 flex items-start justify-between gap-2">
              <label class="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                <input
                  type="checkbox"
                  :checked="messagesState.selectedMessageIds.value.includes(message.id)"
                  @click.stop
                  @change="messagesState.toggleSelectedMessage(message.id); inspectMessage(message.id)"
                >
                select
              </label>

              <div class="flex flex-wrap gap-1.5">
                <BaseButton size="sm" variant="secondary" :disabled="messagesState.actionBusy.value" @click.stop="runSingleAction(message.id, message.isRead ? 'mark_unread' : 'mark_read')">
                  {{ message.isRead ? 'Unread' : 'Read' }}
                </BaseButton>
                <BaseButton size="sm" variant="ghost" :disabled="messagesState.actionBusy.value" @click.stop="runSingleAction(message.id, message.isStarred ? 'unstar' : 'star')">
                  {{ message.isStarred ? 'Unstar' : 'Star' }}
                </BaseButton>
                <BaseButton size="sm" variant="ghost" :disabled="messagesState.actionBusy.value" @click.stop="runSingleAction(message.id, 'archive')">
                  Archive
                </BaseButton>
                <BaseButton size="sm" variant="ghost" :disabled="messagesState.actionBusy.value" @click.stop="runSingleAction(message.id, 'delete')">
                  Delete
                </BaseButton>
              </div>
            </div>

            <p class="max-w-full truncate text-sm font-semibold leading-snug">
              {{ message.subject || '(no subject)' }}
            </p>
            <p class="mt-0.5 text-[11px] leading-snug" :class="themeMode === 'dark' ? 'text-slate-300' : 'text-slate-500'">
              {{ message.fromAddress || '(unknown sender)' }} · {{ formatMessageDate(message.receivedAt || null) }}
            </p>
            <p class="mt-1 max-w-full truncate text-xs leading-snug" :class="themeMode === 'dark' ? 'text-slate-300' : 'text-slate-700'">
              {{ compactPreview(message.snippet || null) }}
            </p>
          </li>
        </ul>

        <div class="mt-4">
          <BaseButton variant="secondary" :disabled="!messagesState.nextCursor.value || messagesState.busy.value" @click="messagesState.loadMoreMessages">
            Load more
          </BaseButton>
        </div>
          </section>

          <div
            class="hidden w-2 cursor-col-resize rounded bg-slate-200/70 transition hover:bg-sky-300 lg:block"
            :class="isResizing ? 'bg-sky-400' : ''"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize message panes"
            tabindex="0"
            @pointerdown.prevent="startResize"
          />

          <section :class="mobilePane === 'list' ? 'hidden lg:block' : 'block'">
            <div class="mb-2 flex items-center justify-between gap-2">
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Message detail</p>
              <BaseButton size="sm" variant="secondary" class="lg:hidden" @click="showListPane">
                Back to list
              </BaseButton>
            </div>
        <div class="mb-3 flex gap-2">
          <BaseButton size="sm" :variant="htmlMode === 'html' ? 'primary' : 'secondary'" @click="htmlMode = 'html'">
            HTML (sanitized)
          </BaseButton>
          <BaseButton size="sm" :variant="htmlMode === 'text' ? 'primary' : 'secondary'" @click="htmlMode = 'text'">
            Text
          </BaseButton>
        </div>

        <div v-if="messagesState.detailBusy.value" class="text-sm text-slate-600">
          Loading message detail…
        </div>
        <div v-else-if="!messagesState.messageDetail.value" class="text-sm text-slate-600">
          Select a message to inspect detail content.
        </div>
        <div v-else class="max-h-[70vh] overflow-hidden">
          <p class="text-sm font-semibold text-slate-900">{{ messagesState.messageDetail.value.subject || '(no subject)' }}</p>
          <p class="mb-3 text-xs text-slate-600">
            {{ messagesState.messageDetail.value.fromAddress || '(unknown sender)' }}
          </p>

          <pre
            v-if="htmlMode === 'text'"
            class="max-h-[calc(70vh-5rem)] overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-950 p-3 text-xs text-slate-100"
          >{{ messagesState.messageDetail.value.bodyText || messagesState.messageDetail.value.snippet || '(no text body)' }}</pre>

          <div
            v-else
            class="max-h-[calc(70vh-5rem)] overflow-auto break-words rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-800 [&_*]:max-w-full [&_*]:break-words"
            v-html="messagesState.messageDetail.value.bodyHtmlSanitized || `<p>${messagesState.messageDetail.value.bodyText || messagesState.messageDetail.value.snippet || '(no sanitized html body)'}</p>`"
          />
        </div>
          </section>
        </div>
      </BasePanel>
  </div>
</template>
