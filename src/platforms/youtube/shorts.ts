import { getSettings, watchSettings } from '../../core/settings';
import { extractVideo } from './extract';
import { HIDDEN_SHORTS_CLASS, SELECTORS } from './selectors';

export { HIDDEN_SHORTS_CLASS };

/**
 * Translates a Shorts URL to a standard watch URL:
 * /shorts/<id> -> https://www.youtube.com/watch?v=<id>
 * Returns null for non-Shorts URLs or URLs without a valid video ID.
 */
export function shortsRedirectUrl(url: string): string | null {
  try {
    const parsed = new URL(url, 'https://www.youtube.com');
    const hostname = parsed.hostname;
    if (
      hostname !== 'youtube.com' &&
      hostname !== 'www.youtube.com' &&
      hostname !== 'm.youtube.com'
    ) {
      return null;
    }
    const match = parsed.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return `https://www.youtube.com/watch?v=${match[1]}`;
    }
    return null;
  } catch {
    const match = url.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return `https://www.youtube.com/watch?v=${match[1]}`;
    }
    return null;
  }
}

/**
 * If hideShorts is true and current location is a Shorts URL, redirects via location.replace.
 * Returns the redirected URL or null.
 */
export function handleShortsRedirect(
  hideShorts: boolean,
  currentUrl?: string,
  replaceFn?: (targetUrl: string) => void,
): string | null {
  if (!hideShorts) {
    return null;
  }

  const url =
    currentUrl ??
    (typeof window !== 'undefined' && window.location
      ? window.location.href
      : '');

  if (!url) {
    return null;
  }

  const redirectUrl = shortsRedirectUrl(url);
  if (redirectUrl) {
    const doReplace =
      replaceFn ??
      ((target: string) => {
        if (typeof window !== 'undefined' && window.location) {
          window.location.replace(target);
        }
      });
    try {
      doReplace(redirectUrl);
    } catch {
      // In test environments or unsupported contexts
    }
    return redirectUrl;
  }

  return null;
}

function hideElement(el: Element): void {
  el.classList.add(HIDDEN_SHORTS_CLASS);
  (el as HTMLElement).style.display = 'none';
}

function unhideElement(el: Element): void {
  el.classList.remove(HIDDEN_SHORTS_CLASS);
  (el as HTMLElement).style.display = '';
}

/**
 * Hides all Shorts shelves, lockups, guide entries, and video tiles where isShort is true.
 * Applied elements receive class 'ac-hidden-shorts' and inline style 'display: none'.
 */
export function hideShorts(root: ParentNode = document): void {
  // 1. Elements matching SHORTS_SELECTORS (shelves, reel items, shorts lockups, guide entries)
  if (root instanceof Element && root.matches(SELECTORS.shorts)) {
    hideElement(root);
  }
  const matchingShorts = root.querySelectorAll(SELECTORS.shorts);
  for (const el of matchingShorts) {
    hideElement(el);
  }

  // 2. Extra guide link fallback for environments without full :has support
  if (root instanceof Element && root.matches(SELECTORS.shortsGuideLink)) {
    const entry = root.closest(SELECTORS.shortsGuideEntry);
    if (entry) {
      hideElement(entry);
    }
  }
  const guideLinks = root.querySelectorAll(SELECTORS.shortsGuideLink);
  for (const link of guideLinks) {
    const entry = link.closest(SELECTORS.shortsGuideEntry);
    if (entry) {
      hideElement(entry);
    }
  }

  // 3. Tiles matching TILE_SELECTOR where isShort is true (Home, Search, Subscriptions, sidebar)
  if (root instanceof Element && root.matches(SELECTORS.tile)) {
    const video = extractVideo(root);
    if (video?.isShort) {
      hideElement(root);
    }
  }
  const tiles = root.querySelectorAll(SELECTORS.tile);
  for (const tile of tiles) {
    const video = extractVideo(tile);
    if (video?.isShort) {
      hideElement(tile);
      if (tile.parentElement) {
        const parentTile = tile.parentElement.closest(SELECTORS.tile);
        if (parentTile) {
          hideElement(parentTile);
        }
      }
    }
  }

  // 4. Any element containing a Shorts link
  const shortsLinks = root.querySelectorAll(SELECTORS.shortsLink);
  for (const link of shortsLinks) {
    const tile = link.closest(SELECTORS.tile);
    if (tile) {
      hideElement(tile);
    } else if (
      link.parentElement &&
      link.parentElement !== document.body &&
      link.parentElement !== document.documentElement
    ) {
      hideElement(link.parentElement);
    }
  }

  // If root itself is a tile linking to shorts or with isShort true
  if (
    root instanceof Element &&
    root !== document.body &&
    root !== document.documentElement
  ) {
    const video = extractVideo(root);
    if (video?.isShort || root.matches(SELECTORS.shortsLink)) {
      hideElement(root);
    }
  }
}

/**
 * Unhides all elements previously hidden by hideShorts.
 * Removes class 'ac-hidden-shorts' and resets inline display style.
 */
export function showShorts(root: ParentNode = document): void {
  if (root instanceof Element && root.matches(SELECTORS.hiddenShorts)) {
    unhideElement(root);
  }
  const hiddenElements = root.querySelectorAll(SELECTORS.hiddenShorts);
  for (const el of hiddenElements) {
    unhideElement(el);
  }
}

/**
 * Updates Shorts visibility based on hideShorts flag.
 */
export function updateShorts(
  hideShortsFlag: boolean,
  root: ParentNode = document,
): void {
  if (hideShortsFlag) {
    hideShorts(root);
  } else {
    showShorts(root);
  }
}

/**
 * Initializes live Shorts hiding on YouTube:
 * - Reads settings and hides/redirects on initial load
 * - Subscribes to settings changes via watchSettings (flipping hideShorts updates live)
 * - Observes DOM mutations to hide dynamically loaded Shorts
 * - Redirects on yt-navigate-finish SPA navigation
 * Returns a teardown function.
 */
export function initShorts(): () => void {
  let activeHideShorts = true;

  const apply = (hide: boolean) => {
    activeHideShorts = hide;
    if (hide) {
      handleShortsRedirect(hide);
      hideShorts(document);
    } else {
      showShorts(document);
    }
  };

  // 1. Initial settings check
  getSettings().then((settings) => {
    apply(settings.hideShorts);
  });

  // 2. Watch settings live
  const unwatch = watchSettings((settings) => {
    apply(settings.hideShorts);
  });

  // 3. Batched MutationObserver for dynamically loaded content
  let rafId: number | null = null;
  const scheduleHide = () => {
    if (!activeHideShorts || rafId !== null) {
      return;
    }
    const requestFrame =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (cb: FrameRequestCallback) => setTimeout(cb, 0) as unknown as number;

    rafId = requestFrame(() => {
      rafId = null;
      if (activeHideShorts) {
        hideShorts(document);
      }
    });
  };

  const observer = new MutationObserver(() => {
    if (activeHideShorts) {
      scheduleHide();
    }
  });

  const root = document.body || document.documentElement;
  if (root) {
    observer.observe(root, {
      childList: true,
      subtree: true,
    });
  }

  // 4. SPA navigation handler
  const onNavigate = () => {
    if (activeHideShorts) {
      handleShortsRedirect(activeHideShorts);
      scheduleHide();
    }
  };

  window.addEventListener(SELECTORS.navigateFinishEvent, onNavigate);
  document.addEventListener(SELECTORS.navigateFinishEvent, onNavigate);

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
    unwatch();
    observer.disconnect();
    window.removeEventListener(SELECTORS.navigateFinishEvent, onNavigate);
    document.removeEventListener(SELECTORS.navigateFinishEvent, onNavigate);
  };
}
