import request from 'supertest';
import { app } from '../src/app';
import { clearDatabase, disconnectDatabase } from './test-utils';
import { prisma } from '../src/db/prisma';

describe('Concurrent Webhook Processing', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await clearDatabase();
    await disconnectDatabase();
  });

  it('should process simultaneous concurrent webhook requests safely without race conditions or crashes', async () => {
    // 1. Create message
    const msgRes = await request(app)
      .post('/api/v1/messages')
      .set('x-tenant-id', 'tenant-a')
      .send({
        tenantId: 'tenant-a',
        conversationId: 'conv-concurrency',
        to: '+919876543210',
        text: 'Concurrency stress test',
      });

    const messageId = msgRes.body.id;

    // 2. Prepare 10 concurrent webhook requests with conflicting and duplicate statuses
    const concurrentRequests = [
      // 3 calls with same eventId evt-c1 (SENT)
      request(app).post('/api/v1/webhooks/provider').send({
        eventId: 'evt-c1',
        messageId,
        status: 'SENT',
        occurredAt: '2026-10-24T10:01:00.000Z',
      }),
      request(app).post('/api/v1/webhooks/provider').send({
        eventId: 'evt-c1',
        messageId,
        status: 'SENT',
        occurredAt: '2026-10-24T10:01:00.000Z',
      }),
      request(app).post('/api/v1/webhooks/provider').send({
        eventId: 'evt-c1',
        messageId,
        status: 'SENT',
        occurredAt: '2026-10-24T10:01:00.000Z',
      }),

      // 3 calls with same eventId evt-c2 (DELIVERED)
      request(app).post('/api/v1/webhooks/provider').send({
        eventId: 'evt-c2',
        messageId,
        status: 'DELIVERED',
        occurredAt: '2026-10-24T10:05:00.000Z',
      }),
      request(app).post('/api/v1/webhooks/provider').send({
        eventId: 'evt-c2',
        messageId,
        status: 'DELIVERED',
        occurredAt: '2026-10-24T10:05:00.000Z',
      }),
      request(app).post('/api/v1/webhooks/provider').send({
        eventId: 'evt-c2',
        messageId,
        status: 'DELIVERED',
        occurredAt: '2026-10-24T10:05:00.000Z',
      }),

      // 2 calls with eventId evt-c3 (READ)
      request(app).post('/api/v1/webhooks/provider').send({
        eventId: 'evt-c3',
        messageId,
        status: 'READ',
        occurredAt: '2026-10-24T10:10:00.000Z',
      }),
      request(app).post('/api/v1/webhooks/provider').send({
        eventId: 'evt-c3',
        messageId,
        status: 'READ',
        occurredAt: '2026-10-24T10:10:00.000Z',
      }),

      // 2 more calls for evt-c1
      request(app).post('/api/v1/webhooks/provider').send({
        eventId: 'evt-c1',
        messageId,
        status: 'SENT',
        occurredAt: '2026-10-24T10:01:00.000Z',
      }),
      request(app).post('/api/v1/webhooks/provider').send({
        eventId: 'evt-c1',
        messageId,
        status: 'SENT',
        occurredAt: '2026-10-24T10:01:00.000Z',
      }),
    ];

    // Fire all requests simultaneously
    const responses = await Promise.all(concurrentRequests);

    // Verify all 10 completed with 200 OK (no 500s or unhandled constraint crashes)
    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(['processed', 'duplicate']).toContain(res.body.status);
    }

    // Verify database integrity
    const events = await prisma.providerEvent.findMany({
      where: { messageId },
    });

    // Exactly 3 unique events persisted (evt-c1, evt-c2, evt-c3)
    expect(events.length).toBe(3);
    const eventIds = events.map((e) => e.eventId).sort();
    expect(eventIds).toEqual(['evt-c1', 'evt-c2', 'evt-c3']);

    // Verify final message state
    const finalMessage = await prisma.message.findUnique({
      where: { id: messageId },
    });

    // Final status must be the highest progression: READ
    expect(finalMessage?.status).toBe('READ');

    // All timestamps must be properly recorded
    expect(finalMessage?.sentAt).toBeDefined();
    expect(finalMessage?.deliveredAt).toBeDefined();
    expect(finalMessage?.readAt).toBeDefined();
  });
});
