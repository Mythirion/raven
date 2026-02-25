-- Raven Phase 2 sync engine schema expansion

CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  remote_thread_id TEXT NOT NULL,
  subject_preview TEXT,
  last_message_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES mailbox_accounts (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_threads_account_remote
  ON threads (account_id, remote_thread_id);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  thread_id TEXT,
  remote_message_id TEXT NOT NULL,
  from_address TEXT,
  to_address TEXT,
  subject TEXT,
  snippet TEXT,
  received_at TEXT,
  flags_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES mailbox_accounts (id),
  FOREIGN KEY (folder_id) REFERENCES folders (id),
  FOREIGN KEY (thread_id) REFERENCES threads (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_account_remote
  ON messages (account_id, remote_message_id);

CREATE INDEX IF NOT EXISTS idx_messages_folder_received
  ON messages (folder_id, received_at DESC);

CREATE TABLE IF NOT EXISTS message_bodies (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  body_text TEXT,
  body_html_sanitized TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (message_id) REFERENCES messages (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_message_bodies_message_id
  ON message_bodies (message_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_account_remote
  ON folders (account_id, remote_folder_id);