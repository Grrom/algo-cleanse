/**
 * MAIN world content script for AlgoCleanse.
 * Inspects YouTube Polymer / Innertube renderer data to identify menu item indices
 * without relying on localized English label text.
 */

interface FeedbackEndpointData {
  feedbackToken?: string;
}

interface ServiceItemData {
  icon?: { iconType?: string };
  serviceEndpoint?: { feedbackEndpoint?: FeedbackEndpointData };
  text?: { runs?: { text?: string }[] };
}

interface MenuItemData {
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
        menu?: { menuRenderer?: { items?: MenuItemData[] } };
        items?: MenuItemData[];
      }
    | undefined;

  if (contentRenderer?.content?.videoRenderer?.menu?.menuRenderer?.items) {
    return contentRenderer.content.videoRenderer.menu.menuRenderer.items;
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
        };
        menu?: { menuRenderer?: { items?: MenuItemData[] } };
        items?: MenuItemData[];
      }
    | undefined;

  if (dataHost?.data?.content?.videoRenderer?.menu?.menuRenderer?.items) {
    return dataHost.data.content.videoRenderer.menu.menuRenderer.items;
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

export function getActivePopup(
  root: Document | Element = document,
): Element | null {
  const openCandidates = root.querySelectorAll(
    'ytd-menu-popup-renderer[opened], tp-yt-iron-dropdown:not([aria-hidden="true"]), tp-yt-iron-dropdown[opened]',
  );
  for (const el of Array.from(openCandidates)) {
    if (el.tagName.toLowerCase() === 'ytd-menu-popup-renderer') {
      return el;
    }
    const innerRenderer = el.querySelector('ytd-menu-popup-renderer');
    if (innerRenderer) return innerRenderer;
    return el;
  }

  const anyPopup = root.querySelector(
    'ytd-popup-container ytd-menu-popup-renderer, ytd-menu-popup-renderer',
  );
  if (anyPopup) return anyPopup;

  const dropdown = root.querySelector(
    'tp-yt-iron-dropdown, ytd-popup-container',
  );
  if (dropdown) return dropdown;

  if (
    root.querySelector(
      'ytd-menu-service-item-renderer, ytd-menu-navigation-item-renderer, yt-list-item-view-model',
    )
  ) {
    return root instanceof Element ? root : root.body || root.documentElement;
  }

  return null;
}

export function getTopLevelMenuItems(root: Element): Element[] {
  const all = Array.from(
    root.querySelectorAll(
      'ytd-menu-service-item-renderer, ytd-menu-navigation-item-renderer, yt-list-item-view-model, tp-yt-paper-item',
    ),
  );
  return all.filter((el) => {
    return !el.parentElement?.closest(
      'ytd-menu-service-item-renderer, ytd-menu-navigation-item-renderer, yt-list-item-view-model',
    );
  });
}

export function tagMenuElements(root: Document | Element = document): void {
  // Clear any existing attributes on items first
  const allExisting = root.querySelectorAll(
    'ytd-menu-service-item-renderer, ytd-menu-navigation-item-renderer, tp-yt-paper-item, yt-list-item-view-model',
  );
  allExisting.forEach((item) => {
    item.removeAttribute('data-ac-item-type');
    item.removeAttribute('data-ac-item-index');
  });

  const popup =
    root instanceof Element &&
    root.matches(
      'ytd-menu-popup-renderer, tp-yt-iron-dropdown, ytd-popup-container',
    )
      ? root
      : getActivePopup(root);
  if (!popup) return;

  const items = getTopLevelMenuItems(popup);

  items.forEach((item, index) => {
    const anyItem = item as unknown as Record<string, unknown>;
    const itemData = (anyItem.data ?? anyItem.__data) as
      MenuItemData | undefined;
    const classified = classifyMenuItem(itemData);
    if (classified) {
      item.setAttribute('data-ac-item-type', classified);
      item.setAttribute('data-ac-item-index', String(index));
    }
  });
}

export function resolveMenuForTile(resolveId: string): void {
  const tile = document.querySelector(`[data-ac-resolve-id="${resolveId}"]`);
  if (tile) {
    const menuItems = findMenuDataFromElement(tile);
    if (Array.isArray(menuItems)) {
      let notInterestedIndex = -1;
      let dontRecommendIndex = -1;

      menuItems.forEach((mItem, idx) => {
        const type = classifyMenuItem(mItem);
        if (type === 'not-interested' && notInterestedIndex === -1) {
          notInterestedIndex = idx;
        }
        if (type === 'dont-recommend' && dontRecommendIndex === -1) {
          dontRecommendIndex = idx;
        }
      });

      tile.setAttribute(
        'data-ac-menu-indices',
        JSON.stringify({ notInterestedIndex, dontRecommendIndex }),
      );
    }
  }

  const dispatchDone = () => {
    window.dispatchEvent(
      new CustomEvent('ac-menu-resolved', {
        detail: { resolveId },
      }),
    );
  };

  const checkAndTag = (): boolean => {
    const popup = getActivePopup();
    if (popup) {
      const items = getTopLevelMenuItems(popup);
      if (items.length > 0) {
        tagMenuElements(popup);
        return true;
      }
    }
    return false;
  };

  if (checkAndTag()) {
    dispatchDone();
    return;
  }

  const startTime = Date.now();
  let settled = false;

  const cleanup = () => {
    if (settled) return;
    settled = true;
    observer.disconnect();
    clearInterval(timer);
    dispatchDone();
  };

  const observer = new MutationObserver(() => {
    if (checkAndTag()) {
      cleanup();
    }
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
  });

  const timer = setInterval(() => {
    if (checkAndTag() || Date.now() - startTime >= 1000) {
      cleanup();
    }
  }, 20);
}

export default defineContentScript({
  matches: ['*://www.youtube.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    window.addEventListener('ac-resolve-menu', (event: Event) => {
      const customEvent = event as CustomEvent<{ resolveId?: string }>;
      const resolveId = customEvent.detail?.resolveId;
      if (resolveId) {
        resolveMenuForTile(resolveId);
      }
    });

    document.addEventListener(
      'click',
      (e) => {
        const target = e.target as Element | null;
        if (
          target?.closest?.(
            'ytd-menu-renderer, .yt-lockup-view-model-wiz__menu, yt-icon-button',
          )
        ) {
          setTimeout(() => tagMenuElements(document), 50);
        }
      },
      true,
    );
  },
});
