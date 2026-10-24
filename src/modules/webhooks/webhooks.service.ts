import { prisma } from '../../db/prisma';
import { ProviderWebhookInput } from './webhooks.validator';
import { AppError } from '../../middlewares/error.middleware';
import { Prisma } from '@prisma/client';
import { logger } from '../../utils/logger.util';

const STATUS_RANK: Record<string, number> = {
  QUEUED: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
};

export class WebhooksService {
  async processProviderEvent(input: ProviderWebhookInput) {
    const occurredAtDate = new Date(input.occurredAt);

    try {
      return await prisma.$transaction(async (tx) => {
        // 1. Check if event was already processed (fast-path deduplication)
        const existingEvent = await tx.providerEvent.findUnique({
          where: { eventId: input.eventId },
        });

        if (existingEvent) {
          logger.info(`Duplicate eventId detected: ${input.eventId}`, {
            eventId: input.eventId,
            messageId: input.messageId,
          });
          return {
            success: true,
            status: 'duplicate',
            eventId: input.eventId,
            messageId: input.messageId,
            applied: false,
          };
        }

        // 2. Lock the target message row for update to eliminate concurrency race conditions
        try {
          await tx.$queryRawUnsafe(
            'SELECT id FROM "messages" WHERE "id" = $1 FOR UPDATE',
            input.messageId
          );
        } catch {
          // If the DB does not support FOR UPDATE (e.g. SQLite in test), proceed inside serializable tx
        }

        // 3. Fetch the message
        const message = await tx.message.findUnique({
          where: { id: input.messageId },
        });

        if (!message) {
          throw new AppError(404, `Message with ID '${input.messageId}' not found`);
        }

        // 4. Record the provider event
        await tx.providerEvent.create({
          data: {
            eventId: input.eventId,
            messageId: input.messageId,
            status: input.status,
            occurredAt: occurredAtDate,
            payload: input as any,
          },
        });

        // 5. Calculate Status Progression and Timestamp Recording
        const currentRank = STATUS_RANK[message.status] ?? -1;
        const incomingRank = STATUS_RANK[input.status] ?? -1;

        let newStatus = message.status;
        let shouldUpdateStatus = false;

        // Status progression logic
        if (input.status === 'FAILED') {
          // Can only fail if not already reached terminal delivered/read states
          if (message.status === 'QUEUED' || message.status === 'SENT') {
            newStatus = 'FAILED';
            shouldUpdateStatus = true;
          }
        } else if (message.status !== 'FAILED') {
          // Unidirectional progression: only move forward
          if (incomingRank > currentRank) {
            newStatus = input.status as any;
            shouldUpdateStatus = true;
          }
        }

        // Independent timestamp recording (Separated from status progression)
        const updateData: Prisma.MessageUpdateInput = {};

        if (shouldUpdateStatus) {
          updateData.status = newStatus;
        }

        if (input.status === 'SENT') {
          if (!message.sentAt || occurredAtDate < message.sentAt) {
            updateData.sentAt = occurredAtDate;
          }
        } else if (input.status === 'DELIVERED') {
          if (!message.deliveredAt || occurredAtDate < message.deliveredAt) {
            updateData.deliveredAt = occurredAtDate;
          }
        } else if (input.status === 'READ') {
          if (!message.readAt || occurredAtDate < message.readAt) {
            updateData.readAt = occurredAtDate;
          }
        } else if (input.status === 'FAILED' && newStatus === 'FAILED') {
          if (!message.failedAt) {
            updateData.failedAt = occurredAtDate;
          }
        }

        // If there are status or timestamp changes, persist them
        if (Object.keys(updateData).length > 0) {
          await tx.message.update({
            where: { id: message.id },
            data: updateData,
          });
        }

        return {
          success: true,
          status: 'processed',
          eventId: input.eventId,
          messageId: input.messageId,
          applied: shouldUpdateStatus,
        };
      });
    } catch (error: any) {
      // Gracefully handle database unique constraint violation (P2002) in concurrent races
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        logger.info(`Concurrent duplicate eventId caught via constraint: ${input.eventId}`, {
          eventId: input.eventId,
          messageId: input.messageId,
        });
        return {
          success: true,
          status: 'duplicate',
          eventId: input.eventId,
          messageId: input.messageId,
          applied: false,
        };
      }

      throw error;
    }
  }
}

export const webhooksService = new WebhooksService();
