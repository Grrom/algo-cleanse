import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { updateSettings } from '../../../src/core/settings';
import {
  handleShortsRedirect,
  HIDDEN_SHORTS_CLASS,
  hideShorts,
  initShorts,
  shortsRedirectUrl,
  showShorts,
  updateShorts,
} from '../../../src/platforms/youtube/shorts';
import {
  SELECTORS,
  YT_NAVIGATE_FINISH_EVENT,
} from '../../../src/platforms/youtube/selectors';

describe('shorts remover', () => {
  let stopInit: (() => void) | null = null;

  beforeEach(async () => {
    document.body.innerHTML = '';
    // Reset default settings with hideShorts: true
    await updateSettings({ hideShorts: true });
  });

  afterEach(() => {
    if (stopInit) {
      stopInit();
      stopInit = null;
    }
    document.body.innerHTML = '';
  });

  // Shorts shelf fixture hidden when true, visible when false
  it('Shorts shelf fixture hidden when true, visible when false', () => {
    const fixtureHtml = readFileSync(
      resolve(__dirname, '../../fixtures/youtube/shorts-shelf.html'),
      'utf-8',
    );
    const container = document.createElement('div');
    container.innerHTML = fixtureHtml;
    document.body.appendChild(container);

    const shelf = container.querySelector(SELECTORS.shortsContainers[1]);
    const reelShelf = container.querySelector(SELECTORS.shortsContainers[0]);
    const lockups = container.querySelectorAll(SELECTORS.shortsContainers[2]);
    const guideEntry = container.querySelector(
      SELECTORS.shortsGuide.split(', ')[0]!,
    );
    const miniGuideEntry = container.querySelector(
      SELECTORS.shortsGuide.split(', ')[1]!,
    );

    expect(shelf).not.toBeNull();
    expect(reelShelf).not.toBeNull();
    expect(lockups.length).toBe(2);
    expect(guideEntry).not.toBeNull();
    expect(miniGuideEntry).not.toBeNull();

    // 1. When true: all Shorts elements are hidden with class and display:none
    hideShorts(container);

    expect(shelf?.classList.contains(HIDDEN_SHORTS_CLASS)).toBe(true);
    expect((shelf as HTMLElement)?.style.display).toBe('none');

    expect(reelShelf?.classList.contains(HIDDEN_SHORTS_CLASS)).toBe(true);
    expect((reelShelf as HTMLElement)?.style.display).toBe('none');

    for (const lockup of lockups) {
      expect(lockup.classList.contains(HIDDEN_SHORTS_CLASS)).toBe(true);
      expect((lockup as HTMLElement).style.display).toBe('none');
    }

    expect(guideEntry?.classList.contains(HIDDEN_SHORTS_CLASS)).toBe(true);
    expect((guideEntry as HTMLElement)?.style.display).toBe('none');

    expect(miniGuideEntry?.classList.contains(HIDDEN_SHORTS_CLASS)).toBe(true);
    expect((miniGuideEntry as HTMLElement)?.style.display).toBe('none');

    // 2. When false: visible again with class removed and display reset
    showShorts(container);

    expect(shelf?.classList.contains(HIDDEN_SHORTS_CLASS)).toBe(false);
    expect((shelf as HTMLElement)?.style.display).not.toBe('none');

    expect(reelShelf?.classList.contains(HIDDEN_SHORTS_CLASS)).toBe(false);
    expect((reelShelf as HTMLElement)?.style.display).not.toBe('none');

    for (const lockup of lockups) {
      expect(lockup.classList.contains(HIDDEN_SHORTS_CLASS)).toBe(false);
      expect((lockup as HTMLElement).style.display).not.toBe('none');
    }

    expect(guideEntry?.classList.contains(HIDDEN_SHORTS_CLASS)).toBe(false);
    expect((guideEntry as HTMLElement)?.style.display).not.toBe('none');

    expect(miniGuideEntry?.classList.contains(HIDDEN_SHORTS_CLASS)).toBe(false);
    expect((miniGuideEntry as HTMLElement)?.style.display).not.toBe('none');

    // 3. updateShorts toggles correctly
    updateShorts(true, container);
    expect(shelf?.classList.contains(HIDDEN_SHORTS_CLASS)).toBe(true);
    expect((shelf as HTMLElement)?.style.display).toBe('none');

    updateShorts(false, container);
    expect(shelf?.classList.contains(HIDDEN_SHORTS_CLASS)).toBe(false);
    expect((shelf as HTMLElement)?.style.display).not.toBe('none');
  });

  // Tile linking /shorts/abc hidden when true
  it('Tile linking /shorts/abc hidden when true', () => {
    const container = document.createElement('div');

    // Search result video tile linking to /shorts/abc
    const shortsSearchTile = document.createElement('ytd-video-renderer');
    shortsSearchTile.innerHTML = `
      <div id="dismissible">
        <a id="thumbnail" href="/shorts/abc">
          <span class="badge">Short</span>
        </a>
        <h3 id="video-title">Short in Search Results</h3>
      </div>
    `;

    // Standard video tile linking to /watch?v=regularVid
    const regularSearchTile = document.createElement('ytd-video-renderer');
    regularSearchTile.innerHTML = `
      <div id="dismissible">
        <a id="thumbnail" href="/watch?v=regularVid">
          <span class="badge">10:00</span>
        </a>
        <h3 id="video-title">Regular Video</h3>
      </div>
    `;

    // Home feed rich item tile linking to /shorts/abc
    const shortsHomeTile = document.createElement('ytd-rich-item-renderer');
    shortsHomeTile.innerHTML = `
      <div id="content">
        <a id="video-title-link" href="/shorts/abc">Home Short</a>
      </div>
    `;

    // Watch sidebar recommendation tile linking to /shorts/abc
    const shortsSidebarTile = document.createElement(
      'ytd-compact-video-renderer',
    );
    shortsSidebarTile.innerHTML = `
      <div id="dismissible">
        <a href="/shorts/abc">Sidebar Short</a>
      </div>
    `;

    // Custom test tile container linking to /shorts/abc
    const customShortsTile = document.createElement('div');
    customShortsTile.innerHTML = '<a href="/shorts/abc">Custom Short</a>';

    container.appendChild(shortsSearchTile);
    container.appendChild(regularSearchTile);
    container.appendChild(shortsHomeTile);
    container.appendChild(shortsSidebarTile);
    container.appendChild(customShortsTile);
    document.body.appendChild(container);

    // Hide shorts
    hideShorts(container);

    // Shorts tiles are hidden
    expect(shortsSearchTile.classList.contains(HIDDEN_SHORTS_CLASS)).toBe(true);
    expect(shortsSearchTile.style.display).toBe('none');

    expect(shortsHomeTile.classList.contains(HIDDEN_SHORTS_CLASS)).toBe(true);
    expect(shortsHomeTile.style.display).toBe('none');

    expect(shortsSidebarTile.classList.contains(HIDDEN_SHORTS_CLASS)).toBe(
      true,
    );
    expect(shortsSidebarTile.style.display).toBe('none');

    expect(customShortsTile.classList.contains(HIDDEN_SHORTS_CLASS)).toBe(true);
    expect(customShortsTile.style.display).toBe('none');

    // Regular video tile is NOT hidden
    expect(regularSearchTile.classList.contains(HIDDEN_SHORTS_CLASS)).toBe(
      false,
    );
    expect(regularSearchTile.style.display).not.toBe('none');

    // When showShorts is called, shorts tiles become visible again
    showShorts(container);
    expect(shortsSearchTile.classList.contains(HIDDEN_SHORTS_CLASS)).toBe(
      false,
    );
    expect(shortsSearchTile.style.display).not.toBe('none');
    expect(shortsHomeTile.classList.contains(HIDDEN_SHORTS_CLASS)).toBe(false);
    expect(shortsHomeTile.style.display).not.toBe('none');
  });

  // shortsRedirectUrl('https://www.youtube.com/shorts/abc?feature=x') -> https://www.youtube.com/watch?v=abc; non-Shorts URL -> null
  it("shortsRedirectUrl('https://www.youtube.com/shorts/abc?feature=x') -> https://www.youtube.com/watch?v=abc; non-Shorts URL -> null", () => {
    // 1. Shorts URL with query params
    expect(
      shortsRedirectUrl('https://www.youtube.com/shorts/abc?feature=x'),
    ).toBe('https://www.youtube.com/watch?v=abc');

    // 2. Shorts URL without query params
    expect(shortsRedirectUrl('https://www.youtube.com/shorts/abc')).toBe(
      'https://www.youtube.com/watch?v=abc',
    );

    // 3. Shorts URL with trailing slash and query params
    expect(
      shortsRedirectUrl('https://www.youtube.com/shorts/abc/?si=123&t=10'),
    ).toBe('https://www.youtube.com/watch?v=abc');

    // 4. Relative /shorts/ URL
    expect(shortsRedirectUrl('/shorts/abc')).toBe(
      'https://www.youtube.com/watch?v=abc',
    );
    expect(shortsRedirectUrl('/shorts/abc?feature=x')).toBe(
      'https://www.youtube.com/watch?v=abc',
    );

    // 5. Non-Shorts URLs return null
    expect(shortsRedirectUrl('https://www.youtube.com/watch?v=abc')).toBeNull();
    expect(
      shortsRedirectUrl('https://www.youtube.com/feed/subscriptions'),
    ).toBeNull();
    expect(shortsRedirectUrl('https://www.youtube.com/')).toBeNull();
    expect(shortsRedirectUrl('https://www.youtube.com/shorts')).toBeNull();
    expect(shortsRedirectUrl('https://www.youtube.com/shorts/')).toBeNull();
    expect(shortsRedirectUrl('https://example.com/shorts/abc')).toBeNull();
    expect(shortsRedirectUrl('not-a-url')).toBeNull();
  });

  // Flipping the setting updates the page live (test via watchSettings)
  it('Flipping the setting updates the page live (test via watchSettings)', async () => {
    const fixtureHtml = readFileSync(
      resolve(__dirname, '../../fixtures/youtube/shorts-shelf.html'),
      'utf-8',
    );
    document.body.innerHTML = fixtureHtml;

    const shelf = document.body.querySelector(SELECTORS.shortsContainers[1]);
    const guideEntry = document.body.querySelector(
      SELECTORS.shortsGuide.split(', ')[0]!,
    );
    expect(shelf).not.toBeNull();
    expect(guideEntry).not.toBeNull();

    // Start with hideShorts: true
    await updateSettings({ hideShorts: true });
    stopInit = initShorts();

    // Allow async getSettings to resolve and apply
    await new Promise((r) => setTimeout(r, 20));

    expect(shelf?.classList.contains(HIDDEN_SHORTS_CLASS)).toBe(true);
    expect((shelf as HTMLElement)?.style.display).toBe('none');
    expect(guideEntry?.classList.contains(HIDDEN_SHORTS_CLASS)).toBe(true);
    expect((guideEntry as HTMLElement)?.style.display).toBe('none');

    // Flip setting to false -> page updates live
    await updateSettings({ hideShorts: false });
    await new Promise((r) => setTimeout(r, 20));

    expect(shelf?.classList.contains(HIDDEN_SHORTS_CLASS)).toBe(false);
    expect((shelf as HTMLElement)?.style.display).not.toBe('none');
    expect(guideEntry?.classList.contains(HIDDEN_SHORTS_CLASS)).toBe(false);
    expect((guideEntry as HTMLElement)?.style.display).not.toBe('none');

    // Flip setting back to true -> page updates live again
    await updateSettings({ hideShorts: true });
    await new Promise((r) => setTimeout(r, 20));

    expect(shelf?.classList.contains(HIDDEN_SHORTS_CLASS)).toBe(true);
    expect((shelf as HTMLElement)?.style.display).toBe('none');
    expect(guideEntry?.classList.contains(HIDDEN_SHORTS_CLASS)).toBe(true);
    expect((guideEntry as HTMLElement)?.style.display).toBe('none');
  });

  // When hideShorts is true, location.replace to it on initial load and SPA navigation
  it('When hideShorts is true, location.replace to it on initial load and SPA navigation', () => {
    const replaceMock = vi.fn();

    // 1. Initial load on Shorts URL when hideShorts is true
    const redirected = handleShortsRedirect(
      true,
      'https://www.youtube.com/shorts/testVid99?feature=share',
      replaceMock,
    );
    expect(redirected).toBe('https://www.youtube.com/watch?v=testVid99');
    expect(replaceMock).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=testVid99',
    );

    // 2. When hideShorts is false, no redirect occurs
    replaceMock.mockClear();
    const noRedirect = handleShortsRedirect(
      false,
      'https://www.youtube.com/shorts/testVid99',
      replaceMock,
    );
    expect(noRedirect).toBeNull();
    expect(replaceMock).not.toHaveBeenCalled();

    // 3. SPA navigation event yt-navigate-finish triggers redirect when on Shorts URL
    replaceMock.mockClear();
    stopInit = initShorts();

    // Mock window.location
    const originalLocation = window.location;
    try {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: {
          href: 'https://www.youtube.com/shorts/spaShort123',
          replace: replaceMock,
        },
      });

      // Dispatch yt-navigate-finish event
      window.dispatchEvent(new CustomEvent(YT_NAVIGATE_FINISH_EVENT));
      expect(replaceMock).toHaveBeenCalledWith(
        'https://www.youtube.com/watch?v=spaShort123',
      );
    } finally {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: originalLocation,
      });
    }
  });

  // Dynamically added Shorts elements via MutationObserver are hidden when hideShorts is true
  it('Dynamically added Shorts elements via MutationObserver are hidden when hideShorts is true', async () => {
    await updateSettings({ hideShorts: true });
    stopInit = initShorts();
    await new Promise((r) => setTimeout(r, 20));

    // Append a new Shorts shelf dynamically (simulating infinite scrolling)
    const newShelf = document.createElement('ytd-rich-shelf-renderer');
    newShelf.setAttribute('is-shorts', '');
    document.body.appendChild(newShelf);

    // Append a new Shorts tile dynamically
    const newShortsTile = document.createElement('ytd-video-renderer');
    newShortsTile.innerHTML = '<a href="/shorts/dynamicShort">Dynamic</a>';
    document.body.appendChild(newShortsTile);

    // Flush RAF / mutation callback
    await new Promise((resolve) => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => setTimeout(resolve, 20));
      } else {
        setTimeout(resolve, 30);
      }
    });

    expect(newShelf.classList.contains(HIDDEN_SHORTS_CLASS)).toBe(true);
    expect(newShelf.style.display).toBe('none');

    expect(newShortsTile.classList.contains(HIDDEN_SHORTS_CLASS)).toBe(true);
    expect(newShortsTile.style.display).toBe('none');
  });
});
