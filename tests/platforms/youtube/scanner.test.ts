import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startScanner } from '../../../src/platforms/youtube/scanner';
import {
  SELECTORS,
  YT_NAVIGATE_FINISH_EVENT,
} from '../../../src/platforms/youtube/selectors';

describe('scanner', () => {
  let stop: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    if (stop) {
      stop();
      stop = null;
    }
    document.body.innerHTML = '';
  });

  async function flushRaf() {
    await new Promise((resolve) => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => setTimeout(resolve, 10));
      } else {
        setTimeout(resolve, 20);
      }
    });
  }

  // jsdom: appended tiles trigger onTile once each; changing a tile's link to another videoId triggers again; re-appending the same tile doesn't
  it("jsdom: appended tiles trigger onTile once each; changing a tile's link to another videoId triggers again; re-appending the same tile doesn't", async () => {
    const onTile = vi.fn();
    stop = startScanner(onTile);

    // 1. Append a tile: triggers onTile once
    const tile = document.createElement('ytd-rich-item-renderer');
    const link = document.createElement('a');
    link.setAttribute('href', '/watch?v=vid1');
    const title = document.createElement('span');
    title.id = 'video-title';
    title.textContent = 'Video One';
    tile.appendChild(link);
    tile.appendChild(title);

    document.body.appendChild(tile);
    await flushRaf();

    expect(onTile).toHaveBeenCalledTimes(1);
    expect(onTile).toHaveBeenLastCalledWith(
      tile,
      expect.objectContaining({ videoId: 'vid1', title: 'Video One' }),
    );
    expect(tile.getAttribute(SELECTORS.videoIdAttr)).toBe('vid1');

    // 2. Re-appending the same tile does NOT trigger onTile again
    document.body.removeChild(tile);
    document.body.appendChild(tile);
    await flushRaf();

    expect(onTile).toHaveBeenCalledTimes(1);

    // 3. Changing a tile's link to another videoId triggers again
    link.setAttribute('href', '/watch?v=vid2');
    await flushRaf();

    expect(onTile).toHaveBeenCalledTimes(2);
    expect(onTile).toHaveBeenLastCalledWith(
      tile,
      expect.objectContaining({ videoId: 'vid2' }),
    );
    expect(tile.getAttribute(SELECTORS.videoIdAttr)).toBe('vid2');

    // Re-appending after change does not trigger again
    document.body.removeChild(tile);
    document.body.appendChild(tile);
    await flushRaf();

    expect(onTile).toHaveBeenCalledTimes(2);
  });

  // Dispatching yt-navigate-finish triggers a rescan
  it('Dispatching yt-navigate-finish triggers a rescan', async () => {
    const onTile = vi.fn();
    stop = startScanner(onTile);
    await flushRaf();
    expect(onTile).toHaveBeenCalledTimes(0);

    // Add a tile without triggering standard MutationObserver detection if detached, or add it
    const tile = document.createElement('ytd-video-renderer');
    const link = document.createElement('a');
    link.setAttribute('href', '/watch?v=navVid1');
    tile.appendChild(link);
    document.body.appendChild(tile);

    // Dispatch yt-navigate-finish event
    window.dispatchEvent(new CustomEvent(YT_NAVIGATE_FINISH_EVENT));
    await flushRaf();

    expect(onTile).toHaveBeenCalledTimes(1);
    expect(onTile).toHaveBeenLastCalledWith(
      tile,
      expect.objectContaining({ videoId: 'navVid1' }),
    );

    // Dispatching again without video change does not re-trigger onTile
    window.dispatchEvent(new CustomEvent(YT_NAVIGATE_FINISH_EVENT));
    await flushRaf();
    expect(onTile).toHaveBeenCalledTimes(1);
  });

  it('skips nested matching tiles and skeleton tiles without video', async () => {
    const onTile = vi.fn();
    stop = startScanner(onTile);

    // Skeleton tile with no link
    const skeletonTile = document.createElement('ytd-rich-item-renderer');
    document.body.appendChild(skeletonTile);

    // Parent tile with nested lockup model for the same video
    const outerTile = document.createElement('ytd-rich-item-renderer');
    const innerTile = document.createElement('yt-lockup-view-model');
    const link = document.createElement('a');
    link.setAttribute('href', '/watch?v=nestedVid1');
    innerTile.appendChild(link);
    outerTile.appendChild(innerTile);
    document.body.appendChild(outerTile);

    await flushRaf();

    // onTile should only be called once for the outer tile, not for the inner tile, and not for the skeleton
    expect(onTile).toHaveBeenCalledTimes(1);
    expect(onTile).toHaveBeenCalledWith(
      outerTile,
      expect.objectContaining({ videoId: 'nestedVid1' }),
    );
  });

  it('cancels pending RAF when teardown function is called', () => {
    const onTile = vi.fn();
    const cleanup = startScanner(onTile);
    // Cleanup immediately before next animation frame
    cleanup();
    expect(onTile).toHaveBeenCalledTimes(0);
  });
});
