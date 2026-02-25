export const MESSAGE_ACTIONS = [
  'mark_read',
  'mark_unread',
  'star',
  'unstar',
  'archive',
  'delete',
  'move',
] as const

export type MessageAction = (typeof MESSAGE_ACTIONS)[number]

export interface MessageListQuery {
  accountId?: string
  folderId?: string
  limit?: number
  cursor?: string
  q?: string
}

export interface MessageSummary {
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

export interface MessageDetail extends MessageSummary {
  bodyText: string | null
  bodyHtmlSanitized: string | null
}

export interface MessageActionCommand {
  action: MessageAction
  targetFolderId?: string
}

export interface BulkMessageActionCommand extends MessageActionCommand {
  messageIds: string[]
}

export interface MessageListResult {
  messages: MessageSummary[]
  nextCursor: string | null
}

export interface MessageActionResult {
  messageId: string
  action: MessageAction
  updated: boolean
}

export interface BulkMessageActionResult {
  action: MessageAction
  requested: number
  updated: number
}
