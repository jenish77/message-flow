import request from 'supertest';
import { app } from '../src/app';
import { clearDatabase, disconnectDatabase } from './test-utils';
import { prisma } from '../src/db/prisma';

describe('Out-of-Order Webhook Delivery', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await clearDatabase();
    await disconnectDatabase();
  });

  it('should handle DELIVERED arriving before SENT without moving status backwards, while recording both timestamps', async () => {
    // 1. Create a message
    const msgRes = await request(app)
      .post('/api/v1/messages')
      .set('x-tenant-id', 'tenant-a')
      .send({
        tenantId: 'tenant-a',
        conversationId: 'conv-ooo',
        to: '+919876543210',
        text: 'Out of order test message',
      });

    const messageId = msgRes.body.id;
    expect(msgRes.body.status).toBe('QUEUED');

    // 2. DELIVERED event arrives FIRST
    const deliveredTime = '2026-10-24T10:15:00.000Z';
    const deliveredRes = await request(app)
      .post('/api/v1/webhooks/provider')
      .send({
        eventId: 'evt-del-1',
        messageId,
        status: 'DELIVERED',
        occurredAt: deliveredTime,
      });

    expect(deliveredRes.status).toBe(200);
    expect(deliveredRes.body.applied).toBe(true);

    // Verify DB state: status moved directly to DELIVERED
    let msg = await prisma.message.findUnique({ where: { id: messageId } });
    expect(msg?.status).toBe('DELIVERED');
    expect(msg?.deliveredAt).toEqual(new Date(deliveredTime));
    expect(msg?.sentAt).toBeNull();

    // 3. Delayed SENT event arrives SECOND (with earlier occurredAt)
    const sentTime = '2026-10-24T10:10:00.000Z';
    const sentRes = await request(app)
      .post('/api/v1/webhooks/provider')
      .send({
        eventId: 'evt-sent-delayed',
        messageId,
        status: 'SENT',
        occurredAt: sentTime,
      });

    expect(sentRes.status).toBe(200);
    // applied is false because status did NOT move backwards
    expect(sentRes.body.applied).toBe(false);

    // Verify DB state: status is STILL DELIVERED (no regress!), but sentAt is now recorded!
    msg = await prisma.message.findUnique({ where: { id: messageId } });
    expect(msg?.status).toBe('DELIVERED');
    expect(msg?.deliveredAt).toEqual(new Date(deliveredTime));
    expect(msg?.sentAt).toEqual(new Date(sentTime));

    // 4. READ event arrives THIRD
    const readTime = '2026-10-24T10:20:00.000Z';
    const readRes = await request(app)
      .post('/api/v1/webhooks/provider')
      .send({
        eventId: 'evt-read-1',
        messageId,
        status: 'READ',
        occurredAt: readTime,
      });

    expect(readRes.status).toBe(200);
    expect(readRes.body.applied).toBe(true);

    msg = await prisma.message.findUnique({ where: { id: messageId } });
    expect(msg?.status).toBe('READ');
    expect(msg?.readAt).toEqual(new Date(readTime));

    // 5. Subsequent FAILED event arrives for an already READ message
    const failedRes = await request(app)
      .post('/api/v1/webhooks/provider')
      .send({
        eventId: 'evt-fail-late',
        messageId,
        status: 'FAILED',
        occurredAt: '2026-10-24T10:25:00.000Z',
      });

    expect(failedRes.status).toBe(200);
    expect(failedRes.body.applied).toBe(false);

    // Verify message status remains READ (cannot fail delivered/read message)
    msg = await prisma.message.findUnique({ where: { id: messageId } });
    expect(msg?.status).toBe('READ');
  });
});
