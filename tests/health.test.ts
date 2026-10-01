import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

describe('GET /api/v1/health', () => {
  const app = createApp();

  it('returns the health envelope; 200 when DB connected, else 503', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.body.data.status).toBe('ok');
    expect(typeof res.body.data.uptimeSec).toBe('number');
    expect(['connected', 'connecting', 'disconnected', 'unknown']).toContain(res.body.data.db);
    expect(res.status).toBe(res.body.data.db === 'connected' ? 200 : 503);
  });

  it('returns a 404 error envelope for unknown routes', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });
});
