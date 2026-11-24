import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import * as shortsModule from '../src/platforms/youtube/shorts';

describe('entrypoints/content', () => {
  it('wires up initShorts for youtube.com', async () => {
    const contentCode = readFileSync(
      resolve(__dirname, '../entrypoints/content.ts'),
      'utf-8',
    );
    expect(contentCode).toContain('initShorts');
    expect(contentCode).toContain('*://www.youtube.com/*');

    const spy = vi.spyOn(shortsModule, 'initShorts').mockReturnValue(() => {});
    const defineMock = vi.fn((def) => def);
    (globalThis as Record<string, unknown>).defineContentScript = defineMock;

    const mod = await import('../entrypoints/content');
    const contentScript = mod.default;
    expect(contentScript.matches).toContain('*://www.youtube.com/*');

    contentScript.main({} as never);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
