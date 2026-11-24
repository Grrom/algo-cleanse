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
 * Shorts shelf and tile containers to detect or hide (free of :has pseudo-class
 * to prevent DOM querySelector exceptions in older browser engines).
 */
export const SHORTS_CONTAINER_SELECTORS = [
  'ytd-reel-shelf-renderer',
  'ytd-rich-shelf-renderer[is-shorts]',
  'ytm-shorts-lockup-view-model',
  'ytd-reel-item-renderer',
] as const;

export const SHORTS_CONTAINER_SELECTOR = SHORTS_CONTAINER_SELECTORS.join(', ');

/**
 * Shorts navigation entries in the sidebar / mini-guide.
 * Matches by URL path (/shorts) instead of localized English label text.
 */
export const SHORTS_GUIDE_SELECTORS = [
  'ytd-guide-entry-renderer:has(a[href^="/shorts"])',
  'ytd-mini-guide-entry-renderer:has(a[href^="/shorts"])',
] as const;

/**
 * Shorts containers to hide or detect:
 * - ytd-reel-shelf-renderer: Shorts carousel / shelf on subscriptions & search
 * - ytd-rich-shelf-renderer[is-shorts]: Shorts shelf grid on the home feed
 * - ytm-shorts-lockup-view-model: individual Shorts lockup view model
 * - Shorts guide navigation entries in sidebar matching href="/shorts"
 */
export const SHORTS_SELECTORS = [
  'ytd-reel-shelf-renderer',
  'ytd-rich-shelf-renderer[is-shorts]',
  'ytm-shorts-lockup-view-model',
  'ytd-guide-entry-renderer:has(a[href^="/shorts"])',
  'ytd-mini-guide-entry-renderer:has(a[href^="/shorts"])',
] as const;

/**
 * Combined CSS selector for Shorts containers.
 */
export const SHORTS_SELECTOR = SHORTS_SELECTORS.join(', ');

/**
 * Class name applied to hidden Shorts elements.
 */
export const HIDDEN_SHORTS_CLASS = 'ac-hidden-shorts' as const;

/**
 * Selector matching elements hidden by the Shorts remover.
 */
export const HIDDEN_SHORTS_SELECTOR = '.ac-hidden-shorts' as const;

/**
 * Selector matching anchor links to Shorts videos or pages.
 */
export const SHORTS_LINK = 'a[href*="/shorts/"], a[href^="/shorts"]' as const;

/**
 * Guide navigation entry renderer elements.
 */
export const SHORTS_GUIDE_ENTRY =
  'ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer' as const;

/**
 * Direct link selector for Shorts guide entries (fallback when :has is unsupported).
 */
export const SHORTS_GUIDE_LINK =
  'ytd-guide-entry-renderer a[href^="/shorts"], ytd-mini-guide-entry-renderer a[href^="/shorts"]' as const;

/**
 * The tile's three-dot action menu button (⋮) selectors in priority order.
 * Structural button selectors take precedence so the actual <button> element is returned
 * rather than an outer custom element wrapper (e.g. yt-icon-button), without relying on
 * localized English aria-label text.
 */
export const TILE_MENU_BUTTON_SELECTORS = [
  'ytd-menu-renderer button',
  '.yt-lockup-view-model-wiz__menu button',
  'yt-icon-button button',
  'button[aria-label="Action menu"]',
  'button[aria-label="More actions"]',
] as const;

export const TILE_MENU_BUTTON = TILE_MENU_BUTTON_SELECTORS.join(', ');

/**
 * Links pointing to a video (/watch?v=) or Short (/shorts/).
 */
export const VIDEO_LINK = 'a[href*="/watch?v="], a[href*="/shorts/"]' as const;

/**
 * Video title selectors in priority order.
 * More specific title link and title elements (#video-title-link, #video-title)
 * must be evaluated before generic container elements (h3, h3 a) so that ancestor
 * elements containing badge/live text are not selected first in document order.
 */
export const VIDEO_TITLE = [
  '#video-title-link',
  '#video-title',
  '.yt-lockup-view-model-wiz__title a',
  '.yt-lockup-view-model-wiz__title',
  'h3 a',
  'h3',
] as const;

/**
 * Channel handle link (e.g. href="/@channelhandle").
 */
export const CHANNEL_HANDLE = 'a[href^="/@"]' as const;

/**
 * Channel display name selectors in priority order.
 * Specific inner text elements (#text) take precedence over outer containers
 * (ytd-channel-name) to avoid including tooltip text in the extracted channel name.
 */
export const CHANNEL_NAME = [
  'ytd-channel-name #text',
  '#channel-name #text',
  '.yt-lockup-view-model-wiz__subhead a',
  '.yt-lockup-view-model-wiz__subhead',
  'ytd-channel-name',
  '#channel-name',
  'a[href^="/@"]',
] as const;

/**
 * Video duration badge / text overlay selectors in priority order.
 */
export const VIDEO_DURATION = [
  'ytd-thumbnail-overlay-time-status-renderer #text',
  'span.ytd-thumbnail-overlay-time-status-renderer',
  '.badge-shape-wiz__text',
  '#time-status #text',
  'ytd-thumbnail-overlay-time-status-renderer',
] as const;

/**
 * Attribute name used to store processed videoId on recycled tile elements.
 */
export const DATA_AC_VIDEO_ID = 'data-ac-video-id' as const;

/**
 * Attribute name used to store previous inline display style when hiding Shorts elements.
 */
export const DATA_AC_PREV_DISPLAY = 'data-ac-prev-display' as const;

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
  shortsContainers: SHORTS_CONTAINER_SELECTORS,
  shortsContainerSelector: SHORTS_CONTAINER_SELECTOR,
  shortsShelves: SHORTS_SELECTORS,
  shorts: SHORTS_SELECTOR,
  shortsGuide: SHORTS_GUIDE_SELECTORS.join(', '),
  shortsGuideEntry: SHORTS_GUIDE_ENTRY,
  shortsGuideLink: SHORTS_GUIDE_LINK,
  shortsLink: SHORTS_LINK,
  hiddenShortsClass: HIDDEN_SHORTS_CLASS,
  hiddenShorts: HIDDEN_SHORTS_SELECTOR,
  tileMenuButton: TILE_MENU_BUTTON,
  tileMenuButtonSelectors: TILE_MENU_BUTTON_SELECTORS,
  videoLink: VIDEO_LINK,
  title: VIDEO_TITLE,
  channelHandle: CHANNEL_HANDLE,
  channelName: CHANNEL_NAME,
  duration: VIDEO_DURATION,
  videoIdAttr: DATA_AC_VIDEO_ID,
  prevDisplayAttr: DATA_AC_PREV_DISPLAY,
  processedTile: PROCESSED_TILE_SELECTOR,
  navigateFinishEvent: YT_NAVIGATE_FINISH_EVENT,
} as const;
