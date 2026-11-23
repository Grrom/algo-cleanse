import type { VideoInfo } from '../../core/types';
import { extractVideo } from './extract';
import { SELECTORS } from './selectors';

export type OnTileCallback = (tile: Element, video: VideoInfo) => void;

/**
 * Starts scanning for video tiles on YouTube pages.
 * - Single MutationObserver on document.body
 * - Batched with requestAnimationFrame
 * - Rescans on yt-navigate-finish event
 * - Tracks processed videoId in data-ac-video-id to handle recycled elements
 */
export function startScanner(onTile: OnTileCallback): () => void {
  let rafId: number | null = null;

  function scan() {
    const root = document.body || document.documentElement;
    if (!root) {
      return;
    }

    const tiles = Array.from(root.querySelectorAll(SELECTORS.tile));
    for (const tile of tiles) {
      // Skip nested tile matches when an ancestor tile is already matching
      if (tile.parentElement && tile.parentElement.closest(SELECTORS.tile)) {
        continue;
      }

      const video = extractVideo(tile);
      if (!video) {
        continue;
      }

      const lastVideoId = tile.getAttribute(SELECTORS.videoIdAttr);
      if (lastVideoId === video.videoId) {
        // Already processed for this videoId
        continue;
      }

      tile.setAttribute(SELECTORS.videoIdAttr, video.videoId);
      onTile(tile, video);
    }
  }

  function scheduleScan() {
    if (rafId !== null) {
      return;
    }
    const requestFrame =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (cb: FrameRequestCallback) => setTimeout(cb, 0) as unknown as number;

    rafId = requestFrame(() => {
      rafId = null;
      scan();
    });
  }

  // Single MutationObserver on document.body
  const observer = new MutationObserver(() => {
    scheduleScan();
  });

  const target = document.body || document.documentElement;
  if (target) {
    observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href'],
    });
  }

  // Rescan on yt-navigate-finish SPA navigation event
  const handleNavigateFinish = () => {
    scheduleScan();
  };

  window.addEventListener(SELECTORS.navigateFinishEvent, handleNavigateFinish);
  document.addEventListener(
    SELECTORS.navigateFinishEvent,
    handleNavigateFinish,
  );

  // Initial scan pass
  scheduleScan();

  // Return teardown function
  return () => {
    if (rafId !== null) {
      const cancelFrame =
        typeof cancelAnimationFrame === 'function'
          ? cancelAnimationFrame
          : (id: number) => clearTimeout(id);
      cancelFrame(rafId);
      rafId = null;
    }
    observer.disconnect();
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
