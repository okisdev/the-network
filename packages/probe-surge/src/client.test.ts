import { afterEach, describe, expect, it, vi } from 'vitest';
import { SurgeClient } from './client.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SurgeClient lastLatencyMs', () => {
  it('records duration after a successful request and leaves it unchanged on failure', async () => {
    const client = new SurgeClient('http://127.0.0.1:6171', 'secret');
    expect(client.lastLatencyMs).toBeUndefined();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ requests: [] }),
      }),
    );

    await client.getRecentRequests();
    const afterOk = client.lastLatencyMs;
    expect(afterOk).toEqual(expect.any(Number));
    expect(afterOk).toBeGreaterThanOrEqual(0);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
      }),
    );

    await expect(client.getRecentRequests()).rejects.toThrow(/Surge HTTP 500/);
    expect(client.lastLatencyMs).toBe(afterOk);
  });
});
