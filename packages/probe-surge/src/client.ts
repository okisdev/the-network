const REQUEST_TIMEOUT_MS = 8_000;

export class SurgeClient {
  readonly #baseUrl: string;
  readonly #apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.#baseUrl = normalizeBaseUrl(baseUrl);
    this.#apiKey = apiKey;
  }

  getRecentRequests(signal?: AbortSignal): Promise<unknown> {
    return this.#get('/v1/requests/recent', signal);
  }

  getDevices(signal?: AbortSignal): Promise<unknown> {
    return this.#get('/v1/devices', signal);
  }

  getDnsCache(signal?: AbortSignal): Promise<unknown> {
    return this.#get('/v1/dns', signal);
  }

  getTraffic(signal?: AbortSignal): Promise<unknown> {
    return this.#get('/v1/traffic', signal);
  }

  getOutbound(signal?: AbortSignal): Promise<unknown> {
    return this.#get('/v1/outbound', signal);
  }

  async #get(path: string, outer?: AbortSignal): Promise<unknown> {
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const signal =
      outer !== undefined ? AbortSignal.any([timeout, outer]) : timeout;

    const res = await fetch(`${this.#baseUrl}${path}`, {
      method: 'GET',
      headers: {
        'x-key': this.#apiKey,
        accept: 'application/json',
      },
      signal,
    });

    if (!res.ok) {
      const err = new Error(`Surge HTTP ${res.status}`) as Error & { status: number };
      err.status = res.status;
      throw err;
    }

    return (await res.json()) as unknown;
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  let url = baseUrl.trim();
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url)) {
    url = `http://${url}`;
  }
  return url.replace(/\/+$/, '');
}
