<script setup lang="ts">
interface Props {
  busy: boolean
  onSubmit: (email: string, password: string) => Promise<boolean>
}

const props = defineProps<Props>()

async function submitLogin(event: SubmitEvent) {
  event.preventDefault()
  const target = event.target as HTMLFormElement
  const fd = new FormData(target)
  const email = String(fd.get('email') || '')
  const password = String(fd.get('password') || '')
  const ok = await props.onSubmit(email, password)
  if (ok) {
    target.reset()
  }
}
</script>

<template>
  <BasePanel title="Sign in" description="Login to manage mailbox accounts">
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
</template>