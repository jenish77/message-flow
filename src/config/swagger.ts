export const swaggerDocument = {
  openapi: '3.0.3',
  info: {
    title: 'MessageFlow API',
    version: '1.0.0',
    description:
      'Enterprise-grade REST API for a multi-tenant messaging backend with idempotent provider webhooks, unidirectional status progression, row-level locking, and deterministic pagination.',
  },
  servers: [
    {
      url: 'http://localhost:3001',
      description: 'Local development server',
    },
  ],
  components: {
    securitySchemes: {
      TenantHeaderAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'x-tenant-id',
        description: 'Tenant identifier representing the authenticated tenant context (e.g. tenant-alpha)',
      },
    },
    schemas: {
      CreateMessageInput: {
        type: 'object',
        required: ['tenantId', 'conversationId', 'to', 'text'],
        properties: {
          tenantId: {
            type: 'string',
            minLength: 1,
            maxLength: 64,
            example: 'tenant-alpha',
            description: 'Tenant identifier (must match x-tenant-id header)',
          },
          conversationId: {
            type: 'string',
            minLength: 1,
            maxLength: 64,
            example: 'conv-100',
            description: 'Conversation or channel identifier',
          },
          to: {
            type: 'string',
            maxLength: 20,
            pattern: '^\\+[1-9]\\d{1,14}$',
            example: '+919876543210',
            description: 'Recipient phone number formatted in E.164 standards',
          },
          text: {
            type: 'string',
            minLength: 1,
            maxLength: 4096,
            example: 'Your Order #4567 has shipped via Express Delivery.',
            description: 'Message body text (up to 4096 characters)',
          },
        },
      },
      MessageCreatedResponse: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'c19a4e82-20c2-48f8-b394-814cb91dd78e' },
          tenantId: { type: 'string', example: 'tenant-alpha' },
          conversationId: { type: 'string', example: 'conv-100' },
          to: { type: 'string', example: '+919876543210' },
          text: { type: 'string', example: 'Your Order #4567 has shipped via Express Delivery.' },
          status: { type: 'string', enum: ['QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED'], example: 'QUEUED' },
          queuedAt: { type: 'string', format: 'date-time', example: '2026-10-24T12:00:00.000Z' },
          createdAt: { type: 'string', format: 'date-time', example: '2026-10-24T12:00:00.000Z' },
        },
      },
      MessageDetailResponse: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'c19a4e82-20c2-48f8-b394-814cb91dd78e' },
          tenantId: { type: 'string', example: 'tenant-alpha' },
          conversationId: { type: 'string', example: 'conv-100' },
          to: { type: 'string', example: '+919876543210' },
          text: { type: 'string', example: 'Your Order #4567 has shipped via Express Delivery.' },
          status: { type: 'string', enum: ['QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED'], example: 'DELIVERED' },
          queuedAt: { type: 'string', format: 'date-time', example: '2026-10-24T12:00:00.000Z' },
          sentAt: { type: 'string', format: 'date-time', nullable: true, example: '2026-10-24T12:05:00.000Z' },
          deliveredAt: { type: 'string', format: 'date-time', nullable: true, example: '2026-10-24T12:15:00.000Z' },
          readAt: { type: 'string', format: 'date-time', nullable: true, example: null },
          failedAt: { type: 'string', format: 'date-time', nullable: true, example: null },
          createdAt: { type: 'string', format: 'date-time', example: '2026-10-24T12:00:00.000Z' },
          updatedAt: { type: 'string', format: 'date-time', example: '2026-10-24T12:15:00.000Z' },
        },
      },
      ConversationMessagesResponse: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/MessageDetailResponse' },
          },
          pagination: {
            type: 'object',
            properties: {
              limit: { type: 'integer', example: 20 },
              hasMore: { type: 'boolean', example: true },
              nextCursor: {
                type: 'string',
                nullable: true,
                example: 'eyJjcmVhdGVkQXQiOiIyMDI2LTEwLTI0VDEwOjAwOjAwLjAwMFoiLCJpZCI6Im1zZy0xIn0=',
              },
            },
          },
        },
      },
      ProviderWebhookInput: {
        type: 'object',
        required: ['eventId', 'messageId', 'status', 'occurredAt'],
        properties: {
          eventId: {
            type: 'string',
            maxLength: 128,
            example: 'evt-meta-001',
            description: 'Unique event identifier from messaging provider for deduplication',
          },
          messageId: {
            type: 'string',
            example: 'c19a4e82-20c2-48f8-b394-814cb91dd78e',
            description: 'Target message identifier',
          },
          status: {
            type: 'string',
            enum: ['SENT', 'DELIVERED', 'READ', 'FAILED'],
            example: 'DELIVERED',
            description: 'Updated delivery event status',
          },
          occurredAt: {
            type: 'string',
            format: 'date-time',
            example: '2026-10-24T12:15:00.000Z',
            description: 'ISO 8601 timestamp when event occurred at the provider',
          },
        },
      },
      WebhookResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          status: { type: 'string', enum: ['processed', 'duplicate'], example: 'processed' },
          eventId: { type: 'string', example: 'evt-meta-001' },
          messageId: { type: 'string', example: 'c19a4e82-20c2-48f8-b394-814cb91dd78e' },
          applied: { type: 'boolean', example: true },
        },
      },
      HealthResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'ok' },
          timestamp: { type: 'string', format: 'date-time', example: '2026-10-24T12:00:00.000Z' },
          services: {
            type: 'object',
            properties: {
              database: { type: 'string', example: 'up' },
            },
          },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          statusCode: { type: 'integer', example: 400 },
          error: { type: 'string', example: 'Bad Request' },
          message: { type: 'string', example: 'Validation failed' },
          details: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string', example: 'to' },
                message: { type: 'string', example: 'to must be a valid E.164 format phone number' },
              },
            },
          },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Service Health Check',
        description: 'Returns API operational health and verifies database connectivity with a safe probe.',
        responses: {
          '200': {
            description: 'Service and database are operational',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthResponse' },
              },
            },
          },
          '503': {
            description: 'Database connection failed or degraded',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthResponse' },
              },
            },
          },
        },
      },
    },
    '/api/v1/messages': {
      post: {
        tags: ['Messages'],
        summary: 'Create and Queue Message',
        description:
          'Validates required fields, generates a message ID, persists message in PostgreSQL with status QUEUED, and returns consistent payload.',
        security: [{ TenantHeaderAuth: [] }],
        parameters: [
          {
            name: 'x-tenant-id',
            in: 'header',
            required: true,
            schema: { type: 'string', example: 'tenant-alpha' },
            description: 'Tenant identifier representing authenticated client tenant',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateMessageInput' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Message created successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MessageCreatedResponse' },
              },
            },
          },
          '400': {
            description: 'Bad request (Validation failed or tenant mismatch between header and body)',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '401': {
            description: 'Unauthorized (Missing x-tenant-id header)',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/v1/messages/{messageId}': {
      get: {
        tags: ['Messages'],
        summary: 'Get Message Details',
        description:
          'Returns current message status and relevant timestamps (queuedAt, sentAt, deliveredAt, readAt). Enforces strict tenant isolation.',
        security: [{ TenantHeaderAuth: [] }],
        parameters: [
          {
            name: 'messageId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Unique message identifier',
          },
          {
            name: 'x-tenant-id',
            in: 'header',
            required: true,
            schema: { type: 'string', example: 'tenant-alpha' },
            description: 'Tenant identifier',
          },
        ],
        responses: {
          '200': {
            description: 'Message details found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MessageDetailResponse' },
              },
            },
          },
          '404': {
            description: 'Message not found or belongs to another tenant',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '401': {
            description: 'Unauthorized (Missing x-tenant-id header)',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/v1/conversations/{conversationId}/messages': {
      get: {
        tags: ['Conversations'],
        summary: 'Get Conversation Messages (Cursor Pagination)',
        description:
          'Returns messages for a conversation in stable chronological order with compound cursor pagination and tenant scoping.',
        security: [{ TenantHeaderAuth: [] }],
        parameters: [
          {
            name: 'conversationId',
            in: 'path',
            required: true,
            schema: { type: 'string', example: 'conv-100' },
            description: 'Conversation identifier',
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 },
            description: 'Number of messages to retrieve per page (1-100)',
          },
          {
            name: 'cursor',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Base64 encoded cursor for pagination',
          },
          {
            name: 'x-tenant-id',
            in: 'header',
            required: true,
            schema: { type: 'string', example: 'tenant-alpha' },
            description: 'Tenant identifier',
          },
        ],
        responses: {
          '200': {
            description: 'Paginated messages list',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ConversationMessagesResponse' },
              },
            },
          },
          '400': {
            description: 'Invalid query parameters or corrupted cursor',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '401': {
            description: 'Unauthorized (Missing x-tenant-id header)',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/v1/webhooks/provider': {
      post: {
        tags: ['Webhooks'],
        summary: 'Ingest Provider Delivery Webhook',
        description:
          'Idempotently ingests external webhook events. Atomic transaction with row-level locking handles out-of-order events and concurrency. Duplicate eventId requests return 200 with applied: false.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ProviderWebhookInput' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Webhook processed successfully or safely deduplicated',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WebhookResponse' },
              },
            },
          },
          '400': {
            description: 'Invalid webhook payload structure or invalid status enum',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '404': {
            description: 'Unknown messageId',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
  },
};
