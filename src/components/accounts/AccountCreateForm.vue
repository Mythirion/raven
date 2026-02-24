<script setup lang="ts">
import type { AccountCreateInput } from '../../composables/useAccounts'

interface Props {
  busy: boolean
  onSubmit: (input: AccountCreateInput) => Promise<boolean>
}

const props = defineProps<Props>()

const form = reactive<AccountCreateInput>({
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

function resetForm() {
  form.providerLabel = ''
  form.emailAddress = ''
  form.imapHost = ''
  form.imapPort = 993
  form.imapTls = true
  form.smtpHost = ''
  form.smtpPort = 465
  form.smtpTls = true
  form.secret = ''
}

async function submitAccount(event: SubmitEvent) {
  event.preventDefault()
  const ok = await props.onSubmit({ ...form })
  if (ok) {
    resetForm()
  }
}
</script>

<template>
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
        <BaseButton type="submit" :disabled="props.busy">
          {{ props.busy ? 'Saving…' : 'Save account' }}
        </BaseButton>
      </div>
    </form>
  </BasePanel>
</template>