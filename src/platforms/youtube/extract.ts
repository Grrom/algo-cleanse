import type { VideoInfo } from '../../core/types';
import { SELECTORS } from './selectors';

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

  // Check for shorts container match on tile or ancestor
  if (
    tile.matches(SELECTORS.shorts) ||
    Boolean(tile.closest(SELECTORS.shorts))
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

  // Extract video title from title element attribute or trimmed text
  const titleEl = tile.querySelector(SELECTORS.title);
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
            channelHandle = handle.toLowerCase();
          }
        }
      } catch {
        const match = handleHref.match(/\/@([^/?#]+)/);
        if (match && match[1]) {
          channelHandle = `@${match[1]}`.toLowerCase();
        }
      }
    }
  }

  // Extract channel display name
  const channelNameEl = tile.querySelector(SELECTORS.channelName);
  let channelName: string | null = null;
  if (channelNameEl) {
    const textName = channelNameEl.textContent?.trim();
    channelName = textName ? textName : null;
  }

  // Extract duration text
  const durationEl = tile.querySelector(SELECTORS.duration);
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
