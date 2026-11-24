import { describe, expect, it } from 'vitest';
import type { UserManifest } from 'wxt';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import wxtConfig from '../wxt.config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const chromeManifestPath = path.resolve(
  rootDir,
  '.output/chrome-mv3/manifest.json',
);
const firefoxManifestPath = path.resolve(
  rootDir,
  '.output/firefox-mv3/manifest.json',
);

function ensureBuiltFirefoxManifest() {
  if (!fs.existsSync(firefoxManifestPath)) {
    execSync('npm run build:firefox', { cwd: rootDir, stdio: 'pipe' });
  }
  return JSON.parse(fs.readFileSync(firefoxManifestPath, 'utf8'));
}

function ensureBuiltChromeManifest() {
  if (!fs.existsSync(chromeManifestPath)) {
    execSync('npm run build', { cwd: rootDir, stdio: 'pipe' });
  }
  return JSON.parse(fs.readFileSync(chromeManifestPath, 'utf8'));
}

describe('manifest configuration', () => {
  // Acceptance criterion: Chrome manifest permissions exactly storage, alarms
  it('configures manifest permissions exactly to storage and alarms', () => {
    const manifest = (
      typeof wxtConfig.manifest === 'function' ? null : wxtConfig.manifest
    ) as UserManifest | null;
    expect(manifest?.permissions).toEqual(['storage', 'alarms']);

    const builtChromeManifest = ensureBuiltChromeManifest();
    expect(builtChromeManifest.permissions).toEqual(['storage', 'alarms']);
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

  // Acceptance criterion: Built Firefox manifest contains data_collection_permissions with feedback data optional (test reads the built manifest)
  it('Built Firefox manifest contains data_collection_permissions with feedback data optional (test reads the built manifest)', () => {
    const builtFirefoxManifest = ensureBuiltFirefoxManifest();
    const gecko = builtFirefoxManifest.browser_specific_settings?.gecko;
    expect(gecko).toBeDefined();
    expect(gecko.data_collection_permissions).toBeDefined();

    const dataCollection = gecko.data_collection_permissions;
    // Required list declares none (no required data collection)
    expect(dataCollection.required).toEqual(['none']);
    // Feedback data is declared optional
    expect(Array.isArray(dataCollection.optional)).toBe(true);
    expect(dataCollection.optional).toContain('technicalAndInteraction');
  });

  // Acceptance criterion: Icons in all four sizes referenced by the manifest
  it('Icons in all four sizes referenced by the manifest', () => {
    const manifest = (
      typeof wxtConfig.manifest === 'function' ? null : wxtConfig.manifest
    ) as UserManifest | null;
    const icons = manifest?.icons as Record<string, string> | undefined;

    expect(icons).toBeDefined();
    const requiredSizes = ['16', '32', '48', '128'];
    for (const size of requiredSizes) {
      expect(icons?.[size]).toBeDefined();
    }

    // Verify built manifests also reference all four icon sizes and the files exist
    const builtChromeManifest = ensureBuiltChromeManifest();
    expect(builtChromeManifest.icons).toBeDefined();
    for (const size of requiredSizes) {
      expect(builtChromeManifest.icons[size]).toBeDefined();
      const relativeIconPath = builtChromeManifest.icons[size].replace(
        /^\//,
        '',
      );
      const iconPath = path.resolve(
        rootDir,
        '.output/chrome-mv3',
        relativeIconPath,
      );
      expect(fs.existsSync(iconPath)).toBe(true);
    }

    const builtFirefoxManifest = ensureBuiltFirefoxManifest();
    expect(builtFirefoxManifest.icons).toBeDefined();
    for (const size of requiredSizes) {
      expect(builtFirefoxManifest.icons[size]).toBeDefined();
      const relativeIconPath = builtFirefoxManifest.icons[size].replace(
        /^\//,
        '',
      );
      const iconPath = path.resolve(
        rootDir,
        '.output/firefox-mv3',
        relativeIconPath,
      );
      expect(fs.existsSync(iconPath)).toBe(true);
    }
  });
});
