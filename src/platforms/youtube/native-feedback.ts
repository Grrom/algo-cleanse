import { SELECTORS } from './selectors';

export type NativeFeedbackResult = 'ok' | 'unavailable' | 'failed';

/**
 * Checks whether the user is signed in by looking for YouTube's account avatar button.
 */
export function isSignedIn(): boolean {
  return document.querySelector(SELECTORS.accountAvatar) !== null;
}

interface ServiceEndpointData {
  feedbackEndpoint?: {
    feedbackToken?: string;
  };
}

interface ItemDataShape {
  icon?: { iconType?: string };
  serviceEndpoint?: ServiceEndpointData;
  menuServiceItemRenderer?: {
    icon?: { iconType?: string };
    serviceEndpoint?: ServiceEndpointData;
  };
}

function classifyData(
  data: unknown,
): 'not-interested' | 'dont-recommend' | null {
  if (!data || typeof data !== 'object') return null;
  const anyData = data as ItemDataShape;
  const serviceItem = anyData.menuServiceItemRenderer ?? anyData;
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

function getItemsFromTileData(tile: Element): unknown[] | null {
  const anyTile = tile as unknown as {
    data?: {
      content?: {
        videoRenderer?: { menu?: { menuRenderer?: { items?: unknown[] } } };
      };
      menu?: { menuRenderer?: { items?: unknown[] } };
      items?: unknown[];
    };
    __data?: {
      data?: {
        content?: {
          videoRenderer?: { menu?: { menuRenderer?: { items?: unknown[] } } };
        };
      };
      menu?: { menuRenderer?: { items?: unknown[] } };
      items?: unknown[];
    };
  };

  const candidates = [
    anyTile.data?.content?.videoRenderer?.menu?.menuRenderer?.items,
    anyTile.data?.menu?.menuRenderer?.items,
    anyTile.__data?.data?.content?.videoRenderer?.menu?.menuRenderer?.items,
    anyTile.__data?.menu?.menuRenderer?.items,
    anyTile.data?.items,
    anyTile.__data?.items,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return null;
}

function identifyMatchingItem(
  items: Element[],
  tile: Element,
  targetAction: 'not-interested' | 'dont-recommend',
): Element | null {
  // 1. Check data-ac-item-type attribute (set by MAIN world script)
  for (const item of items) {
    if (item.getAttribute('data-ac-item-type') === targetAction) {
      return item;
    }
  }

  // 2. Check item.data or item.__data property (jsdom / shared environment fallback)
  for (const item of items) {
    const anyItem = item as unknown as { data?: unknown; __data?: unknown };
    const itemData = anyItem.data ?? anyItem.__data;
    if (classifyData(itemData) === targetAction) {
      return item;
    }
  }

  // 3. Check data-ac-menu-indices attribute on tile (set by MAIN world script)
  const attrIndices = tile.getAttribute('data-ac-menu-indices');
  if (attrIndices) {
    try {
      const parsed = JSON.parse(attrIndices) as {
        notInterestedIndex?: number;
        dontRecommendIndex?: number;
      };
      const idx =
        targetAction === 'not-interested'
          ? parsed.notInterestedIndex
          : parsed.dontRecommendIndex;
      if (typeof idx === 'number' && idx >= 0 && items[idx]) {
        return items[idx];
      }
    } catch {
      // Ignore JSON parse error
    }
  }

  // 3b. Check tile's menuRenderer renderer data items index (jsdom fallback)
  const tileItems = getItemsFromTileData(tile);
  if (Array.isArray(tileItems)) {
    const targetIndex = tileItems.findIndex(
      (itemData) => classifyData(itemData) === targetAction,
    );
    if (targetIndex >= 0 && items[targetIndex]) {
      return items[targetIndex];
    }
  }

  // 4. Check DOM icons and attributes on each item (strict check)
  for (const item of items) {
    const iconEl = item.querySelector(SELECTORS.menuItemIcon);
    const iconAttr = (iconEl?.getAttribute('icon') ?? '').toLowerCase();

    if (targetAction === 'not-interested') {
      if (iconAttr === 'not_interested' || iconAttr === 'not-interested') {
        return item;
      }
    } else {
      if (iconAttr === 'remove' || iconAttr === 'dont_recommend') {
        return item;
      }
    }
  }

  // 5. Last-resort fallback: localized English text
  for (const item of items) {
    const text = (item.textContent ?? '').trim().toLowerCase();
    if (targetAction === 'not-interested') {
      if (text.includes('not interested')) {
        return item;
      }
    } else {
      if (
        text.includes("don't recommend") ||
        text.includes('dont recommend') ||
        text.includes('do not recommend')
      ) {
        return item;
      }
    }
  }

  return null;
}

function closeLeftoverPopups(): void {
  // 1. Dispatch Escape key event
  document.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      keyCode: 27,
      bubbles: true,
      cancelable: true,
    }),
  );

  // 2. Click any backdrop without removing the node
  const backdrops = document.querySelectorAll(SELECTORS.menuBackdrop);
  for (const bd of Array.from(backdrops)) {
    (bd as HTMLElement).click?.();
  }

  // 3. Close open popup renderers using close() method
  const popups = document.querySelectorAll(SELECTORS.menuPopupRenderer);
  for (const popup of Array.from(popups)) {
    const closable = popup as Element & { close?: () => void };
    if (typeof closable.close === 'function') {
      closable.close();
    }
  }
}

/**
 * Triggers native feedback on YouTube by opening the tile's ⋮ menu,
 * identifying the matching item from renderer data, clicking it,
 * and closing any leftover popup.
 */
async function sendFeedbackAction(
  tile: Element,
  action: 'not-interested' | 'dont-recommend',
): Promise<NativeFeedbackResult> {
  if (!tile || !tile.isConnected) {
    return 'unavailable';
  }

  const menuButton = tile.querySelector(
    SELECTORS.tileMenuButton,
  ) as HTMLElement | null;
  if (!menuButton) {
    return 'unavailable';
  }

  const resolveId = `ac-res-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  tile.setAttribute('data-ac-resolve-id', resolveId);

  const wasCollapsed = tile.classList.contains(SELECTORS.collapsedClass);
  if (wasCollapsed) {
    tile.classList.add('ac-menu-operating');
  }

  try {
    // 1. Prepare waiting for ac-menu-resolved reply from MAIN world script
    const resolvedPromise = new Promise<boolean>((resolve) => {
      const handler = (event: Event) => {
        const customEvent = event as CustomEvent<{ resolveId?: string }>;
        if (customEvent.detail?.resolveId === resolveId) {
          window.removeEventListener('ac-menu-resolved', handler);
          resolve(true);
        }
      };
      window.addEventListener('ac-menu-resolved', handler);
      setTimeout(() => {
        window.removeEventListener('ac-menu-resolved', handler);
        resolve(false);
      }, 1200);
    });

    // 2. Open the tile menu (single click)
    menuButton.click();

    // 3. Dispatch ac-resolve-menu with resolveId
    window.dispatchEvent(
      new CustomEvent('ac-resolve-menu', {
        detail: { resolveId },
        bubbles: true,
      }),
    );

    // 4. Await response from MAIN world script
    const resolved = await resolvedPromise;
    if (!resolved) {
      closeLeftoverPopups();
      return 'unavailable';
    }

    // 5. Query popup items
    const items = Array.from(
      document.querySelectorAll(SELECTORS.menuPopupItems),
    ).filter(
      (el) =>
        !el.parentElement ||
        !el.parentElement.closest(SELECTORS.menuPopupItems),
    );
    if (items.length === 0) {
      closeLeftoverPopups();
      return 'unavailable';
    }

    // 6. Identify the matching item from renderer data / tags
    const matchedItem = identifyMatchingItem(items, tile, action);
    if (!matchedItem) {
      closeLeftoverPopups();
      return 'unavailable';
    }

    // 7. Click the matched item (or its inner clickable element)
    const clickable =
      (matchedItem.querySelector(
        SELECTORS.menuItemButton,
      ) as HTMLElement | null) ?? (matchedItem as HTMLElement);
    clickable.click();

    // 8. Close any leftover popup
    closeLeftoverPopups();

    return 'ok';
  } catch (err) {
    console.error(`Error in sendFeedbackAction (${action}):`, err);
    return 'failed';
  } finally {
    tile.removeAttribute('data-ac-resolve-id');
    if (wasCollapsed) {
      tile.classList.remove('ac-menu-operating');
    }
  }
}

/**
 * Sends YouTube "Not interested" native feedback for a video tile.
 */
export async function sendNotInterested(
  tile: Element,
): Promise<NativeFeedbackResult> {
  return sendFeedbackAction(tile, 'not-interested');
}

/**
 * Sends YouTube "Don't recommend channel" native feedback for a video tile.
 */
export async function sendDontRecommendChannel(
  tile: Element,
): Promise<NativeFeedbackResult> {
  return sendFeedbackAction(tile, 'dont-recommend');
}
