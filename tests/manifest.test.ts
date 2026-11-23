import { describe, expect, it } from 'vitest';
import type { UserManifest } from 'wxt';
import wxtConfig from '../wxt.config';

describe('manifest configuration', () => {
  // Manifest permissions are exactly storage and alarms; content script matches only *://www.youtube.com/*; Firefox gecko id is algo-cleanse@grrom
  it('configures manifest permissions exactly to storage and alarms', () => {
    const manifest = (
      typeof wxtConfig.manifest === 'function' ? null : wxtConfig.manifest
    ) as UserManifest | null;
    expect(manifest?.permissions).toEqual(['storage', 'alarms']);
  });

  it('configures Firefox gecko id to algo-cleanse@grrom', () => {
    const manifest = (
      typeof wxtConfig.manifest === 'function' ? null : wxtConfig.manifest
    ) as UserManifest | null;
    expect(
      (manifest?.browser_specific_settings as { gecko?: { id?: string } })
        ?.gecko?.id,
    ).toBe('algo-cleanse@grrom');
  });
});
