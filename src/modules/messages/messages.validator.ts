import { z } from 'zod';

export const e164Regex = /^\+[1-9]\d{1,14}$/;

export const CreateMessageSchema = z.object({
  tenantId: z
    .string({ required_error: 'tenantId is required' })
    .trim()
    .min(1, 'tenantId cannot be empty')
    .max(64, 'tenantId must be at most 64 characters'),
  conversationId: z
    .string({ required_error: 'conversationId is required' })
    .trim()
    .min(1, 'conversationId cannot be empty')
    .max(64, 'conversationId must be at most 64 characters'),
  to: z
    .string({ required_error: 'to is required' })
    .trim()
    .regex(e164Regex, 'to must be a valid E.164 format phone number (e.g. +919876543210)')
    .max(20, 'to must be at most 20 characters'),
  text: z
    .string({ required_error: 'text is required' })
    .min(1, 'text cannot be empty')
    .max(4096, 'text must not exceed 4096 characters'),
});

export type CreateMessageInput = z.infer<typeof CreateMessageSchema>;

export const GetConversationMessagesQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 20))
    .refine((val) => !isNaN(val) && val >= 1 && val <= 100, {
      message: 'limit must be an integer between 1 and 100',
    }),
  cursor: z.string().optional(),
});

export type GetConversationMessagesQuery = z.infer<typeof GetConversationMessagesQuerySchema>;
