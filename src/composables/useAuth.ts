interface AuthUser {
  id: string
  email: string
  displayName: string | null
}

interface AuthState {
  status: 'loading' | 'authenticated' | 'unauthenticated'
  user: AuthUser | null
  csrfToken: string | null
}

export function useAuth() {
  const state = useState<AuthState>('auth-state', () => ({
    status: 'loading',
    user: null,
    csrfToken: null,
  }))

  async function ensureLoaded(): Promise<void> {
    if (state.value.status !== 'loading') {
      return
    }

    try {
      const requestFetch = import.meta.server ? useRequestFetch() : $fetch
      const response = await requestFetch<{ ok: boolean, data?: { user: AuthUser | null, csrfToken: string | null } }>('/api/auth/me')
      state.value.user = response?.data?.user || null
      state.value.csrfToken = response?.data?.csrfToken || null
      state.value.status = state.value.user ? 'authenticated' : 'unauthenticated'
    }
    catch {
      state.value.user = null
      state.value.csrfToken = null
      state.value.status = 'unauthenticated'
    }
  }

  async function login(email: string, password: string): Promise<void> {
    state.value.status = 'loading'
    const response = await $fetch<{ ok: boolean, data?: { user: AuthUser, csrfToken: string } }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    })

    state.value.user = response.data?.user || null
    state.value.csrfToken = response.data?.csrfToken || null
    state.value.status = state.value.user ? 'authenticated' : 'unauthenticated'
  }

  async function logout(): Promise<void> {
    await $fetch('/api/auth/logout', { method: 'POST' })
    state.value.user = null
    state.value.csrfToken = null
    state.value.status = 'unauthenticated'
  }

  function csrfHeaders(): Record<string, string> {
    return state.value.csrfToken
      ? { 'x-csrf-token': state.value.csrfToken }
      : {}
  }

  return {
    state,
    ensureLoaded,
    login,
    logout,
    csrfHeaders,
  }
}
