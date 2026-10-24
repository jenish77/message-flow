import request from 'supertest';
import { app } from '../src/app';
import { clearDatabase, disconnectDatabase } from './test-utils';
import { prisma } from '../src/db/prisma';

describe('Webhook Idempotency API', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await clearDatabase();
    await disconnectDatabase();
  });

  it('should process first webhook event and safely deduplicate repeated eventId', async () => {
    // 1. Create message
    const msgRes = await request(app)
      .post('/api/v1/messages')
      .set('x-tenant-id', 'tenant-a')
      .send({
        tenantId: 'tenant-a',
        conversationId: 'conv-idempotency',
        to: '+919876543210',
        text: 'Test Idempotency',
      });

    const messageId = msgRes.body.id;

    const webhookPayload = {
      eventId: 'evt-unique-001',
      messageId,
      status: 'SENT',
      occurredAt: '2026-10-24T10:00:00.000Z',
    };

    // 2. First delivery
    const firstDelivery = await request(app)
      .post('/api/v1/webhooks/provider')
      .send(webhookPayload);

    expect(firstDelivery.status).toBe(200);
    expect(firstDelivery.body.success).toBe(true);
    expect(firstDelivery.body.status).toBe('processed');
    expect(firstDelivery.body.applied).toBe(true);

    // Verify DB state
    const messageAfterFirst = await prisma.message.findUnique({ where: { id: messageId } });
    expect(messageAfterFirst?.status).toBe('SENT');
    expect(messageAfterFirst?.sentAt).toBeDefined();

    const eventsCountAfterFirst = await prisma.providerEvent.count({
      where: { eventId: 'evt-unique-001' },
    });
    expect(eventsCountAfterFirst).toBe(1);

    // 3. Repeated delivery with identical eventId
    const secondDelivery = await request(app)
      .post('/api/v1/webhooks/provider')
      .send(webhookPayload);

    expect(secondDelivery.status).toBe(200);
    expect(secondDelivery.body.success).toBe(true);
    expect(secondDelivery.body.status).toBe('duplicate');
    expect(secondDelivery.body.applied).toBe(false);

    // 4. Third delivery with same eventId
    const thirdDelivery = await request(app)
      .post('/api/v1/webhooks/provider')
      .send(webhookPayload);

    expect(thirdDelivery.status).toBe(200);
    expect(thirdDelivery.body.status).toBe('duplicate');
    expect(thirdDelivery.body.applied).toBe(false);

    // Verify DB still only has exactly 1 event record
    const finalEventsCount = await prisma.providerEvent.count({
      where: { eventId: 'evt-unique-001' },
    });
    expect(finalEventsCount).toBe(1);
  });

  it('should return 404 for unknown message ID', async () => {
    const res = await request(app)
      .post('/api/v1/webhooks/provider')
      .send({
        eventId: 'evt-unknown-msg',
        messageId: 'non-existent-msg-id',
        status: 'DELIVERED',
        occurredAt: '2026-10-24T10:00:00.000Z',
      });

    expect(res.status).toBe(404);
    expect(res.body.message).toContain('not found');
  });

  it('should reject invalid webhook payloads (400 Bad Request)', async () => {
    const res = await request(app)
      .post('/api/v1/webhooks/provider')
      .send({
        eventId: 'evt-bad',
        messageId: 'some-id',
        status: 'UNKNOWN_STATUS', // Invalid status enum
        occurredAt: 'not-a-date',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Bad Request');
  });
});
