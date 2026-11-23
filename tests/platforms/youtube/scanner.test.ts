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

    // 1. Append multiple tiles in the same tick: RAF batches them and triggers onTile once each
    const tile1 = document.createElement('ytd-rich-item-renderer');
    const link1 = document.createElement('a');
    link1.setAttribute('href', '/watch?v=vid1');
    const title1 = document.createElement('span');
    title1.id = 'video-title';
    title1.textContent = 'Video One';
    tile1.appendChild(link1);
    tile1.appendChild(title1);

    const tile2 = document.createElement('ytd-rich-item-renderer');
    const link2 = document.createElement('a');
    link2.setAttribute('href', '/watch?v=vid2');
    const title2 = document.createElement('span');
    title2.id = 'video-title';
    title2.textContent = 'Video Two';
    tile2.appendChild(link2);
    tile2.appendChild(title2);

    const tile3 = document.createElement('ytd-video-renderer');
    const link3 = document.createElement('a');
    link3.setAttribute('href', '/watch?v=vid3');
    const title3 = document.createElement('span');
    title3.id = 'video-title';
    title3.textContent = 'Video Three';
    tile3.appendChild(link3);
    tile3.appendChild(title3);

    document.body.appendChild(tile1);
    document.body.appendChild(tile2);
    document.body.appendChild(tile3);
    await flushRaf();

    expect(onTile).toHaveBeenCalledTimes(3);
    expect(onTile).toHaveBeenCalledWith(
      tile1,
      expect.objectContaining({ videoId: 'vid1', title: 'Video One' }),
    );
    expect(onTile).toHaveBeenCalledWith(
      tile2,
      expect.objectContaining({ videoId: 'vid2', title: 'Video Two' }),
    );
    expect(onTile).toHaveBeenCalledWith(
      tile3,
      expect.objectContaining({ videoId: 'vid3', title: 'Video Three' }),
    );
    expect(tile1.getAttribute(SELECTORS.videoIdAttr)).toBe('vid1');
    expect(tile2.getAttribute(SELECTORS.videoIdAttr)).toBe('vid2');
    expect(tile3.getAttribute(SELECTORS.videoIdAttr)).toBe('vid3');

    // 2. Re-appending the same tiles does NOT trigger onTile again
    document.body.removeChild(tile1);
    document.body.removeChild(tile2);
    document.body.appendChild(tile1);
    document.body.appendChild(tile2);
    await flushRaf();

    expect(onTile).toHaveBeenCalledTimes(3);

    // 3. Changing a tile's link to another videoId triggers again
    link1.setAttribute('href', '/watch?v=vid4');
    await flushRaf();

    expect(onTile).toHaveBeenCalledTimes(4);
    expect(onTile).toHaveBeenLastCalledWith(
      tile1,
      expect.objectContaining({ videoId: 'vid4' }),
    );
    expect(tile1.getAttribute(SELECTORS.videoIdAttr)).toBe('vid4');

    // Re-appending after change does not trigger again
    document.body.removeChild(tile1);
    document.body.appendChild(tile1);
    await flushRaf();

    expect(onTile).toHaveBeenCalledTimes(4);
  });

  // Dispatching yt-navigate-finish triggers a rescan
  it('Dispatching yt-navigate-finish triggers a rescan', async () => {
    const onTile = vi.fn();
    stop = startScanner(onTile);

    const tile = document.createElement('ytd-video-renderer');
    const link = document.createElement('a');
    link.setAttribute('href', '/watch?v=navVid1');
    tile.appendChild(link);
    document.body.appendChild(tile);

    // Initial flush processes the appended tile via MutationObserver childList
    await flushRaf();
    expect(onTile).toHaveBeenCalledTimes(1);
    expect(onTile).toHaveBeenLastCalledWith(
      tile,
      expect.objectContaining({ videoId: 'navVid1' }),
    );

    // Remove videoIdAttr: MutationObserver ignores this due to attributeFilter: ['href']
    tile.removeAttribute(SELECTORS.videoIdAttr);
    await flushRaf();
    // Confirms no rescan was triggered by removing the attribute
    expect(onTile).toHaveBeenCalledTimes(1);

    // Dispatching yt-navigate-finish on document triggers a rescan
    document.dispatchEvent(new CustomEvent(YT_NAVIGATE_FINISH_EVENT));
    await flushRaf();
    expect(onTile).toHaveBeenCalledTimes(2);
    expect(tile.getAttribute(SELECTORS.videoIdAttr)).toBe('navVid1');

    // Remove videoIdAttr again and test window event listener in a separate step
    tile.removeAttribute(SELECTORS.videoIdAttr);
    await flushRaf();
    expect(onTile).toHaveBeenCalledTimes(2);

    // Dispatching yt-navigate-finish on window triggers a rescan
    window.dispatchEvent(new CustomEvent(YT_NAVIGATE_FINISH_EVENT));
    await flushRaf();
    expect(onTile).toHaveBeenCalledTimes(3);

    // Dispatching again without removing videoIdAttr does not re-trigger onTile
    window.dispatchEvent(new CustomEvent(YT_NAVIGATE_FINISH_EVENT));
    await flushRaf();
    expect(onTile).toHaveBeenCalledTimes(3);
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
