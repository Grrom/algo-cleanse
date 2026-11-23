import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from 'wxt/utils/storage';
import {
  initPatternUpdater,
  PATTERN_REFRESH_ALARM,
  PATTERN_REFRESH_PERIOD_MINUTES,
  updatePatterns,
} from '../../src/background/pattern-updater';
import {
  loadPatterns,
  type RemotePatternsRecord,
} from '../../src/core/active-patterns';
import { BUNDLED_PATTERNS } from '../../src/core/bundled-patterns';
import { ENGINE_VERSION } from '../../src/core/engine-version';
import type { Patterns } from '../../src/core/patterns-schema';
import patternsJson from '../../patterns/patterns.json';

describe('pattern-updater', () => {
  const TEST_API_BASE = 'https://api.algocleanse.test';

  beforeEach(async () => {
    fakeBrowser.reset();
    await storage.clear('local');
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  // Acceptance criterion: Alarm patterns-refresh registered with 720-minute period
  describe('Alarm patterns-refresh registered with 720-minute period', () => {
    it('registers alarm patterns-refresh with 720-minute period on initialization', async () => {
      await initPatternUpdater();

      const alarm = await fakeBrowser.alarms.get(PATTERN_REFRESH_ALARM);
      expect(alarm).toBeDefined();
      expect(alarm?.name).toBe('patterns-refresh');
      expect(alarm?.periodInMinutes).toBe(720);
      expect(PATTERN_REFRESH_PERIOD_MINUTES).toBe(720);
    });

    it('does not recreate alarm on repeated initialization when already present', async () => {
      vi.useFakeTimers();
      const t0 = new Date('2026-11-23T12:00:00Z').getTime();
      vi.setSystemTime(t0);

      await initPatternUpdater();

      const initialAlarm = await fakeBrowser.alarms.get(PATTERN_REFRESH_ALARM);
      expect(initialAlarm).toBeDefined();
      expect(initialAlarm?.periodInMinutes).toBe(720);
      const scheduledTime = initialAlarm?.scheduledTime;

      // Advance clock by 2 hours
      vi.setSystemTime(t0 + 2 * 60 * 60 * 1000);

      // Re-initialize (e.g. on background service worker wake)
      await initPatternUpdater();

      const recheckedAlarm = await fakeBrowser.alarms.get(
        PATTERN_REFRESH_ALARM,
      );
      expect(recheckedAlarm).toBeDefined();
      expect(recheckedAlarm?.scheduledTime).toBe(scheduledTime);
      expect(recheckedAlarm?.periodInMinutes).toBe(720);
    });

    it('triggers updatePatterns on alarm patterns-refresh event', async () => {
      await initPatternUpdater();

      const higher = JSON.parse(JSON.stringify(patternsJson)) as Patterns;
      higher.revision = BUNDLED_PATTERNS.revision + 1;

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(higher), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      vi.stubEnv('WXT_API_BASE_URL', TEST_API_BASE);

      // Trigger matching alarm
      await fakeBrowser.alarms.onAlarm.trigger({
        name: PATTERN_REFRESH_ALARM,
        scheduledTime: Date.now(),
        persistAcrossSessions: false,
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        `${TEST_API_BASE}/patterns.json`,
        expect.objectContaining({ cache: 'no-cache' }),
      );

      // Verify unrelated alarm name does not trigger fetch
      fetchSpy.mockClear();
      await fakeBrowser.alarms.onAlarm.trigger({
        name: 'other-alarm',
        scheduledTime: Date.now(),
        persistAcrossSessions: false,
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('triggers updatePatterns on runtime.onInstalled event', async () => {
      await initPatternUpdater();

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(patternsJson), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      vi.stubEnv('WXT_API_BASE_URL', TEST_API_BASE);

      await fakeBrowser.runtime.onInstalled.trigger({
        reason: 'install',
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        `${TEST_API_BASE}/patterns.json`,
        expect.objectContaining({ cache: 'no-cache' }),
      );
    });

    it('triggers updatePatterns on runtime.onStartup event', async () => {
      await initPatternUpdater();

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(patternsJson), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      vi.stubEnv('WXT_API_BASE_URL', TEST_API_BASE);

      await fakeBrowser.runtime.onStartup.trigger();

      expect(fetchSpy).toHaveBeenCalledWith(
        `${TEST_API_BASE}/patterns.json`,
        expect.objectContaining({ cache: 'no-cache' }),
      );
    });
  });

  // Acceptance criterion: Empty WXT_API_BASE_URL -> no fetch
  describe('Empty WXT_API_BASE_URL -> no fetch', () => {
    it('does not call fetch when WXT_API_BASE_URL is not set', async () => {
      vi.unstubAllEnvs();
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const result = await updatePatterns();
      expect(result).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();

      const stored = await storage.getItem('local:remotePatterns');
      expect(stored).toBeNull();
    });

    it('does not call fetch when WXT_API_BASE_URL is empty string or whitespace', async () => {
      vi.stubEnv('WXT_API_BASE_URL', '   ');
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const result = await updatePatterns('');
      expect(result).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();

      const result2 = await updatePatterns();
      expect(result2).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();

      const stored = await storage.getItem('local:remotePatterns');
      expect(stored).toBeNull();
    });
  });

  // Acceptance criterion: Mocked fetch: valid newer patterns stored; invalid JSON, schema-invalid, lower/equal revision, minEngineVersion > ENGINE_VERSION, HTTP 500, timeout leave storage unchanged
  describe('Mocked fetch: valid newer patterns stored; invalid JSON, schema-invalid, lower/equal revision, minEngineVersion > ENGINE_VERSION, HTTP 500, timeout leave storage unchanged', () => {
    it('stores valid newer patterns in storage.local.remotePatterns with fetchedAt', async () => {
      const newer = JSON.parse(JSON.stringify(patternsJson)) as Patterns;
      newer.revision = BUNDLED_PATTERNS.revision + 1;
      newer.version = '2026.12.01';

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(newer), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const beforeTime = new Date().toISOString();
      const updated = await updatePatterns(TEST_API_BASE);
      expect(updated).toBe(true);

      const stored = await storage.getItem<RemotePatternsRecord>(
        'local:remotePatterns',
      );
      expect(stored).not.toBeNull();
      expect(stored?.patterns.revision).toBe(newer.revision);
      expect(stored?.patterns.version).toBe('2026.12.01');
      expect(stored?.fetchedAt).toBeDefined();
      expect(new Date(stored!.fetchedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(beforeTime).getTime(),
      );

      // loadPatterns() should now return the stored newer patterns
      const active = await loadPatterns();
      expect(active.revision).toBe(newer.revision);
    });

    it('leaves storage unchanged on invalid JSON', async () => {
      // Seed storage with an existing valid pattern
      const existing = JSON.parse(JSON.stringify(patternsJson)) as Patterns;
      existing.revision = BUNDLED_PATTERNS.revision + 2;
      const initialRecord: RemotePatternsRecord = {
        patterns: existing,
        fetchedAt: '2026-11-23T12:00:00.000Z',
      };
      await storage.setItem('local:remotePatterns', initialRecord);

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('not json at all {{{', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        }),
      );

      const updated = await updatePatterns(TEST_API_BASE);
      expect(updated).toBe(false);

      const stored = await storage.getItem<RemotePatternsRecord>(
        'local:remotePatterns',
      );
      expect(stored).toEqual(initialRecord);
    });

    it('leaves storage unchanged on schema-invalid patterns', async () => {
      const existing = JSON.parse(JSON.stringify(patternsJson)) as Patterns;
      existing.revision = BUNDLED_PATTERNS.revision + 2;
      const initialRecord: RemotePatternsRecord = {
        patterns: existing,
        fetchedAt: '2026-11-23T12:00:00.000Z',
      };
      await storage.setItem('local:remotePatterns', initialRecord);

      // Response has higher revision but invalid schema (missing categories and rules)
      const invalidSchema = {
        revision: BUNDLED_PATTERNS.revision + 5,
        version: '2026.12.01',
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(invalidSchema), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const updated = await updatePatterns(TEST_API_BASE);
      expect(updated).toBe(false);

      const stored = await storage.getItem<RemotePatternsRecord>(
        'local:remotePatterns',
      );
      expect(stored).toEqual(initialRecord);
    });

    it('leaves storage unchanged on lower revision', async () => {
      const existing = JSON.parse(JSON.stringify(patternsJson)) as Patterns;
      existing.revision = BUNDLED_PATTERNS.revision + 5;
      const initialRecord: RemotePatternsRecord = {
        patterns: existing,
        fetchedAt: '2026-11-23T12:00:00.000Z',
      };
      await storage.setItem('local:remotePatterns', initialRecord);

      const lower = JSON.parse(JSON.stringify(patternsJson)) as Patterns;
      lower.revision = BUNDLED_PATTERNS.revision + 3; // lower than stored revision + 5

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(lower), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const updated = await updatePatterns(TEST_API_BASE);
      expect(updated).toBe(false);

      const stored = await storage.getItem<RemotePatternsRecord>(
        'local:remotePatterns',
      );
      expect(stored).toEqual(initialRecord);
    });

    it('leaves storage unchanged on equal revision', async () => {
      const existing = JSON.parse(JSON.stringify(patternsJson)) as Patterns;
      existing.revision = BUNDLED_PATTERNS.revision + 2;
      const initialRecord: RemotePatternsRecord = {
        patterns: existing,
        fetchedAt: '2026-11-23T12:00:00.000Z',
      };
      await storage.setItem('local:remotePatterns', initialRecord);

      const equal = JSON.parse(JSON.stringify(patternsJson)) as Patterns;
      equal.revision = BUNDLED_PATTERNS.revision + 2; // equal to stored

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(equal), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const updated = await updatePatterns(TEST_API_BASE);
      expect(updated).toBe(false);

      const stored = await storage.getItem<RemotePatternsRecord>(
        'local:remotePatterns',
      );
      expect(stored).toEqual(initialRecord);
    });

    it('leaves storage unchanged when revision is equal to bundled and storage was empty', async () => {
      const equalBundled = JSON.parse(JSON.stringify(patternsJson)) as Patterns;
      equalBundled.revision = BUNDLED_PATTERNS.revision;

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(equalBundled), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const updated = await updatePatterns(TEST_API_BASE);
      expect(updated).toBe(false);

      const stored = await storage.getItem('local:remotePatterns');
      expect(stored).toBeNull();
    });

    it('leaves storage unchanged on minEngineVersion > ENGINE_VERSION', async () => {
      const existing = JSON.parse(JSON.stringify(patternsJson)) as Patterns;
      existing.revision = BUNDLED_PATTERNS.revision + 2;
      const initialRecord: RemotePatternsRecord = {
        patterns: existing,
        fetchedAt: '2026-11-23T12:00:00.000Z',
      };
      await storage.setItem('local:remotePatterns', initialRecord);

      const higherEngine = JSON.parse(JSON.stringify(patternsJson)) as Patterns;
      higherEngine.revision = BUNDLED_PATTERNS.revision + 10;
      higherEngine.minEngineVersion = ENGINE_VERSION + 1; // unsupported engine

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(higherEngine), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const updated = await updatePatterns(TEST_API_BASE);
      expect(updated).toBe(false);

      const stored = await storage.getItem<RemotePatternsRecord>(
        'local:remotePatterns',
      );
      expect(stored).toEqual(initialRecord);
    });

    it('leaves storage unchanged on HTTP 500', async () => {
      const existing = JSON.parse(JSON.stringify(patternsJson)) as Patterns;
      existing.revision = BUNDLED_PATTERNS.revision + 2;
      const initialRecord: RemotePatternsRecord = {
        patterns: existing,
        fetchedAt: '2026-11-23T12:00:00.000Z',
      };
      await storage.setItem('local:remotePatterns', initialRecord);

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Internal Server Error', {
          status: 500,
          statusText: 'Internal Server Error',
        }),
      );

      const updated = await updatePatterns(TEST_API_BASE);
      expect(updated).toBe(false);

      const stored = await storage.getItem<RemotePatternsRecord>(
        'local:remotePatterns',
      );
      expect(stored).toEqual(initialRecord);
    });

    it('leaves storage unchanged on timeout', async () => {
      vi.useFakeTimers();

      const existing = JSON.parse(JSON.stringify(patternsJson)) as Patterns;
      existing.revision = BUNDLED_PATTERNS.revision + 2;
      const initialRecord: RemotePatternsRecord = {
        patterns: existing,
        fetchedAt: '2026-11-23T12:00:00.000Z',
      };
      await storage.setItem('local:remotePatterns', initialRecord);

      vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(
              init.signal?.reason ??
                new DOMException('The operation was aborted.', 'AbortError'),
            );
          });
        });
      });

      let settled = false;
      const p = updatePatterns(TEST_API_BASE).then((res) => {
        settled = true;
        return res;
      });

      // Promise is still pending at 9,999 ms
      await vi.advanceTimersByTimeAsync(9_999);
      expect(settled).toBe(false);

      // Times out after 10,000 ms
      await vi.advanceTimersByTimeAsync(1);
      const updated = await p;
      expect(updated).toBe(false);

      const stored = await storage.getItem<RemotePatternsRecord>(
        'local:remotePatterns',
      );
      expect(stored).toEqual(initialRecord);
    });
  });
});
