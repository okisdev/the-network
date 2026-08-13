import type { SystemLogEntry } from '@the-network/schema';
import { describe, expect, it, vi } from 'vitest';
import { Notifier } from './notify.ts';

function testStore(): { entries: SystemLogEntry[]; store: { appendSystemLog(entry: SystemLogEntry): SystemLogEntry } } {
  const entries: SystemLogEntry[] = [];
  return {
    entries,
    store: {
      appendSystemLog(entry) {
        entries.push(entry);
        return entry;
      },
    },
  };
}

describe('Notifier', () => {
  it('posts the webhook payload with its notification timestamp', () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      new Response(null, { status: 204 }));
    const { entries, store } = testStore();
    const notifier = new Notifier(
      store,
      { notifyWebhookUrl: 'https://notify.example/hook' },
      { fetch: fetchMock as typeof fetch, now: () => 1_234 },
    );

    notifier.send('device_joined', 'New device joined', 'Phone', 'device-1');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://notify.example/hook');
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: expect.any(AbortSignal),
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      kind: 'device_joined',
      title: 'New device joined',
      body: 'Phone',
      ts: 1_234,
    });
    expect(entries).toEqual([
      expect.objectContaining({
        ts: 1_234,
        level: 'info',
        scope: 'notify',
        message: 'New device joined: Phone',
      }),
    ]);
  });

  it('encodes the Bark title and body in the request path', () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      new Response(null, { status: 204 }));
    const { store } = testStore();
    const notifier = new Notifier(
      store,
      { notifyBarkUrl: 'https://api.day.app/key/' },
      { fetch: fetchMock as typeof fetch },
    );

    notifier.send('source_error', 'Probe error', 'bad/gateway', 'source-1');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.day.app/key/Probe%20error/bad%2Fgateway',
      expect.objectContaining({ method: 'GET', signal: expect.any(AbortSignal) }),
    );
  });

  it('suppresses matching kind and key pairs during the cooldown', () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      new Response(null, { status: 204 }));
    const { entries, store } = testStore();
    const notifier = new Notifier(
      store,
      { notifyWebhookUrl: 'https://notify.example/hook' },
      { fetch: fetchMock as typeof fetch, now: () => 10_000 },
    );

    notifier.send('source_error', 'Probe error', 'First', 'source-1');
    notifier.send('source_error', 'Probe error', 'Second', 'source-1');

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(entries).toHaveLength(1);
  });

  it('does nothing when no target is configured', () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      new Response(null, { status: 204 }));
    const { entries, store } = testStore();
    const notifier = new Notifier(store, {}, { fetch: fetchMock as typeof fetch });

    notifier.send('source_recovered', 'Probe recovered', 'Ready', 'source-1');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(entries).toEqual([]);
  });

  it('records delivery failures as warning system logs', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      new Response(null, { status: 503 }));
    const { entries, store } = testStore();
    const notifier = new Notifier(
      store,
      { notifyWebhookUrl: 'https://notify.example/hook' },
      { fetch: fetchMock as typeof fetch },
    );

    notifier.send('source_error', 'Probe error', 'Unavailable', 'source-1');

    await vi.waitFor(() => expect(entries).toHaveLength(2));
    expect(entries[1]).toMatchObject({
      level: 'warn',
      scope: 'notify',
      message: 'webhook notification failed: HTTP 503',
    });
  });
});
