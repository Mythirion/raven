-- Raven Phase 0 baseline schema

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mailbox_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider_label TEXT NOT NULL,
  email_address TEXT NOT NULL,
  imap_host TEXT NOT NULL,
  imap_port INTEGER NOT NULL,
  imap_tls INTEGER NOT NULL DEFAULT 1,
  smtp_host TEXT NOT NULL,
  smtp_port INTEGER NOT NULL,
  smtp_tls INTEGER NOT NULL DEFAULT 1,
  encrypted_secret TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE INDEX IF NOT EXISTS idx_mailbox_accounts_user_id
  ON mailbox_accounts (user_id);

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  remote_folder_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES mailbox_accounts (id)
);

CREATE INDEX IF NOT EXISTS idx_folders_account_id
  ON folders (account_id);

CREATE TABLE IF NOT EXISTS sync_cursors (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  folder_id TEXT,
  cursor_value TEXT NOT NULL,
  last_synced_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES mailbox_accounts (id),
  FOREIGN KEY (folder_id) REFERENCES folders (id)
);

CREATE INDEX IF NOT EXISTS idx_sync_cursors_account_folder
  ON sync_cursors (account_id, folder_id);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  event_type TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE INDEX IF NOT EXISTS idx_audit_events_user_id
  ON audit_events (user_id);
