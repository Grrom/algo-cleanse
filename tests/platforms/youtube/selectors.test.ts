import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SELECTORS,
  SHORTS_SELECTORS,
  TILE_MENU_BUTTON,
  TILE_RENDERERS,
  TILE_SELECTOR,
  TILE_SELECTORS,
} from '../../../src/platforms/youtube/selectors';

describe('selectors', () => {
  it('covers all required current renderers', () => {
    expect(SELECTORS).toBeDefined();
    expect(SELECTORS.tile).toBe(TILE_SELECTOR);
    expect(SELECTORS.shorts).toBe(SHORTS_SELECTORS.join(', '));
    const requiredRenderers = [
      'ytd-rich-item-renderer',
      'yt-lockup-view-model',
      'ytd-video-renderer',
      'ytd-compact-video-renderer',
      'ytd-grid-video-renderer',
    ];

    for (const renderer of requiredRenderers) {
      expect(TILE_RENDERERS).toContain(renderer);
      expect(TILE_SELECTORS).toContain(renderer);
    }
  });

  it('exports SHORTS_SELECTORS covering all shorts containers and guide entry', () => {
    expect(SHORTS_SELECTORS).toBeDefined();
    expect(SHORTS_SELECTORS).toContain('ytd-reel-shelf-renderer');
    expect(SHORTS_SELECTORS).toContain('ytd-rich-shelf-renderer[is-shorts]');
    expect(SHORTS_SELECTORS).toContain('ytm-shorts-lockup-view-model');

    const hasGuideEntry = SHORTS_SELECTORS.some((sel) => sel.includes('guide'));
    expect(hasGuideEntry).toBe(true);
  });

  it('exports TILE_MENU_BUTTON matching the action menu button', () => {
    expect(TILE_MENU_BUTTON).toBeDefined();
    expect(typeof TILE_MENU_BUTTON).toBe('string');
    expect(TILE_MENU_BUTTON).toContain('button');
    expect(TILE_MENU_BUTTON).toContain('aria-label');
  });

  // No selector string outside src/platforms/youtube/selectors.ts
  it('No selector string outside src/platforms/youtube/selectors.ts', () => {
    const youtubeDir = resolve(__dirname, '../../../src/platforms/youtube');
    const files = readdirSync(youtubeDir).filter(
      (file) => file.endsWith('.ts') && file !== 'selectors.ts',
    );

    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = readFileSync(resolve(youtubeDir, file), 'utf-8');

      // Check querySelector / querySelectorAll / closest / matches calls
      // None of them should be called with raw string literals like querySelector('div') or querySelector("...")
      const domCallWithLiteralRegex =
        /\b(querySelector|querySelectorAll|closest|matches)\s*\(\s*['"`]/g;
      const matches = content.match(domCallWithLiteralRegex);
      expect(
        matches,
        `Found DOM selector string literal call in ${file}: ${JSON.stringify(matches)}`,
      ).toBeNull();

      // Check that known selector fragments do not appear in string literals outside selectors.ts
      const forbiddenFragments = [
        'ytd-rich-item-renderer',
        'yt-lockup-view-model',
        'ytd-video-renderer',
        'ytd-compact-video-renderer',
        'ytd-grid-video-renderer',
        'ytd-reel-shelf-renderer',
        'ytd-rich-shelf-renderer',
        'ytm-shorts-lockup-view-model',
        '#video-title',
        '#channel-name',
        'ytd-thumbnail-overlay',
      ];

      for (const fragment of forbiddenFragments) {
        expect(
          content.includes(fragment),
          `File ${file} contains raw selector fragment "${fragment}" outside selectors.ts`,
        ).toBe(false);
      }
    }
  });
});
