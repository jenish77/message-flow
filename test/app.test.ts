import request from 'supertest';
import { app } from '../src/app';
import { disconnectDatabase } from './test-utils';

describe('App & Health Endpoints', () => {
  afterAll(async () => {
    await disconnectDatabase();
  });

  it('GET /health should return 200 and healthy status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.services).toHaveProperty('database');
  });

  it('GET /api/v1/non-existent-route should return 404', async () => {
    const res = await request(app).get('/api/v1/non-existent-route');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not Found');
  });
});
