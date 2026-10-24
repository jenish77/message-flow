import request from 'supertest';
import { app } from '../src/app';
import { clearDatabase, disconnectDatabase } from './test-utils';

describe('Messages API', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await clearDatabase();
    await disconnectDatabase();
  });

  describe('POST /api/v1/messages', () => {
    it('should successfully create a message with status QUEUED', async () => {
      const payload = {
        tenantId: 'tenant-alpha',
        conversationId: 'conv-101',
        to: '+919876543210',
        text: 'Your Order has shipped',
      };

      const res = await request(app)
        .post('/api/v1/messages')
        .set('x-tenant-id', 'tenant-alpha')
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.tenantId).toBe('tenant-alpha');
      expect(res.body.conversationId).toBe('conv-101');
      expect(res.body.to).toBe('+919876543210');
      expect(res.body.text).toBe('Your Order has shipped');
      expect(res.body.status).toBe('QUEUED');
      expect(res.body).toHaveProperty('queuedAt');
      expect(res.body).toHaveProperty('createdAt');
    });

    it('should reject request when x-tenant-id header is missing (401)', async () => {
      const payload = {
        tenantId: 'tenant-alpha',
        conversationId: 'conv-101',
        to: '+919876543210',
        text: 'Hello',
      };

      const res = await request(app)
        .post('/api/v1/messages')
        .send(payload);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('should reject request when x-tenant-id header does not match body tenantId (400)', async () => {
      const payload = {
        tenantId: 'tenant-alpha',
        conversationId: 'conv-101',
        to: '+919876543210',
        text: 'Hello',
      };

      const res = await request(app)
        .post('/api/v1/messages')
        .set('x-tenant-id', 'tenant-beta') // Mismatch!
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Tenant mismatch');
    });

    it('should reject invalid phone numbers that do not follow E.164 (400)', async () => {
      const payload = {
        tenantId: 'tenant-alpha',
        conversationId: 'conv-101',
        to: 'invalid-phone-number',
        text: 'Hello',
      };

      const res = await request(app)
        .post('/api/v1/messages')
        .set('x-tenant-id', 'tenant-alpha')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Validation failed');
    });

    it('should reject empty text or missing required fields (400)', async () => {
      const res = await request(app)
        .post('/api/v1/messages')
        .set('x-tenant-id', 'tenant-alpha')
        .send({
          tenantId: 'tenant-alpha',
          to: '+919876543210',
          // missing conversationId and text
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Bad Request');
    });
  });

  describe('GET /api/v1/messages/:messageId', () => {
    it('should retrieve a message by ID with current status and timestamps', async () => {
      // First create a message
      const createRes = await request(app)
        .post('/api/v1/messages')
        .set('x-tenant-id', 'tenant-alpha')
        .send({
          tenantId: 'tenant-alpha',
          conversationId: 'conv-100',
          to: '+919876543210',
          text: 'Order confirmed',
        });

      const messageId = createRes.body.id;

      // Retrieve it
      const getRes = await request(app)
        .get(`/api/v1/messages/${messageId}`)
        .set('x-tenant-id', 'tenant-alpha');

      expect(getRes.status).toBe(200);
      expect(getRes.body.id).toBe(messageId);
      expect(getRes.body.status).toBe('QUEUED');
      expect(getRes.body.queuedAt).toBeDefined();
    });

    it('should enforce tenant isolation (Tenant Beta cannot read Tenant Alpha message)', async () => {
      const createRes = await request(app)
        .post('/api/v1/messages')
        .set('x-tenant-id', 'tenant-alpha')
        .send({
          tenantId: 'tenant-alpha',
          conversationId: 'conv-100',
          to: '+919876543210',
          text: 'Secret info',
        });

      const messageId = createRes.body.id;

      // Tenant Beta attempts to read Tenant Alpha's message
      const getRes = await request(app)
        .get(`/api/v1/messages/${messageId}`)
        .set('x-tenant-id', 'tenant-beta');

      expect(getRes.status).toBe(404);
      expect(getRes.body.message).toContain('not found');
    });

    it('should return 404 for non-existent message ID', async () => {
      const getRes = await request(app)
        .get('/api/v1/messages/non-existent-id')
        .set('x-tenant-id', 'tenant-alpha');

      expect(getRes.status).toBe(404);
    });
  });

  describe('GET /api/v1/conversations/:conversationId/messages', () => {
    it('should return messages in chronological order with cursor pagination', async () => {
      // Create 5 messages sequentially
      for (let i = 1; i <= 5; i++) {
        await request(app)
          .post('/api/v1/messages')
          .set('x-tenant-id', 'tenant-alpha')
          .send({
            tenantId: 'tenant-alpha',
            conversationId: 'conv-pagination',
            to: '+919876543210',
            text: `Message number ${i}`,
          });
      }

      // Fetch page 1 with limit = 2
      const page1Res = await request(app)
        .get('/api/v1/conversations/conv-pagination/messages?limit=2')
        .set('x-tenant-id', 'tenant-alpha');

      expect(page1Res.status).toBe(200);
      expect(page1Res.body.data.length).toBe(2);
      expect(page1Res.body.pagination.hasMore).toBe(true);
      expect(page1Res.body.pagination.nextCursor).toBeDefined();
      expect(page1Res.body.data[0].text).toBe('Message number 1');
      expect(page1Res.body.data[1].text).toBe('Message number 2');

      // Fetch page 2 using cursor
      const cursor = page1Res.body.pagination.nextCursor;
      const page2Res = await request(app)
        .get(`/api/v1/conversations/conv-pagination/messages?limit=2&cursor=${encodeURIComponent(cursor)}`)
        .set('x-tenant-id', 'tenant-alpha');

      expect(page2Res.status).toBe(200);
      expect(page2Res.body.data.length).toBe(2);
      expect(page2Res.body.pagination.hasMore).toBe(true);
      expect(page2Res.body.data[0].text).toBe('Message number 3');
      expect(page2Res.body.data[1].text).toBe('Message number 4');

      // Fetch page 3
      const cursor2 = page2Res.body.pagination.nextCursor;
      const page3Res = await request(app)
        .get(`/api/v1/conversations/conv-pagination/messages?limit=2&cursor=${encodeURIComponent(cursor2)}`)
        .set('x-tenant-id', 'tenant-alpha');

      expect(page3Res.status).toBe(200);
      expect(page3Res.body.data.length).toBe(1);
      expect(page3Res.body.pagination.hasMore).toBe(false);
      expect(page3Res.body.pagination.nextCursor).toBeNull();
      expect(page3Res.body.data[0].text).toBe('Message number 5');
    });

    it('should isolate conversation history across tenants', async () => {
      // Create message for Tenant Alpha
      await request(app)
        .post('/api/v1/messages')
        .set('x-tenant-id', 'tenant-alpha')
        .send({
          tenantId: 'tenant-alpha',
          conversationId: 'conv-shared-id',
          to: '+919876543210',
          text: 'Alpha private message',
        });

      // Tenant Beta queries the same conversation ID
      const res = await request(app)
        .get('/api/v1/conversations/conv-shared-id/messages')
        .set('x-tenant-id', 'tenant-beta');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(0);
    });
  });
});
