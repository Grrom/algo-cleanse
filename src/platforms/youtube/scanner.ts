import type { VideoInfo } from '../../core/types';
import { extractVideo } from './extract';
import { SELECTORS } from './selectors';

export type OnTileCallback = (tile: Element, video: VideoInfo) => void;

/**
 * Fast check to test if a tile's video link href still points to the same videoId.
 * Avoids executing expensive DOM queries and string extractions on unmutated tiles.
 */
function quickMatchesVideoId(href: string, videoId: string): boolean {
  const watchPattern = `v=${videoId}`;
  const watchIdx = href.indexOf(watchPattern);
  if (watchIdx !== -1) {
    const nextChar = href.charAt(watchIdx + watchPattern.length);
    if (!nextChar || nextChar === '&' || nextChar === '#' || nextChar === '?') {
      return true;
    }
  }

  const shortsPattern = `/shorts/${videoId}`;
  const shortsIdx = href.indexOf(shortsPattern);
  if (shortsIdx !== -1) {
    const nextChar = href.charAt(shortsIdx + shortsPattern.length);
    if (
      !nextChar ||
      nextChar === '/' ||
      nextChar === '?' ||
      nextChar === '#' ||
      nextChar === '&'
    ) {
      return true;
    }
  }

  return false;
}

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

      const lastVideoId = tile.getAttribute(SELECTORS.videoIdAttr);
      if (lastVideoId) {
        // Cheap check: if video link href hasn't changed, skip expensive full extraction
        const linkEl = tile.matches(SELECTORS.videoLink)
          ? tile
          : tile.querySelector(SELECTORS.videoLink);
        if (linkEl) {
          const href = linkEl.getAttribute('href');
          if (href && quickMatchesVideoId(href, lastVideoId)) {
            continue;
          }
        }
      }

      const video = extractVideo(tile);
      if (!video) {
        continue;
      }

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
