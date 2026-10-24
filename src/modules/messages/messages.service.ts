import { prisma } from '../../db/prisma';
import { CreateMessageInput } from './messages.validator';
import { AppError } from '../../middlewares/error.middleware';
import { decodeCursor, encodeCursor } from '../../utils/cursor.util';

export class MessagesService {
  async createMessage(input: CreateMessageInput) {
    const now = new Date();

    const message = await prisma.message.create({
      data: {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        to: input.to,
        text: input.text,
        status: 'QUEUED',
        queuedAt: now,
      },
    });

    return {
      id: message.id,
      tenantId: message.tenantId,
      conversationId: message.conversationId,
      to: message.to,
      text: message.text,
      status: message.status,
      queuedAt: message.queuedAt,
      createdAt: message.createdAt,
    };
  }

  async getMessageById(messageId: string, tenantId: string) {
    const message = await prisma.message.findFirst({
      where: {
        id: messageId,
        tenantId, // Strict tenant isolation
      },
    });

    if (!message) {
      throw new AppError(404, `Message with ID '${messageId}' not found`);
    }

    return {
      id: message.id,
      tenantId: message.tenantId,
      conversationId: message.conversationId,
      to: message.to,
      text: message.text,
      status: message.status,
      queuedAt: message.queuedAt,
      sentAt: message.sentAt,
      deliveredAt: message.deliveredAt,
      readAt: message.readAt,
      failedAt: message.failedAt,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    };
  }

  async getConversationMessages(
    conversationId: string,
    tenantId: string,
    limit: number = 20,
    cursor?: string
  ) {
    let cursorCondition: any = undefined;

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (!decoded) {
        throw new AppError(400, 'Invalid pagination cursor provided');
      }

      // Stable compound cursor: (createdAt, id) > (decoded.createdAt, decoded.id)
      cursorCondition = {
        OR: [
          { createdAt: { gt: decoded.createdAt } },
          {
            createdAt: decoded.createdAt,
            id: { gt: decoded.id },
          },
        ],
      };
    }

    const messages = await prisma.message.findMany({
      where: {
        tenantId, // Enforce tenant scoping
        conversationId,
        ...(cursorCondition ? cursorCondition : {}),
      },
      orderBy: [
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
      take: limit + 1, // Fetch one extra to determine if next page exists
    });

    const hasMore = messages.length > limit;
    const pageData = hasMore ? messages.slice(0, limit) : messages;

    let nextCursor: string | null = null;
    if (hasMore && pageData.length > 0) {
      const lastItem = pageData[pageData.length - 1];
      nextCursor = encodeCursor(lastItem.createdAt, lastItem.id);
    }

    return {
      data: pageData.map((msg) => ({
        id: msg.id,
        tenantId: msg.tenantId,
        conversationId: msg.conversationId,
        to: msg.to,
        text: msg.text,
        status: msg.status,
        queuedAt: msg.queuedAt,
        sentAt: msg.sentAt,
        deliveredAt: msg.deliveredAt,
        readAt: msg.readAt,
        failedAt: msg.failedAt,
        createdAt: msg.createdAt,
      })),
      pagination: {
        limit,
        hasMore,
        nextCursor,
      },
    };
  }
}

export const messagesService = new MessagesService();
