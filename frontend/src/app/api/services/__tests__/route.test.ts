import { describe, expect, it } from 'vitest';
import { GET } from '../route';

describe('GET /api/services', () => {
  it('returns the public registry', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.services)).toBe(true);
    expect(body.services.map((s: { id: string }) => s.id).sort())
      .toEqual(['hot-takes', 'repurpose-thread', 'x-thread']);
    expect(body.services[0].validate).toBeUndefined();
  });
});
