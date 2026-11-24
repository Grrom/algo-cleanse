import '../src/platforms/youtube/collapse.css';
import { loadPatterns, watchPatterns } from '../src/core/active-patterns';
import type { Patterns } from '../src/core/patterns-schema';
import { getSettings, watchSettings } from '../src/core/settings';
import type { Settings } from '../src/core/types';
import {
  evaluateAndProcessTile,
  reEvaluateAllTiles,
} from '../src/platforms/youtube/collapse';
import { startScanner } from '../src/platforms/youtube/scanner';

/**
 * Initializes AlgoCleanse content script logic.
 */
export async function initContent(options?: {
  settings?: Settings;
  patterns?: Patterns;
}): Promise<() => void> {
  let settings = options?.settings ?? (await getSettings());
  let patterns = options?.patterns ?? (await loadPatterns());

  const unwatchSettings = watchSettings((newSettings) => {
    settings = newSettings;
    reEvaluateAllTiles(patterns, settings);
  });

  const unwatchPatterns = watchPatterns((newPatterns) => {
    patterns = newPatterns;
    reEvaluateAllTiles(patterns, settings);
  });

  const stopScanner = startScanner((tile, video) => {
    evaluateAndProcessTile(tile, video, patterns, settings);
  });

  return () => {
    unwatchSettings();
    unwatchPatterns();
    stopScanner();
  };
}

export default defineContentScript({
  matches: ['*://www.youtube.com/*'],
  async main() {
    await initContent();
  },
});
