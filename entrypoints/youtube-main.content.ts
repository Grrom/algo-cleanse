/**
 * MAIN world content script for AlgoCleanse.
 * Inspects YouTube Polymer / Innertube renderer data to identify menu items
 * without relying on localized English label text.
 */

import { SELECTORS } from '../src/platforms/youtube/selectors';

interface FeedbackEndpointData {
  feedbackToken?: string;
}

interface ServiceItemData {
  icon?: { iconType?: string };
  serviceEndpoint?: { feedbackEndpoint?: FeedbackEndpointData };
  text?: { runs?: { text?: string }[] };
}

export interface MenuItemData {
  menuServiceItemRenderer?: ServiceItemData;
  icon?: { iconType?: string };
  serviceEndpoint?: { feedbackEndpoint?: FeedbackEndpointData };
  text?: { runs?: { text?: string }[] };
}

export function findMenuDataFromElement(
  el: Element | null | undefined,
): MenuItemData[] | null {
  if (!el) return null;
  const anyEl = el as unknown as Record<string, unknown>;

  const contentRenderer = anyEl.data as
    | {
        content?: {
          videoRenderer?: {
            menu?: { menuRenderer?: { items?: MenuItemData[] } };
          };
        };
        videoRenderer?: {
          menu?: { menuRenderer?: { items?: MenuItemData[] } };
        };
        menu?: { menuRenderer?: { items?: MenuItemData[] } };
        items?: MenuItemData[];
      }
    | undefined;

  if (contentRenderer?.content?.videoRenderer?.menu?.menuRenderer?.items) {
    return contentRenderer.content.videoRenderer.menu.menuRenderer.items;
  }
  if (contentRenderer?.videoRenderer?.menu?.menuRenderer?.items) {
    return contentRenderer.videoRenderer.menu.menuRenderer.items;
  }
  if (contentRenderer?.menu?.menuRenderer?.items) {
    return contentRenderer.menu.menuRenderer.items;
  }
  if (contentRenderer?.items) {
    return contentRenderer.items;
  }

  const dataHost = anyEl.__data as
    | {
        data?: {
          content?: {
            videoRenderer?: {
              menu?: { menuRenderer?: { items?: MenuItemData[] } };
            };
          };
          videoRenderer?: {
            menu?: { menuRenderer?: { items?: MenuItemData[] } };
          };
          menu?: { menuRenderer?: { items?: MenuItemData[] } };
          items?: MenuItemData[];
        };
        content?: {
          videoRenderer?: {
            menu?: { menuRenderer?: { items?: MenuItemData[] } };
          };
        };
        videoRenderer?: {
          menu?: { menuRenderer?: { items?: MenuItemData[] } };
        };
        menu?: { menuRenderer?: { items?: MenuItemData[] } };
        items?: MenuItemData[];
      }
    | undefined;

  if (dataHost?.data?.content?.videoRenderer?.menu?.menuRenderer?.items) {
    return dataHost.data.content.videoRenderer.menu.menuRenderer.items;
  }
  if (dataHost?.data?.videoRenderer?.menu?.menuRenderer?.items) {
    return dataHost.data.videoRenderer.menu.menuRenderer.items;
  }
  if (dataHost?.data?.menu?.menuRenderer?.items) {
    return dataHost.data.menu.menuRenderer.items;
  }
  if (dataHost?.data?.items) {
    return dataHost.data.items;
  }
  if (dataHost?.content?.videoRenderer?.menu?.menuRenderer?.items) {
    return dataHost.content.videoRenderer.menu.menuRenderer.items;
  }
  if (dataHost?.videoRenderer?.menu?.menuRenderer?.items) {
    return dataHost.videoRenderer.menu.menuRenderer.items;
  }
  if (dataHost?.menu?.menuRenderer?.items) {
    return dataHost.menu.menuRenderer.items;
  }
  if (dataHost?.items) {
    return dataHost.items;
  }

  return null;
}

export function classifyMenuItem(
  itemData: MenuItemData | undefined,
): 'not-interested' | 'dont-recommend' | null {
  if (!itemData) return null;
  const serviceItem = itemData.menuServiceItemRenderer ?? itemData;
  const iconType: string = serviceItem?.icon?.iconType ?? '';

  if (iconType === 'NOT_INTERESTED' || iconType.includes('NOT_INTERESTED')) {
    return 'not-interested';
  }

  if (
    iconType === 'REMOVE' ||
    iconType === 'DONT_RECOMMEND' ||
    iconType === 'CHANNEL_OFF' ||
    iconType === 'REMOVE_CHANNEL' ||
    iconType === 'BLOCK' ||
    iconType.includes('DONT_RECOMMEND')
  ) {
    return 'dont-recommend';
  }

  return null;
}

/**
 * Finds the currently active, open menu popup in the DOM.
 * Accepts only a dropdown that is actually open (not aria-hidden="true",
 * not display:none, or [opened]).
 */
export function getActivePopup(
  root: Document | Element = document,
): Element | null {
  const candidates = root.querySelectorAll(SELECTORS.openMenuPopup);
  for (const el of Array.from(candidates)) {
    if (el.getAttribute('aria-hidden') === 'true') continue;
    const parentDropdown = el.closest(SELECTORS.menuDropdown);
    if (
      parentDropdown &&
      parentDropdown.getAttribute('aria-hidden') === 'true'
    ) {
      continue;
    }

    const htmlEl = el as HTMLElement;
    if (htmlEl.style?.display === 'none') continue;
    const parentHtmlEl = parentDropdown as HTMLElement | null;
    if (parentHtmlEl?.style?.display === 'none') continue;

    if (el.matches(SELECTORS.menuPopupRenderer)) {
      return el;
    }
    const innerRenderer = el.querySelector(SELECTORS.menuPopupRenderer);
    if (innerRenderer) return innerRenderer;
    return el;
  }

  return null;
}

export function getTopLevelMenuItems(popup: Element): Element[] {
  const all = Array.from(popup.querySelectorAll(SELECTORS.menuPopupItems));
  return all.filter((el) => {
    return !el.parentElement?.closest(SELECTORS.menuPopupItems);
  });
}

/**
 * Validates that the items in the open popup belong to this tile by comparing
 * each item's renderer data against findMenuDataFromElement(tile):
 * same length, and same iconType at each index, or object identity with items[i].menuServiceItemRenderer.
 */
export function doPopupItemsMatchTile(
  popupItems: Element[],
  tileMenuItems: MenuItemData[] | null,
): boolean {
  if (!tileMenuItems || tileMenuItems.length === 0) {
    return false;
  }
  if (popupItems.length !== tileMenuItems.length) {
    return false;
  }

  for (let i = 0; i < popupItems.length; i++) {
    const itemEl = popupItems[i]!;
    const anyItem = itemEl as unknown as Record<string, unknown>;
    const popupItemData = (anyItem.data ?? anyItem.__data) as
      MenuItemData | undefined;
    const tileItemData = tileMenuItems[i]!;

    if (!popupItemData) {
      return false;
    }

    // Check object identity
    if (
      popupItemData === tileItemData ||
      (popupItemData.menuServiceItemRenderer &&
        popupItemData.menuServiceItemRenderer ===
          tileItemData.menuServiceItemRenderer) ||
      popupItemData === tileItemData.menuServiceItemRenderer ||
      popupItemData.menuServiceItemRenderer === tileItemData
    ) {
      continue;
    }

    // Compare iconType
    const popupService = popupItemData.menuServiceItemRenderer ?? popupItemData;
    const tileService = tileItemData.menuServiceItemRenderer ?? tileItemData;

    const popupIcon = popupService?.icon?.iconType;
    const tileIcon = tileService?.icon?.iconType;

    if (popupIcon && tileIcon && popupIcon === tileIcon) {
      continue;
    }

    return false;
  }

  return true;
}

export function tagMenuElements(root: Document | Element = document): void {
  const popup =
    root instanceof Element && root.matches(SELECTORS.openMenuPopup)
      ? root
      : getActivePopup(root);
  if (!popup) return;

  // Clear any existing attributes on items first
  const allExisting = popup.querySelectorAll(SELECTORS.menuPopupItems);
  allExisting.forEach((item) => {
    item.removeAttribute(SELECTORS.itemTypeAttr);
  });

  const items = getTopLevelMenuItems(popup);

  items.forEach((item) => {
    const anyItem = item as unknown as Record<string, unknown>;
    const itemData = (anyItem.data ?? anyItem.__data) as
      MenuItemData | undefined;
    const classified = classifyMenuItem(itemData);
    if (classified) {
      item.setAttribute(SELECTORS.itemTypeAttr, classified);
    }
  });
}

export function resolveMenuForTile(resolveId: string): void {
  const tile = document.querySelector(
    `[${SELECTORS.resolveIdAttr}="${resolveId}"]`,
  );
  const tileMenuItems = tile ? findMenuDataFromElement(tile) : null;

  const dispatchResult = (status: 'ok' | 'timeout') => {
    window.dispatchEvent(
      new CustomEvent(SELECTORS.menuResolvedEvent, {
        detail: `${resolveId}:${status}`,
      }),
    );
  };

  const checkAndTag = (): boolean => {
    const popup = getActivePopup();
    if (!popup) return false;

    const items = getTopLevelMenuItems(popup);
    if (items.length === 0) return false;

    if (!doPopupItemsMatchTile(items, tileMenuItems)) {
      return false;
    }

    tagMenuElements(popup);
    return true;
  };

  if (checkAndTag()) {
    dispatchResult('ok');
    return;
  }

  const timeoutMs =
    (window as unknown as { __AC_MENU_TIMEOUT_MS__?: number })
      .__AC_MENU_TIMEOUT_MS__ ?? 1000;
  const startTime = Date.now();
  let settled = false;

  const finish = (status: 'ok' | 'timeout') => {
    if (settled) return;
    settled = true;
    observer.disconnect();
    clearInterval(timer);
    dispatchResult(status);
  };

  const observer = new MutationObserver(() => {
    if (checkAndTag()) {
      finish('ok');
    }
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
  });

  const timer = setInterval(() => {
    if (checkAndTag()) {
      finish('ok');
    } else if (Date.now() - startTime >= timeoutMs) {
      finish('timeout');
    }
  }, 20);
}

export default defineContentScript({
  matches: ['*://www.youtube.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    window.addEventListener(SELECTORS.resolveMenuEvent, (event: Event) => {
      const customEvent = event as CustomEvent<unknown>;
      const resolveId =
        typeof customEvent.detail === 'string'
          ? customEvent.detail
          : document
              .querySelector(`[${SELECTORS.resolveIdAttr}]`)
              ?.getAttribute(SELECTORS.resolveIdAttr);
      if (resolveId) {
        resolveMenuForTile(resolveId);
      }
    });

    document.addEventListener(
      'click',
      (e) => {
        const target = e.target as Element | null;
        if (target?.closest?.(SELECTORS.menuClickTarget)) {
          setTimeout(() => {
            const popup = getActivePopup();
            if (popup) {
              tagMenuElements(popup);
            }
          }, 50);
        }
      },
      true,
    );
  },
});
