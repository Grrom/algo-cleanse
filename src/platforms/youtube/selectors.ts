/**
 * YouTube DOM selectors.
 * All YouTube selectors must live in this file.
 */

/**
 * Supported video tile container renderers on YouTube:
 * - ytd-rich-item-renderer: standard feed video card on Home and Subscriptions
 * - yt-lockup-view-model: modern unified video lockup element across home and search
 * - ytd-video-renderer: video search result card
 * - ytd-compact-video-renderer: watch-page sidebar / recommendations card
 * - ytd-grid-video-renderer: channel video grid item
 */
export const TILE_RENDERERS = [
  'ytd-rich-item-renderer',
  'yt-lockup-view-model',
  'ytd-video-renderer',
  'ytd-compact-video-renderer',
  'ytd-grid-video-renderer',
] as const;

/**
 * Renderers representing individual Shorts tiles on shelves:
 * - ytm-shorts-lockup-view-model: modern Shorts lockup tile
 * - ytd-reel-item-renderer: legacy Shorts reel item
 */
export const SHORTS_RENDERERS = [
  'ytm-shorts-lockup-view-model',
  'ytd-reel-item-renderer',
] as const;

/**
 * Combined CSS selector matching any video or Shorts tile element.
 */
export const TILE_SELECTOR = [...TILE_RENDERERS, ...SHORTS_RENDERERS].join(
  ', ',
);

export const TILE_SELECTORS = TILE_SELECTOR;

/**
 * Shorts containers to hide or detect:
 * - ytd-reel-shelf-renderer: Shorts carousel / shelf on subscriptions & search
 * - ytd-rich-shelf-renderer[is-shorts]: Shorts shelf grid on the home feed
 * - ytm-shorts-lockup-view-model: individual Shorts lockup view model
 * - ytd-guide-entry-renderer / ytd-mini-guide-entry-renderer: Shorts navigation entries in sidebar
 */
export const SHORTS_SELECTORS = [
  'ytd-reel-shelf-renderer',
  'ytd-rich-shelf-renderer[is-shorts]',
  'ytm-shorts-lockup-view-model',
  'ytd-guide-entry-renderer:has(a[title="Shorts"])',
  'ytd-mini-guide-entry-renderer[aria-label="Shorts"]',
] as const;

/**
 * Combined CSS selector for Shorts containers.
 */
export const SHORTS_SELECTOR = SHORTS_SELECTORS.join(', ');

/**
 * The tile's three-dot action menu button (⋮).
 */
export const TILE_MENU_BUTTON =
  'button[aria-label="More actions"], button[aria-label="Action menu"], ytd-menu-renderer yt-icon-button button, yt-icon-button#button, .yt-lockup-view-model-wiz__menu button' as const;

/**
 * Links pointing to a video (/watch?v=) or Short (/shorts/).
 */
export const VIDEO_LINK = 'a[href*="/watch?v="], a[href*="/shorts/"]' as const;

/**
 * Video title element inside a tile.
 */
export const VIDEO_TITLE =
  '#video-title-link, #video-title, .yt-lockup-view-model-wiz__title a, .yt-lockup-view-model-wiz__title, h3 a, h3' as const;

/**
 * Channel handle link (e.g. href="/@channelhandle").
 */
export const CHANNEL_HANDLE = 'a[href^="/@"]' as const;

/**
 * Channel display name element.
 */
export const CHANNEL_NAME =
  'ytd-channel-name #text, .yt-lockup-view-model-wiz__subhead a, .yt-lockup-view-model-wiz__subhead, #channel-name #text, #channel-name, ytd-channel-name, a[href^="/@"]' as const;

/**
 * Video duration badge / text overlay.
 */
export const VIDEO_DURATION =
  'ytd-thumbnail-overlay-time-status-renderer #text, span.ytd-thumbnail-overlay-time-status-renderer, .badge-shape-wiz__text, #time-status #text, ytd-thumbnail-overlay-time-status-renderer' as const;

/**
 * Attribute name used to store processed videoId on recycled tile elements.
 */
export const DATA_AC_VIDEO_ID = 'data-ac-video-id' as const;

/**
 * Selector matching tiles that have been processed with data-ac-video-id.
 */
export const PROCESSED_TILE_SELECTOR = `[${DATA_AC_VIDEO_ID}]` as const;

/**
 * YouTube SPA navigation finish event.
 */
export const YT_NAVIGATE_FINISH_EVENT = 'yt-navigate-finish' as const;

/**
 * Centralized SELECTORS object.
 */
export const SELECTORS = {
  tileRenderers: TILE_RENDERERS,
  shortsRenderers: SHORTS_RENDERERS,
  tile: TILE_SELECTOR,
  tileSelectors: TILE_SELECTORS,
  shortsContainers: SHORTS_SELECTORS,
  shorts: SHORTS_SELECTOR,
  tileMenuButton: TILE_MENU_BUTTON,
  videoLink: VIDEO_LINK,
  title: VIDEO_TITLE,
  channelHandle: CHANNEL_HANDLE,
  channelName: CHANNEL_NAME,
  duration: VIDEO_DURATION,
  videoIdAttr: DATA_AC_VIDEO_ID,
  processedTile: PROCESSED_TILE_SELECTOR,
  navigateFinishEvent: YT_NAVIGATE_FINISH_EVENT,
} as const;
