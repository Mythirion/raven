<script setup lang="ts">
import StatusBadge from '../components/ui/StatusBadge.vue'

const isMobileNavOpen = ref(false)
const auth = useAuth()
const accountState = useAccounts()
const route = useRoute()
const themeMode = useState<'light' | 'dark'>('ui-theme-mode', () => 'light')
const activeAccountId = useState<string>('messages-active-account-id', () => '')
const activeFolderId = useState<string>('messages-active-folder-id', () => '')

await auth.ensureLoaded()

const folderItems = [
  { id: '', label: 'All folders' },
  { id: 'inbox', label: 'Inbox' },
  { id: 'sent', label: 'Sent' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'archive', label: 'Archive' },
  { id: 'trash', label: 'Trash' },
]

const isMessagesRoute = computed(() => route.path.startsWith('/messages'))

const closeMobileNav = () => {
  isMobileNavOpen.value = false
}

async function goToMessagesForAccount(accountId: string) {
  activeAccountId.value = accountId
  await navigateTo('/messages')
  closeMobileNav()
}

function setFolder(folderId: string) {
  activeFolderId.value = folderId
}

function sidebarButtonClass(isActive: boolean): string {
  if (themeMode.value === 'dark') {
    return isActive
      ? 'border-sky-700 bg-sky-900/40 text-sky-100'
      : 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
  }

  return isActive
    ? 'border-sky-400 bg-sky-50 text-sky-900'
    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
}

function applyTheme(mode: 'light' | 'dark') {
  if (typeof window === 'undefined') {
    return
  }

  const root = document.documentElement
  root.classList.toggle('theme-dark', mode === 'dark')
  root.classList.toggle('theme-light', mode === 'light')
}

function toggleTheme() {
  themeMode.value = themeMode.value === 'dark' ? 'light' : 'dark'
}

onMounted(() => {
  if (typeof window === 'undefined') {
    return
  }

  const stored = localStorage.getItem('raven-theme')
  if (stored === 'dark' || stored === 'light') {
    themeMode.value = stored
  }
  else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    themeMode.value = 'dark'
  }

  applyTheme(themeMode.value)
})

watch(themeMode, (next) => {
  applyTheme(next)
  if (typeof window !== 'undefined') {
    localStorage.setItem('raven-theme', next)
  }
})

watch(
  () => auth.state.value.user?.id || null,
  async (userId) => {
    if (!userId) {
      accountState.clearAccounts()
      return
    }

    await accountState.refreshAccounts()
  },
  { immediate: true },
)
</script>

<template>
  <div class="min-h-screen bg-slate-50 text-slate-900">
    <header class="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div class="flex h-14 w-full items-center justify-between px-4 sm:px-6 lg:px-8">
        <div class="flex items-center gap-3">
          <button
            class="inline-flex items-center rounded-md border border-slate-200 px-2 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100 lg:hidden"
            type="button"
            aria-label="Toggle navigation"
            @click="isMobileNavOpen = !isMobileNavOpen"
          >
            Menu
          </button>
          <span class="text-base font-semibold">Raven</span>
          <span class="hidden rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 sm:inline">Phase 3 In Progress</span>
        </div>
        <div class="flex items-center gap-2">
          <StatusBadge
            :label="auth.state.value.status === 'loading' ? 'Loading auth' : auth.state.value.user ? `Signed in: ${auth.state.value.user.email}` : 'Signed out'"
            :tone="auth.state.value.user ? 'success' : auth.state.value.status === 'loading' ? 'warn' : 'neutral'"
          />
          <NuxtLink
            to="/settings"
            class="inline-flex h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-100"
            :class="route.path === '/settings' ? 'ring-2 ring-sky-500' : ''"
          >
            {{ auth.state.value.user ? 'Settings' : 'Sign In' }}
          </NuxtLink>
          <button
            type="button"
            class="inline-flex h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-100"
            @click="toggleTheme"
          >
            {{ themeMode === 'dark' ? 'Light' : 'Dark' }}
          </button>
        </div>
      </div>
    </header>

    <div
      class="grid w-full grid-cols-1"
      :class="isMessagesRoute ? 'lg:grid-cols-[260px_210px_1fr]' : 'lg:grid-cols-[260px_1fr]'"
    >
      <aside
        class="border-r border-slate-200 bg-white lg:block"
        :class="isMobileNavOpen ? 'block' : 'hidden'"
      >
        <div class="space-y-4 p-4">
          <div>
            <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Accounts</p>
            <button
              type="button"
              class="w-full rounded-md border px-3 py-2 text-left text-sm transition"
              :class="sidebarButtonClass(activeAccountId === '')"
              @click="goToMessagesForAccount('')"
            >
              <p class="font-medium">All Accounts</p>
              <p class="text-xs text-slate-500">Unified inbox</p>
            </button>
            <div class="mt-2 space-y-1">
              <p
                v-if="!auth.state.value.user"
                class="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500"
              >
                Sign in to load connected accounts.
              </p>
              <p
                v-else-if="accountState.accounts.value.length === 0"
                class="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500"
              >
                No accounts yet. Add one via Manage Accounts.
              </p>
              <button
                v-for="account in accountState.accounts.value"
                :key="account.id"
                type="button"
                class="w-full rounded-md border px-3 py-2 text-left text-sm transition"
                :class="sidebarButtonClass(activeAccountId === account.id)"
                @click="goToMessagesForAccount(account.id)"
              >
                <p class="font-medium">{{ account.providerLabel }}</p>
                <p class="text-xs text-slate-500">{{ account.emailAddress }}</p>
              </button>
            </div>
          </div>

          <NuxtLink
            to="/settings"
            class="block rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            :class="sidebarButtonClass(route.path === '/settings')"
            @click="closeMobileNav"
          >
            Manage Accounts
          </NuxtLink>
        </div>
      </aside>

      <aside
        v-if="isMessagesRoute"
        class="border-r border-slate-200 bg-white"
      >
        <div class="space-y-1 p-4">
          <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Folders</p>
          <button
            v-for="folder in folderItems"
            :key="folder.id || 'all-folders'"
            type="button"
            class="w-full rounded-md border px-3 py-2 text-left text-sm transition"
            :class="sidebarButtonClass(activeFolderId === folder.id)"
            @click="setFolder(folder.id)"
          >
            {{ folder.label }}
          </button>
        </div>
      </aside>

      <main class="min-h-[calc(100vh-3.5rem)] p-4 sm:p-6 lg:p-8">
        <slot />
      </main>
    </div>
  </div>
</template>
