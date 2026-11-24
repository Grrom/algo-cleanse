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
 * Account avatar button selectors when signed in.
 * When the user is signed in to YouTube, the topbar renders an avatar button (#avatar-btn).
 */
export const ACCOUNT_AVATAR_SELECTORS = [
  'ytd-masthead #avatar-btn',
  'ytd-topbar-menu-button-renderer #avatar-btn',
  '#avatar-btn',
  'button#avatar-btn',
] as const;

export const ACCOUNT_AVATAR = ACCOUNT_AVATAR_SELECTORS.join(', ');

/**
 * YouTube menu popup container and items selectors.
 */
export const MENU_POPUP_RENDERER_SELECTORS = [
  'ytd-menu-popup-renderer',
  'tp-yt-iron-dropdown',
  'ytd-popup-container',
] as const;

export const MENU_POPUP_RENDERER = MENU_POPUP_RENDERER_SELECTORS.join(', ');

/**
 * Open menu popup container selectors.
 * Matches active open menu popup renderer inside the iron-dropdown without matching closed containers.
 */
export const OPEN_MENU_POPUP_SELECTORS = [
  'tp-yt-iron-dropdown:not([aria-hidden="true"]) ytd-menu-popup-renderer',
  'tp-yt-iron-dropdown[opened] ytd-menu-popup-renderer',
  'ytd-menu-popup-renderer[opened]',
  'tp-yt-iron-dropdown:not([aria-hidden="true"])',
  'tp-yt-iron-dropdown[opened]',
] as const;

export const OPEN_MENU_POPUP = OPEN_MENU_POPUP_SELECTORS.join(', ');

export const MENU_DROPDOWN = 'tp-yt-iron-dropdown' as const;

export const MENU_POPUP_ITEMS_SELECTORS = [
  'ytd-menu-service-item-renderer',
  'ytd-menu-navigation-item-renderer',
  'tp-yt-paper-item',
  'yt-list-item-view-model',
] as const;

export const MENU_POPUP_ITEMS = MENU_POPUP_ITEMS_SELECTORS.join(', ');

export const MENU_CLICK_TARGET_SELECTORS = [
  'ytd-menu-renderer',
  '.yt-lockup-view-model-wiz__menu',
  'yt-icon-button',
] as const;

export const MENU_CLICK_TARGET = MENU_CLICK_TARGET_SELECTORS.join(', ');

export const MENU_ITEM_BUTTON_SELECTORS = [
  'button',
  'tp-yt-paper-item',
  'yt-formatted-string',
  'a',
] as const;

export const MENU_ITEM_BUTTON = MENU_ITEM_BUTTON_SELECTORS.join(', ');

export const MENU_BACKDROP = 'tp-yt-iron-overlay-backdrop' as const;

export const MENU_ITEM_ICON = 'yt-icon, yt-icon-shape, svg' as const;

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
 * Marker class added to video tiles for positioning and styling.
 */
export const AC_TILE_CLASS = 'ac-tile' as const;
export const AC_TILE_SELECTOR = '.ac-tile' as const;

/**
 * CSS class added to collapsed video tiles.
 */
export const AC_COLLAPSED_CLASS = 'ac-collapsed' as const;

/**
 * CSS selector matching collapsed video tiles.
 */
export const AC_COLLAPSED_SELECTOR = '.ac-collapsed' as const;

/**
 * Attribute name and selector for AlgoCleanse collapsed card.
 */
export const AC_CARD_ATTR = 'data-ac-card' as const;
export const AC_CARD_SELECTOR = `[${AC_CARD_ATTR}]` as const;

/**
 * Action button attributes and selectors.
 */
export const AC_ACTION_ATTR = 'data-ac-action' as const;
export const AC_ACTION_SELECTOR = `[${AC_ACTION_ATTR}]` as const;
export const AC_SHOW_ACTION_SELECTOR = `[${AC_ACTION_ATTR}="show"]` as const;
export const AC_ALLOW_ACTION_SELECTOR = `[${AC_ACTION_ATTR}="allow"]` as const;
export const AC_BLOCK_ACTION_SELECTOR = `[${AC_ACTION_ATTR}="block"]` as const;
export const AC_NOT_INTERESTED_ACTION_SELECTOR =
  `[${AC_ACTION_ATTR}="not-interested"]` as const;
export const AC_WRONGLY_FILTERED_ACTION_SELECTOR =
  `[${AC_ACTION_ATTR}="wrongly-filtered"]` as const;
export const AC_CLICKBAIT_ACTION_SELECTOR =
  `[${AC_ACTION_ATTR}="clickbait"]` as const;

/**
 * Card feedback note attribute and selector.
 */
export const AC_FEEDBACK_NOTE_ATTR = 'data-ac-feedback-note' as const;
export const AC_FEEDBACK_NOTE_SELECTOR = `[${AC_FEEDBACK_NOTE_ATTR}]` as const;

/**
 * Tile hover actions container attribute and selector.
 */
export const AC_HOVER_ACTIONS_ATTR = 'data-ac-hover-actions' as const;
export const AC_HOVER_ACTIONS_SELECTOR = `[${AC_HOVER_ACTIONS_ATTR}]` as const;

/**
 * Actions container attribute and selector.
 */
export const AC_ACTIONS_ATTR = 'data-ac-actions' as const;
export const AC_ACTIONS_SELECTOR = `[${AC_ACTIONS_ATTR}]` as const;

/**
 * Extra actions container attribute and selector.
 */
export const AC_ACTIONS_EXTRA_ATTR = 'data-ac-actions-extra' as const;
export const AC_ACTIONS_EXTRA_SELECTOR = `[${AC_ACTIONS_EXTRA_ATTR}]` as const;

/**
 * Card status container attribute and selector.
 */
export const AC_STATUS_ATTR = 'data-ac-status' as const;
export const AC_STATUS_SELECTOR = `[${AC_STATUS_ATTR}]` as const;

/**
 * Reason chip attributes and selectors.
 */
export const AC_CHIP_ATTR = 'data-ac-chip' as const;
export const AC_CHIP_SELECTOR = `[${AC_CHIP_ATTR}]` as const;
export const AC_CHIPS_ATTR = 'data-ac-chips' as const;
export const AC_CHIPS_SELECTOR = `[${AC_CHIPS_ATTR}]` as const;

/**
 * Card elements attributes and selectors.
 */
export const AC_HEADER_ATTR = 'data-ac-header' as const;
export const AC_HEADER_SELECTOR = `[${AC_HEADER_ATTR}]` as const;
export const AC_TITLE_ATTR = 'data-ac-title' as const;
export const AC_TITLE_SELECTOR = `[${AC_TITLE_ATTR}]` as const;
export const AC_CHANNEL_ATTR = 'data-ac-channel' as const;
export const AC_CHANNEL_SELECTOR = `[${AC_CHANNEL_ATTR}]` as const;

/**
 * Attributes used during native feedback handshake.
 */
export const DATA_AC_RESOLVE_ID = 'data-ac-resolve-id' as const;
export const DATA_AC_ITEM_TYPE = 'data-ac-item-type' as const;

export const RESOLVE_ID_SELECTOR = `[${DATA_AC_RESOLVE_ID}]` as const;

export const RESOLVED_TARGET_SELECTOR = (resolveId: string) =>
  `[${DATA_AC_RESOLVE_ID}="${resolveId}"]` as const;

export const RESOLVED_POPUP_SELECTOR = (resolveId: string) =>
  `ytd-menu-popup-renderer[${DATA_AC_RESOLVE_ID}="${resolveId}"], tp-yt-iron-dropdown[${DATA_AC_RESOLVE_ID}="${resolveId}"], ytd-popup-container [${DATA_AC_RESOLVE_ID}="${resolveId}"], [${DATA_AC_RESOLVE_ID}="${resolveId}"]:not([data-ac-video-id]):not(.${AC_TILE_CLASS})` as const;

/**
 * Custom event names for isolated <-> MAIN world communication.
 */
export const AC_RESOLVE_MENU_EVENT = 'ac-resolve-menu' as const;
export const AC_MENU_RESOLVED_EVENT = 'ac-menu-resolved' as const;

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
  accountAvatar: ACCOUNT_AVATAR,
  accountAvatarSelectors: ACCOUNT_AVATAR_SELECTORS,
  menuPopupRenderer: MENU_POPUP_RENDERER,
  menuPopupRendererSelectors: MENU_POPUP_RENDERER_SELECTORS,
  openMenuPopup: OPEN_MENU_POPUP,
  openMenuPopupSelectors: OPEN_MENU_POPUP_SELECTORS,
  menuDropdown: MENU_DROPDOWN,
  menuPopupItems: MENU_POPUP_ITEMS,
  menuPopupItemsSelectors: MENU_POPUP_ITEMS_SELECTORS,
  menuClickTarget: MENU_CLICK_TARGET,
  menuClickTargetSelectors: MENU_CLICK_TARGET_SELECTORS,
  menuItemButton: MENU_ITEM_BUTTON,
  menuItemButtonSelectors: MENU_ITEM_BUTTON_SELECTORS,
  menuBackdrop: MENU_BACKDROP,
  menuItemIcon: MENU_ITEM_ICON,
  resolveIdAttr: DATA_AC_RESOLVE_ID,
  resolveIdSelector: RESOLVE_ID_SELECTOR,
  resolvedPopup: RESOLVED_POPUP_SELECTOR,
  resolveTarget: RESOLVED_TARGET_SELECTOR,
  itemTypeAttr: DATA_AC_ITEM_TYPE,
  resolveMenuEvent: AC_RESOLVE_MENU_EVENT,
  menuResolvedEvent: AC_MENU_RESOLVED_EVENT,
  videoLink: VIDEO_LINK,
  title: VIDEO_TITLE,
  channelHandle: CHANNEL_HANDLE,
  channelName: CHANNEL_NAME,
  duration: VIDEO_DURATION,
  videoIdAttr: DATA_AC_VIDEO_ID,
  prevDisplayAttr: DATA_AC_PREV_DISPLAY,
  processedTile: PROCESSED_TILE_SELECTOR,
  navigateFinishEvent: YT_NAVIGATE_FINISH_EVENT,
  tileClass: AC_TILE_CLASS,
  tileMarker: AC_TILE_SELECTOR,
  collapsedClass: AC_COLLAPSED_CLASS,
  collapsedSelector: AC_COLLAPSED_SELECTOR,
  cardAttr: AC_CARD_ATTR,
  card: AC_CARD_SELECTOR,
  actionAttr: AC_ACTION_ATTR,
  action: AC_ACTION_SELECTOR,
  showAction: AC_SHOW_ACTION_SELECTOR,
  allowAction: AC_ALLOW_ACTION_SELECTOR,
  blockAction: AC_BLOCK_ACTION_SELECTOR,
  notInterestedAction: AC_NOT_INTERESTED_ACTION_SELECTOR,
  wronglyFilteredAction: AC_WRONGLY_FILTERED_ACTION_SELECTOR,
  clickbaitAction: AC_CLICKBAIT_ACTION_SELECTOR,
  feedbackNoteAttr: AC_FEEDBACK_NOTE_ATTR,
  feedbackNote: AC_FEEDBACK_NOTE_SELECTOR,
  hoverActionsAttr: AC_HOVER_ACTIONS_ATTR,
  hoverActions: AC_HOVER_ACTIONS_SELECTOR,
  actionsContainerAttr: AC_ACTIONS_ATTR,
  actionsContainer: AC_ACTIONS_SELECTOR,
  actionsExtraAttr: AC_ACTIONS_EXTRA_ATTR,
  actionsExtra: AC_ACTIONS_EXTRA_SELECTOR,
  statusAttr: AC_STATUS_ATTR,
  status: AC_STATUS_SELECTOR,
  chipAttr: AC_CHIP_ATTR,
  chip: AC_CHIP_SELECTOR,
  chipsAttr: AC_CHIPS_ATTR,
  chips: AC_CHIPS_SELECTOR,
  cardHeaderAttr: AC_HEADER_ATTR,
  cardHeader: AC_HEADER_SELECTOR,
  cardTitleAttr: AC_TITLE_ATTR,
  cardTitle: AC_TITLE_SELECTOR,
  cardChannelAttr: AC_CHANNEL_ATTR,
  cardChannel: AC_CHANNEL_SELECTOR,
} as const;
