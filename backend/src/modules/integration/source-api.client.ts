import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { Environment } from '../../config/environment.js';

export class SourceApiError extends Error {}

@Injectable()
export class SourceApiClient {
  private token: string | null = null;
  constructor(private readonly config: ConfigService<Environment, true>) {}

  async request(
    path: string,
    query: Record<string, string | number | boolean> = {},
    retry = true,
  ): Promise<unknown> {
    const base = this.config.get('API_URL').replace(/\/$/, '');
    if (!base) throw new SourceApiError('External API is not configured');
    const url = new URL(base + path);
    for (const [key, value] of Object.entries(query))
      url.searchParams.set(key, String(value));
    if (this.config.get('API_USERNAME') && !this.token)
      await this.authenticate();
    let response: globalThis.Response;
    try {
      response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new SourceApiError(`External API request failed: ${path}`);
    }
    if (response.status === 401 && retry && this.config.get('API_USERNAME')) {
      await this.authenticate();
      return this.request(path, query, false);
    }
    if (!response.ok)
      throw new SourceApiError(
        `External API ${path} returned HTTP ${response.status}`,
      );
    try {
      return await response.json();
    } catch {
      throw new SourceApiError(`External API ${path} returned invalid JSON`);
    }
  }

  async page<T extends z.ZodType>(
    path: string,
    schema: T,
    query: Record<string, string | number | boolean> = {},
  ): Promise<{ data: z.output<T>[]; cursor: string | null }> {
    const result = z
      .object({
        data: z.array(schema),
        page: z.object({ next_cursor: z.string().nullish() }).nullish(),
      })
      .safeParse(await this.request(path, query));
    if (!result.success)
      throw new SourceApiError(
        `External API ${path} returned an invalid response schema`,
      );
    return {
      data: result.data.data,
      cursor: result.data.page?.next_cursor ?? null,
    };
  }

  async list<T extends z.ZodType>(
    path: string,
    schema: T,
  ): Promise<z.output<T>[]> {
    const items: z.output<T>[] = [];
    const seen = new Set<string>();
    let cursor: string | null = null;
    for (let page = 0; page < 100; page++) {
      const result: { data: z.output<T>[]; cursor: string | null } =
        await this.page(path, schema, {
          limit: 500,
          ...(cursor ? { cursor } : {}),
        });
      items.push(...result.data);
      if (!result.cursor) return items;
      if (seen.has(result.cursor))
        throw new SourceApiError('External API repeated a pagination cursor');
      seen.add(result.cursor);
      cursor = result.cursor;
    }
    throw new SourceApiError('External API pagination limit reached');
  }

  private async authenticate() {
    const url = new URL(
      this.config.get('API_AUTH_PATH'),
      this.config.get('API_URL'),
    );
    let response: globalThis.Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          username: this.config.get('API_USERNAME'),
          password: this.config.get('API_PASSWORD'),
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new SourceApiError('External API authentication request failed');
    }
    if (!response.ok)
      throw new SourceApiError(
        `External API authentication returned HTTP ${response.status}`,
      );
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new SourceApiError(
        'External API authentication returned invalid JSON',
      );
    }
    const parsed = z
      .object({ access_token: z.string().min(1) })
      .safeParse(payload);
    if (!parsed.success)
      throw new SourceApiError(
        'External API authentication returned no access token',
      );
    this.token = parsed.data.access_token;
  }
}
