<script setup lang="ts">
interface AuthUser {
  email: string
}

interface Props {
  busy: boolean
  user: AuthUser
  onLogout: () => Promise<void>
}

const props = defineProps<Props>()
</script>

<template>
  <BasePanel title="Session" description="Authenticated user context">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-slate-700">
        Signed in as <strong>{{ props.user.email }}</strong>
      </p>
      <BaseButton variant="secondary" :disabled="props.busy" @click="props.onLogout">
        Logout
      </BaseButton>
    </div>
  </BasePanel>
</template>