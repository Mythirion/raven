import { DomainError } from '../../utils/domain-error'
import { recordAuditEvent } from '../audit/audit.service'
import {
  applyActionForUserMessage,
  applyBulkActionForUserMessages,
  findMessageDetailForUser,
  listMessagesForUser,
} from '../../repositories/messages.repository'
import {
  type BulkMessageActionResult,
  type MessageActionResult,
  MESSAGE_ACTIONS,
  type BulkMessageActionCommand,
  type MessageDetail,
  type MessageAction,
  type MessageActionCommand,
  type MessageListResult,
  type MessageListQuery,
} from './types'

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100

function asTrimmedString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeOptionalString(value: unknown): string | undefined {
  const normalized = asTrimmedString(value)
  return normalized ? normalized : undefined
}

function normalizeLimit(value: unknown): number {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_LIMIT
  }

  const parsed = Number(value)
  if (!isFinite(parsed) || parsed < 1) {
    throw new DomainError('VALIDATION_ERROR', 'limit must be a positive integer', 400)
  }

  return Math.min(MAX_LIMIT, Math.floor(parsed))
}

function ensureMessageAction(value: unknown): MessageAction {
  const action = asTrimmedString(value) as MessageAction
  if ((MESSAGE_ACTIONS as readonly string[]).indexOf(action) < 0) {
    throw new DomainError('MESSAGE_ACTION_INVALID', 'Invalid message action', 400)
  }

  return action
}

function ensureMoveTargetFolderId(action: MessageAction, targetFolderId: unknown): string | undefined {
  const normalizedTarget = normalizeOptionalString(targetFolderId)

  if (action === 'move' && !normalizedTarget) {
    throw new DomainError('MESSAGE_TARGET_FOLDER_REQUIRED', 'targetFolderId is required when action is move', 400)
  }

  return normalizedTarget
}

export function normalizeMessageListQuery(query: Record<string, unknown>): MessageListQuery {
  return {
    accountId: normalizeOptionalString(query.accountId),
    folderId: normalizeOptionalString(query.folderId),
    limit: normalizeLimit(query.limit),
    cursor: normalizeOptionalString(query.cursor),
    q: normalizeOptionalString(query.q),
  }
}

export function normalizeMessageActionCommand(input: Record<string, unknown>): MessageActionCommand {
  const action = ensureMessageAction(input.action)
  const targetFolderId = ensureMoveTargetFolderId(action, input.targetFolderId)

  return {
    action,
    targetFolderId,
  }
}

export function normalizeBulkMessageActionCommand(input: Record<string, unknown>): BulkMessageActionCommand {
  const actionCommand = normalizeMessageActionCommand(input)
  const rawMessageIds = Array.isArray(input.messageIds) ? input.messageIds : []
  const messageIds = rawMessageIds
    .map((id) => asTrimmedString(id))
    .filter((id) => Boolean(id))

  if (messageIds.length === 0) {
    throw new DomainError('MESSAGE_BULK_EMPTY', 'messageIds must contain at least one id', 400)
  }

  return {
    ...actionCommand,
    messageIds,
  }
}

export async function listUserMessages(userId: string, query: MessageListQuery): Promise<MessageListResult> {
  return listMessagesForUser(userId, query)
}

export async function getUserMessageDetail(userId: string, messageId: string): Promise<MessageDetail> {
  const normalizedId = asTrimmedString(messageId)
  if (!normalizedId) {
    throw new DomainError('VALIDATION_ERROR', 'message id is required', 400)
  }

  const message = await findMessageDetailForUser(userId, normalizedId)
  if (!message) {
    throw new DomainError('MESSAGE_NOT_FOUND', 'Message not found', 404)
  }

  return message
}

export async function runSingleMessageAction(
  userId: string,
  messageId: string,
  command: MessageActionCommand,
  requestId?: string,
): Promise<MessageActionResult> {
  const normalizedId = asTrimmedString(messageId)
  if (!normalizedId) {
    throw new DomainError('VALIDATION_ERROR', 'message id is required', 400)
  }

  const updated = await applyActionForUserMessage(userId, normalizedId, command.action, command.targetFolderId)
  if (!updated) {
    throw new DomainError('MESSAGE_NOT_FOUND', 'Message not found', 404)
  }

  await recordAuditEvent({
    userId,
    eventType: 'message.action.single',
    resourceType: 'message',
    resourceId: normalizedId,
    metadata: {
      action: command.action,
      targetFolderId: command.targetFolderId || null,
      requestId: requestId || null,
    },
  })

  return {
    messageId: normalizedId,
    action: command.action,
    updated,
  }
}

export async function runBulkMessageAction(
  userId: string,
  command: BulkMessageActionCommand,
  requestId?: string,
): Promise<BulkMessageActionResult> {
  const result = await applyBulkActionForUserMessages(userId, command.messageIds, command.action, command.targetFolderId)

  await recordAuditEvent({
    userId,
    eventType: 'message.action.bulk',
    resourceType: 'message',
    resourceId: null,
    metadata: {
      action: command.action,
      targetFolderId: command.targetFolderId || null,
      requested: result.requested,
      updated: result.updated,
      requestId: requestId || null,
    },
  })

  return result
}
