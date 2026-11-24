import { loadPatterns, watchPatterns } from '../../core/active-patterns';
import type { Patterns } from '../../core/patterns-schema';
import { getSettings, watchSettings } from '../../core/settings';
import type { Settings } from '../../core/types';
import {
  evaluateAndProcessTile,
  reEvaluateAllTiles,
  updateBadgeCount,
} from './collapse';
import { startScanner } from './scanner';
import { SELECTORS } from './selectors';

/**
 * Initializes AlgoCleanse YouTube content script logic.
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

  const handleNavigateFinish = () => {
    updateBadgeCount();
  };

  window.addEventListener(SELECTORS.navigateFinishEvent, handleNavigateFinish);
  document.addEventListener(
    SELECTORS.navigateFinishEvent,
    handleNavigateFinish,
  );

  return () => {
    unwatchSettings();
    unwatchPatterns();
    stopScanner();
    window.removeEventListener(
      SELECTORS.navigateFinishEvent,
      handleNavigateFinish,
    );
    document.removeEventListener(
      SELECTORS.navigateFinishEvent,
      handleNavigateFinish,
    );
  };
}
