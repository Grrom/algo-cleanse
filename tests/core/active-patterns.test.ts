import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from 'wxt/utils/storage';
import {
  filterActiveCategories,
  getActiveCategoryIds,
  loadPatterns,
  watchPatterns,
  type RemotePatternsRecord,
} from '../../src/core/active-patterns';
import { BUNDLED_PATTERNS } from '../../src/core/bundled-patterns';
import patternsJson from '../../patterns/patterns.json';
import type { Patterns } from '../../src/core/patterns-schema';

describe('active-patterns', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await storage.clear('local');
  });

  // Acceptance criterion: loadPatterns() returns bundled when storage empty/corrupt and stored when its revision is higher
  describe('loadPatterns() returns bundled when storage empty/corrupt and stored when its revision is higher', () => {
    it('returns bundled when storage is empty', async () => {
      const patterns = await loadPatterns();
      expect(patterns).toEqual(BUNDLED_PATTERNS);
      expect(patterns.revision).toBe(BUNDLED_PATTERNS.revision);
    });

    it('returns bundled when storage contains null or non-object', async () => {
      await storage.setItem('local:remotePatterns', null);
      expect(await loadPatterns()).toEqual(BUNDLED_PATTERNS);

      await fakeBrowser.storage.local.set({
        remotePatterns: 'corrupted string',
      });
      expect(await loadPatterns()).toEqual(BUNDLED_PATTERNS);

      await fakeBrowser.storage.local.set({ remotePatterns: 12345 });
      expect(await loadPatterns()).toEqual(BUNDLED_PATTERNS);
    });

    it('returns bundled when storage is corrupt with invalid schema', async () => {
      await storage.setItem('local:remotePatterns', {
        patterns: {
          revision: 999,
          version: 'broken',
          // missing required fields: schemaVersion, thresholds, categories, rules
        },
        fetchedAt: new Date().toISOString(),
      } as unknown as RemotePatternsRecord);

      const patterns = await loadPatterns();
      expect(patterns).toEqual(BUNDLED_PATTERNS);
    });

    it('returns bundled when stored patterns have minEngineVersion > ENGINE_VERSION', async () => {
      const corrupt = JSON.parse(JSON.stringify(patternsJson)) as Patterns;
      corrupt.revision = BUNDLED_PATTERNS.revision + 5;
      corrupt.minEngineVersion = 9999;

      await storage.setItem('local:remotePatterns', {
        patterns: corrupt,
        fetchedAt: new Date().toISOString(),
      });

      const patterns = await loadPatterns();
      expect(patterns).toEqual(BUNDLED_PATTERNS);
    });

    it('returns bundled when stored revision is lower than or equal to bundled', async () => {
      const lower = JSON.parse(JSON.stringify(patternsJson)) as Patterns;
      lower.revision = BUNDLED_PATTERNS.revision; // equal

      await storage.setItem('local:remotePatterns', {
        patterns: lower,
        fetchedAt: new Date().toISOString(),
      });

      expect(await loadPatterns()).toEqual(BUNDLED_PATTERNS);

      const evenLower = JSON.parse(JSON.stringify(patternsJson)) as Patterns;
      evenLower.revision = Math.max(1, BUNDLED_PATTERNS.revision - 1);

      await storage.setItem('local:remotePatterns', {
        patterns: evenLower,
        fetchedAt: new Date().toISOString(),
      });

      expect(await loadPatterns()).toEqual(BUNDLED_PATTERNS);
    });

    it('returns stored when its revision is higher', async () => {
      const higher = JSON.parse(JSON.stringify(patternsJson)) as Patterns;
      higher.revision = BUNDLED_PATTERNS.revision + 1;
      higher.version = '2026.12.01';

      await storage.setItem('local:remotePatterns', {
        patterns: higher,
        fetchedAt: new Date().toISOString(),
      });

      const patterns = await loadPatterns();
      expect(patterns.revision).toBe(higher.revision);
      expect(patterns.version).toBe('2026.12.01');
      expect(patterns).toEqual(higher);
    });
  });

  describe('watchPatterns(cb)', () => {
    it('fires callback when remotePatterns changes in storage', async () => {
      const higher = JSON.parse(JSON.stringify(patternsJson)) as Patterns;
      higher.revision = BUNDLED_PATTERNS.revision + 2;

      const received: Patterns[] = [];
      const unwatch = watchPatterns((patterns) => {
        received.push(patterns);
      });

      await storage.setItem('local:remotePatterns', {
        patterns: higher,
        fetchedAt: new Date().toISOString(),
      });

      expect(received.length).toBe(1);
      expect(received[0]?.revision).toBe(higher.revision);

      unwatch();

      // After unwatch, updating storage should not fire callback
      const higherStill = JSON.parse(JSON.stringify(patternsJson)) as Patterns;
      higherStill.revision = BUNDLED_PATTERNS.revision + 3;

      await storage.setItem('local:remotePatterns', {
        patterns: higherStill,
        fetchedAt: new Date().toISOString(),
      });

      expect(received.length).toBe(1);
    });
  });

  describe('Category ids in settings.autoCategories that no longer exist in the active patterns are simply ignored', () => {
    it('filters out category ids not in active patterns without rewriting settings', () => {
      const patterns = BUNDLED_PATTERNS;
      const activeIds = getActiveCategoryIds(patterns);
      expect(activeIds.has('bait-phrase')).toBe(true);
      expect(activeIds.has('shouting')).toBe(true);

      const userCategories = [
        'bait-phrase',
        'obsolete-category-1',
        'shouting',
        'deleted-category-2',
      ];
      const filtered = filterActiveCategories(patterns, userCategories);

      expect(filtered).toEqual(['bait-phrase', 'shouting']);
      // Original userCategories untouched
      expect(userCategories).toEqual([
        'bait-phrase',
        'obsolete-category-1',
        'shouting',
        'deleted-category-2',
      ]);
    });
  });
});
