import { z } from 'zod';

export const ProviderWebhookStatusEnum = z.enum(['SENT', 'DELIVERED', 'READ', 'FAILED'], {
  errorMap: () => ({
    message: "status must be one of: 'SENT', 'DELIVERED', 'READ', 'FAILED'",
  }),
});

export const ProviderWebhookSchema = z.object({
  eventId: z
    .string({ required_error: 'eventId is required' })
    .trim()
    .min(1, 'eventId cannot be empty')
    .max(128, 'eventId must be at most 128 characters'),
  messageId: z
    .string({ required_error: 'messageId is required' })
    .trim()
    .min(1, 'messageId cannot be empty'),
  status: ProviderWebhookStatusEnum,
  occurredAt: z
    .string({ required_error: 'occurredAt is required' })
    .datetime({ message: 'occurredAt must be a valid ISO 8601 datetime string' }),
});

export type ProviderWebhookInput = z.infer<typeof ProviderWebhookSchema>;
