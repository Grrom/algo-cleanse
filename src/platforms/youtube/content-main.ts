import { loadPatterns, watchPatterns } from '../../core/active-patterns';
import { isAutoEligible } from '../../core/engine';
import type { Patterns } from '../../core/patterns-schema';
import {
  getSettings,
  normalizeChannelHandle,
  watchSettings,
} from '../../core/settings';
import {
  isHandleDontRecommended,
  markHandleDontRecommended,
  TrainQueue,
} from '../../core/train-queue';
import type { Settings } from '../../core/types';
import {
  evaluateAndProcessTile,
  reEvaluateAllTiles,
  setGlobalTrainQueue,
  updateBadgeCount,
} from './collapse';
import { onAllowed, onBlocked, onCollapsed, onRevealed } from './events';
import { extractVideo } from './extract';
import {
  isSignedIn,
  sendDontRecommendChannel,
  sendNotInterested,
} from './native-feedback';
import { startScanner } from './scanner';
import { SELECTORS } from './selectors';

const inFlightDontRecommendHandles = new Set<string>();

/**
 * Handles YouTube "Don't recommend channel" feedback when a channel is blocked.
 */
export async function handleBlockDontRecommend(
  handle: string,
  tile: Element,
  settings: Settings,
): Promise<void> {
  if (!settings.dontRecommendOnBlock || !isSignedIn()) {
    return;
  }

  const norm = normalizeChannelHandle(handle);
  if (inFlightDontRecommendHandles.has(norm)) {
    return;
  }
  const alreadyActed = await isHandleDontRecommended(norm);
  if (alreadyActed) {
    return;
  }

  inFlightDontRecommendHandles.add(norm);
  try {
    const result = await sendDontRecommendChannel(tile);

    const card = tile.querySelector(SELECTORS.card);
    const statusEl = card?.querySelector(SELECTORS.status);
    if (statusEl) {
      if (result === 'ok') {
        statusEl.textContent = "✓ Told YouTube: Don't recommend channel";
      } else {
        statusEl.textContent = "Couldn't reach YouTube's menu";
      }
    }

    if (result === 'ok') {
      await markHandleDontRecommended(norm);
    }
  } finally {
    inFlightDontRecommendHandles.delete(norm);
  }
}

/**
 * Initializes AlgoCleanse YouTube content script logic.
 */
export async function initContent(options?: {
  settings?: Settings;
  patterns?: Patterns;
  trainQueue?: TrainQueue;
}): Promise<() => void> {
  let settings = options?.settings ?? (await getSettings());
  let patterns = options?.patterns ?? (await loadPatterns());
  const trainQueue = options?.trainQueue ?? new TrainQueue();
  setGlobalTrainQueue(trainQueue);

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

  const unsubscribeCollapsed = onCollapsed((tile, video, verdict) => {
    if (isAutoEligible(verdict, settings)) {
      trainQueue.enqueue({
        videoId: video.videoId,
        channelHandle: video.channelHandle,
        validate: () => {
          if (!tile.isConnected) return 'drop';
          const currentVideo = extractVideo(tile);
          if (currentVideo?.videoId !== video.videoId) return 'drop';
          if (!isSignedIn()) return 'skip';
          return 'valid';
        },
        action: async () => {
          const res = await sendNotInterested(tile);
          const card = tile.querySelector(SELECTORS.card);
          const statusEl = card?.querySelector(SELECTORS.status);
          if (statusEl) {
            if (res === 'ok') {
              statusEl.textContent = '✓ Told YouTube: Not interested';
            } else {
              statusEl.textContent = "Couldn't reach YouTube's menu";
            }
          }
          return res;
        },
      });
    }
  });

  const unsubscribeRevealed = onRevealed((_tile, video) => {
    trainQueue.cancelVideo(video.videoId);
  });

  const unsubscribeAllowed = onAllowed((handle) => {
    trainQueue.cancelChannel(handle);
  });

  const unsubscribeBlocked = onBlocked(async (handle, tile) => {
    await handleBlockDontRecommend(handle, tile, settings);
  });

  return () => {
    unwatchSettings();
    unwatchPatterns();
    stopScanner();
    unsubscribeCollapsed();
    unsubscribeRevealed();
    unsubscribeAllowed();
    unsubscribeBlocked();
    trainQueue.clear();
    setGlobalTrainQueue(null);
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
