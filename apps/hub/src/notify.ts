import { randomUUID } from 'node:crypto';
import type { HubConfig } from './config.ts';
import type { Store } from './store.ts';

const COOLDOWN_MS = 30 * 60 * 1_000;
const TIMEOUT_MS = 5_000;

export type NotificationKind =
  | 'device_joined'
  | 'source_error'
  | 'source_recovered'
  | 'rejected_spike';

type NotificationConfig = Pick<HubConfig, 'notifyWebhookUrl' | 'notifyBarkUrl'>;
type NotificationStore = Pick<Store, 'appendSystemLog'>;

export interface NotifierOptions {
  fetch?: typeof fetch;
  now?: () => number;
}

export class Notifier {
  private readonly cooldowns = new Map<string, number>();
  private readonly fetch: typeof fetch;
  private readonly now: () => number;

  constructor(
    private readonly store: NotificationStore,
    private readonly config: NotificationConfig,
    options: NotifierOptions = {},
  ) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
  }

  send(kind: NotificationKind, title: string, body: string, key: string): void {
    const targets = [
      ...(this.config.notifyWebhookUrl === undefined
        ? []
        : [{ name: 'webhook', url: this.config.notifyWebhookUrl } as const]),
      ...(this.config.notifyBarkUrl === undefined
        ? []
        : [{ name: 'Bark', url: this.config.notifyBarkUrl } as const]),
    ];
    if (targets.length === 0) return;

    const now = this.now();
    const cooldownKey = `${kind}\u0000${key}`;
    if ((this.cooldowns.get(cooldownKey) ?? 0) > now) return;
    this.cooldowns.set(cooldownKey, now + COOLDOWN_MS);
    this.store.appendSystemLog({
      id: randomUUID(),
      ts: now,
      level: 'info',
      scope: 'notify',
      message: `${title}: ${body}`,
    });

    for (const target of targets) {
      void this.deliver(target.name, target.url, kind, title, body, now).catch((error: unknown) => {
        this.store.appendSystemLog({
          id: randomUUID(),
          ts: this.now(),
          level: 'warn',
          scope: 'notify',
          message: `${target.name} notification failed: ${error instanceof Error ? error.message : String(error)}`,
        });
      });
    }
  }

  private async deliver(
    target: 'webhook' | 'Bark',
    url: string,
    kind: NotificationKind,
    title: string,
    body: string,
    ts: number,
  ): Promise<void> {
    const response =
      target === 'webhook'
        ? await this.fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ kind, title, body, ts }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
          })
        : await this.fetch(
            `${url.replace(/\/+$/, '')}/${encodeURIComponent(title)}/${encodeURIComponent(body)}`,
            { method: 'GET', signal: AbortSignal.timeout(TIMEOUT_MS) },
          );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  }
}
