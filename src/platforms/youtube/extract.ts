import type { VideoInfo } from '../../core/types';
import { SELECTORS } from './selectors';

/**
 * Queries the first matching element using a list of selectors in priority order.
 * Unlike a comma-separated selector string which returns whichever matches earliest in document order,
 * this checks selectors sequentially so high-priority specific selectors take precedence over broader ancestors.
 */
function queryFirst(el: Element, selectors: readonly string[]): Element | null {
  for (const selector of selectors) {
    const match = el.querySelector(selector);
    if (match) {
      return match;
    }
  }
  return null;
}

/**
 * Safely decodes a URI component without throwing on malformed percent encoding.
 */
function safeDecode(val: string): string {
  try {
    return decodeURIComponent(val);
  } catch {
    return val;
  }
}

/**
 * Extracts VideoInfo from a YouTube video tile Element.
 * Returns null if no valid videoId is found.
 */
export function extractVideo(tile: Element): VideoInfo | null {
  // Find link to video (/watch?v=) or Short (/shorts/)
  const linkEl = tile.matches(SELECTORS.videoLink)
    ? tile
    : tile.querySelector(SELECTORS.videoLink);

  if (!linkEl) {
    return null;
  }

  const href = linkEl.getAttribute('href');
  if (!href) {
    return null;
  }

  let videoId: string | null = null;
  let isShort = false;

  // Check for shorts shelf/tile container match on tile or ancestor (without :has)
  if (
    tile.matches(SELECTORS.shortsContainerSelector) ||
    Boolean(tile.closest(SELECTORS.shortsContainerSelector))
  ) {
    isShort = true;
  }

  try {
    const url = new URL(href, 'https://www.youtube.com');
    if (url.pathname === '/watch' || url.pathname.endsWith('/watch')) {
      const v = url.searchParams.get('v');
      if (v) {
        videoId = v;
      }
    } else if (url.pathname.startsWith('/shorts/')) {
      const segment = url.pathname.slice('/shorts/'.length).split('/')[0];
      if (segment) {
        videoId = segment;
        isShort = true;
      }
    }
  } catch {
    // URL parsing fallback
    const watchMatch = href.match(/[?&]v=([a-zA-Z0-9_-]+)/);
    if (watchMatch && watchMatch[1]) {
      videoId = watchMatch[1];
    } else {
      const shortsMatch = href.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
      if (shortsMatch && shortsMatch[1]) {
        videoId = shortsMatch[1];
        isShort = true;
      }
    }
  }

  if (!videoId) {
    return null;
  }

  // Extract video title from prioritized title element attribute or trimmed text
  const titleEl = queryFirst(tile, SELECTORS.title);
  let title: string | null = null;
  if (titleEl) {
    const attrTitle =
      titleEl.getAttribute('title') ||
      titleEl.parentElement?.getAttribute('title');
    if (attrTitle && attrTitle.trim()) {
      title = attrTitle.trim();
    } else {
      const textTitle = titleEl.textContent?.trim();
      title = textTitle ? textTitle.replace(/\s+/g, ' ') : null;
    }
  }

  // Extract channelHandle from first a[href^="/@"] (lowercased, with leading @)
  const handleEl = tile.querySelector(SELECTORS.channelHandle);
  let channelHandle: string | null = null;
  if (handleEl) {
    const handleHref = handleEl.getAttribute('href');
    if (handleHref) {
      try {
        const url = new URL(handleHref, 'https://www.youtube.com');
        if (url.pathname.startsWith('/@')) {
          const handle = url.pathname.slice(1).split('/')[0];
          if (handle) {
            channelHandle = safeDecode(handle).toLowerCase();
          }
        }
      } catch {
        const match = handleHref.match(/\/@([^/?#]+)/);
        if (match && match[1]) {
          channelHandle = safeDecode(`@${match[1]}`).toLowerCase();
        }
      }
    }
  }

  // Extract channel display name using prioritized selectors
  const channelNameEl = queryFirst(tile, SELECTORS.channelName);
  let channelName: string | null = null;
  if (channelNameEl) {
    const textName = channelNameEl.textContent?.trim();
    channelName = textName ? textName : null;
  }

  // Extract duration text using prioritized selectors
  const durationEl = queryFirst(tile, SELECTORS.duration);
  let durationText: string | null = null;
  if (durationEl) {
    const textDuration = durationEl.textContent?.trim();
    durationText = textDuration ? textDuration : null;
  }

  return {
    videoId,
    title,
    channelHandle,
    channelName,
    durationText,
    isShort,
  };
}
