import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import worker, { Env } from '../src/index';

interface MockFeedbackRow {
  id: number;
  received_at: string;
  kind: string;
  video_id: string;
  title: string;
  channel_handle: string | null;
  matched_rule_ids: string;
  score: number;
  strictness: string;
  patterns_revision: number;
  extension_version: string;
  browser: string;
}

function createMockD1() {
  const rows: MockFeedbackRow[] = [];
  let nextId = 1;

  return {
    rows,
    prepare(query: string) {
      let boundArgs: unknown[] = [];
      return {
        bind(...args: unknown[]) {
          boundArgs = args;
          return this;
        },
        async run() {
          if (query.trim().startsWith('INSERT INTO feedback')) {
            const row: MockFeedbackRow = {
              id: nextId++,
              received_at: String(boundArgs[0]),
              kind: String(boundArgs[1]),
              video_id: String(boundArgs[2]),
              title: String(boundArgs[3]),
              channel_handle: boundArgs[4] ? String(boundArgs[4]) : null,
              matched_rule_ids: String(boundArgs[5]),
              score: Number(boundArgs[6]),
              strictness: String(boundArgs[7]),
              patterns_revision: Number(boundArgs[8]),
              extension_version: String(boundArgs[9]),
              browser: String(boundArgs[10]),
            };
            rows.push(row);
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true };
        },
        async all() {
          return { results: rows, success: true };
        },
        async first() {
          return rows[0] || null;
        },
      };
    },
  };
}

function createMockRateLimiter(outcome = { success: true }) {
  const calls: { key: string }[] = [];
  return {
    calls,
    limit: vi.fn(async (options: { key: string }) => {
      calls.push(options);
      return outcome;
    }),
  };
}

describe('Worker endpoints & acceptance criteria', () => {
  // Acceptance criterion: `GET /patterns.json` returns the committed file with CORS and cache headers
  it('GET /patterns.json returns the committed file with CORS and cache headers', async () => {
    const mockDB = createMockD1();
    const env: Env = { DB: mockDB as unknown as D1Database };

    const req = new Request('https://algo-cleanse.worker/patterns.json', {
      method: 'GET',
    });
    const res = await worker.fetch(req, env);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');

    const json = await res.json();
    const committedFile = JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, '../../patterns/patterns.json'),
        'utf8',
      ),
    );
    expect(json).toEqual(committedFile);
  });

  // Acceptance criterion: Valid feedback -> 204 + row with all fields; missing/unknown `kind`, non-string title, >4 KB each -> 400/413 and no insert
  describe('Valid feedback -> 204 + row with all fields; missing/unknown `kind`, non-string title, >4 KB each -> 400/413 and no insert', () => {
    const validPayload = {
      kind: 'false_positive',
      videoId: 'abc123xyz',
      title: 'Shocking Discovery Video',
      channelHandle: '@channel',
      matchedRuleIds: ['gone-wrong', 'caps-title'],
      score: 4,
      strictness: 'balanced',
      patternsRevision: 3,
      extensionVersion: '0.1.0',
      browser: 'chrome',
    };

    it('Valid feedback -> 204 + row with all fields inserted into D1', async () => {
      const mockDB = createMockD1();
      const env: Env = { DB: mockDB as unknown as D1Database };

      const req = new Request('https://algo-cleanse.worker/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'cf-connecting-ip': '203.0.113.195',
        },
        body: JSON.stringify(validPayload),
      });

      const res = await worker.fetch(req, env);
      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');

      expect(mockDB.rows.length).toBe(1);
      const row = mockDB.rows[0];
      expect(row.id).toBe(1);
      expect(row.kind).toBe('false_positive');
      expect(row.video_id).toBe('abc123xyz');
      expect(row.title).toBe('Shocking Discovery Video');
      expect(row.channel_handle).toBe('@channel');
      expect(JSON.parse(row.matched_rule_ids)).toEqual([
        'gone-wrong',
        'caps-title',
      ]);
      expect(row.score).toBe(4);
      expect(row.strictness).toBe('balanced');
      expect(row.patterns_revision).toBe(3);
      expect(row.extension_version).toBe('0.1.0');
      expect(row.browser).toBe('chrome');
      expect(new Date(row.received_at).getTime()).toBeGreaterThan(0);
    });

    it('Valid feedback with null channelHandle -> 204 + row with null channel_handle', async () => {
      const mockDB = createMockD1();
      const env: Env = { DB: mockDB as unknown as D1Database };

      const payload = { ...validPayload, kind: 'missed', channelHandle: null };
      const req = new Request('https://algo-cleanse.worker/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await worker.fetch(req, env);
      expect(res.status).toBe(204);
      expect(mockDB.rows.length).toBe(1);
      expect(mockDB.rows[0].kind).toBe('missed');
      expect(mockDB.rows[0].channel_handle).toBeNull();
    });

    it('Missing kind -> 400 and no insert', async () => {
      const mockDB = createMockD1();
      const env: Env = { DB: mockDB as unknown as D1Database };

      const missingKind = { ...validPayload } as Record<string, unknown>;
      delete missingKind.kind;
      const req = new Request('https://algo-cleanse.worker/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(missingKind),
      });

      const res = await worker.fetch(req, env);
      expect(res.status).toBe(400);
      expect(mockDB.rows.length).toBe(0);
    });

    it('Unknown kind -> 400 and no insert', async () => {
      const mockDB = createMockD1();
      const env: Env = { DB: mockDB as unknown as D1Database };

      const unknownKind = { ...validPayload, kind: 'invalid_kind' };
      const req = new Request('https://algo-cleanse.worker/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(unknownKind),
      });

      const res = await worker.fetch(req, env);
      expect(res.status).toBe(400);
      expect(mockDB.rows.length).toBe(0);
    });

    it('Non-string title -> 400 and no insert', async () => {
      const mockDB = createMockD1();
      const env: Env = { DB: mockDB as unknown as D1Database };

      const nonStringTitle = { ...validPayload, title: 12345 };
      const req = new Request('https://algo-cleanse.worker/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nonStringTitle),
      });

      const res = await worker.fetch(req, env);
      expect(res.status).toBe(400);
      expect(mockDB.rows.length).toBe(0);
    });

    it('>4 KB payload -> 413 and no insert', async () => {
      const mockDB = createMockD1();
      const env: Env = { DB: mockDB as unknown as D1Database };

      // Create payload exceeding 4 KB (4096 bytes)
      const oversizedPayload = {
        ...validPayload,
        title: 'A'.repeat(4500),
      };
      const body = JSON.stringify(oversizedPayload);
      expect(body.length).toBeGreaterThan(4096);

      const req = new Request('https://algo-cleanse.worker/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(body.length),
        },
        body,
      });

      const res = await worker.fetch(req, env);
      expect(res.status).toBe(413);
      expect(mockDB.rows.length).toBe(0);
    });

    it('Invalid JSON -> 400 and no insert', async () => {
      const mockDB = createMockD1();
      const env: Env = { DB: mockDB as unknown as D1Database };

      const req = new Request('https://algo-cleanse.worker/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ not valid json',
      });

      const res = await worker.fetch(req, env);
      expect(res.status).toBe(400);
      expect(mockDB.rows.length).toBe(0);
    });
  });

  // Acceptance criterion: `OPTIONS /feedback` returns CORS headers
  it('OPTIONS /feedback returns CORS headers', async () => {
    const mockDB = createMockD1();
    const env: Env = { DB: mockDB as unknown as D1Database };

    const req = new Request('https://algo-cleanse.worker/feedback', {
      method: 'OPTIONS',
    });
    const res = await worker.fetch(req, env);

    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
    expect(res.headers.get('access-control-allow-headers')).toContain(
      'Content-Type',
    );
  });

  // Acceptance criterion: No column or log stores client IP
  it('No column or log stores client IP', async () => {
    const mockDB = createMockD1();
    const rateLimiter = createMockRateLimiter();
    const env: Env = {
      DB: mockDB as unknown as D1Database,
      RATE_LIMITER: rateLimiter as unknown as RateLimit,
    };

    const clientIp = '198.51.100.42';
    const logSpy = vi.spyOn(console, 'log');
    const infoSpy = vi.spyOn(console, 'info');
    const warnSpy = vi.spyOn(console, 'warn');
    const errorSpy = vi.spyOn(console, 'error');

    const req = new Request('https://algo-cleanse.worker/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cf-connecting-ip': clientIp,
      },
      body: JSON.stringify({
        kind: 'false_positive',
        videoId: 'v123',
        title: 'Title',
        channelHandle: '@test',
        matchedRuleIds: [],
        score: 2,
        strictness: 'gentle',
        patternsRevision: 1,
        extensionVersion: '0.1.0',
        browser: 'firefox',
      }),
    });

    const res = await worker.fetch(req, env);
    expect(res.status).toBe(204);

    // Verify rate limit binding received the IP as key
    expect(rateLimiter.calls).toEqual([{ key: clientIp }]);

    // Verify inserted D1 row has NO IP column and does not contain the IP
    expect(mockDB.rows.length).toBe(1);
    const row = mockDB.rows[0];
    const rowString = JSON.stringify(row);
    expect(rowString).not.toContain(clientIp);
    const untypedRow = row as unknown as Record<string, unknown>;
    expect(untypedRow.ip).toBeUndefined();
    expect(untypedRow.client_ip).toBeUndefined();

    // Verify migration SQL schema has NO IP column
    const migrationSql = fs.readFileSync(
      path.resolve(__dirname, '../migrations/0001_feedback.sql'),
      'utf8',
    );
    expect(migrationSql.toLowerCase()).not.toContain('ip');

    // Verify no log output captured the IP
    const allLogs = [
      ...logSpy.mock.calls,
      ...infoSpy.mock.calls,
      ...warnSpy.mock.calls,
      ...errorSpy.mock.calls,
    ]
      .flat()
      .join(' ');
    expect(allLogs).not.toContain(clientIp);

    logSpy.mockRestore();
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  // Acceptance criterion: Unknown path -> 404
  it('Unknown path -> 404', async () => {
    const mockDB = createMockD1();
    const env: Env = { DB: mockDB as unknown as D1Database };

    const req = new Request('https://algo-cleanse.worker/unknown-route', {
      method: 'GET',
    });
    const res = await worker.fetch(req, env);

    expect(res.status).toBe(404);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  // Rate limiting: 429 over 30 req/min per IP via Cloudflare rate limiting binding
  it('429 over 30 req/min per IP via Cloudflare rate limiting binding', async () => {
    const mockDB = createMockD1();
    const rateLimiter = createMockRateLimiter({ success: false });
    const env: Env = {
      DB: mockDB as unknown as D1Database,
      RATE_LIMITER: rateLimiter as unknown as RateLimit,
    };

    const req = new Request('https://algo-cleanse.worker/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cf-connecting-ip': '203.0.113.1',
      },
      body: JSON.stringify({
        kind: 'missed',
        videoId: 'vid1',
        title: 'Title',
        matchedRuleIds: [],
        score: 3,
        strictness: 'balanced',
        patternsRevision: 1,
        extensionVersion: '0.1.0',
        browser: 'chrome',
      }),
    });

    const res = await worker.fetch(req, env);
    expect(res.status).toBe(429);
    expect(mockDB.rows.length).toBe(0);
  });

  // GET /privacy: docs/privacy.md as simple HTML (placeholder until store-prep)
  it('GET /privacy returns docs/privacy.md as simple HTML', async () => {
    const mockDB = createMockD1();
    const env: Env = { DB: mockDB as unknown as D1Database };

    const req = new Request('https://algo-cleanse.worker/privacy', {
      method: 'GET',
    });
    const res = await worker.fetch(req, env);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const text = await res.text();
    expect(text).toContain('<!DOCTYPE html>');
    expect(text).toContain('Privacy Policy');
    expect(text).toContain('AlgoCleanse');
  });
});
