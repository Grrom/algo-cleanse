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
  const token: string =
    serviceItem?.serviceEndpoint?.feedbackEndpoint?.feedbackToken ?? '';

  if (
    iconType === 'NOT_INTERESTED' ||
    iconType.includes('NOT_INTERESTED') ||
    token.includes('not_interested')
  ) {
    return 'not-interested';
  }

  if (
    iconType === 'REMOVE' ||
    iconType === 'DONT_RECOMMEND' ||
    iconType === 'CHANNEL_OFF' ||
    iconType === 'REMOVE_CHANNEL' ||
    iconType === 'BLOCK' ||
    iconType.includes('DONT_RECOMMEND') ||
    token.includes('dont_recommend') ||
    token.includes('channel')
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

  // 2. Check item.data or item.__data property
  for (const item of items) {
    const anyItem = item as unknown as { data?: unknown; __data?: unknown };
    const itemData = anyItem.data ?? anyItem.__data;
    if (classifyData(itemData) === targetAction) {
      return item;
    }
  }

  // 3. Check tile's menuRenderer renderer data items index
  const tileItems = getItemsFromTileData(tile);
  if (Array.isArray(tileItems)) {
    const targetIndex = tileItems.findIndex(
      (itemData) => classifyData(itemData) === targetAction,
    );
    if (targetIndex >= 0 && items[targetIndex]) {
      return items[targetIndex];
    }
  }

  // 3b. Check data-ac-menu-indices attribute on tile
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

  // 4. Check DOM icons and attributes on each item
  for (const item of items) {
    const iconEl = item.querySelector(SELECTORS.menuItemIcon);
    const iconAttr = (iconEl?.getAttribute('icon') ?? '').toLowerCase();
    const ariaLabel = (
      item.getAttribute('aria-label') ??
      iconEl?.getAttribute('aria-label') ??
      ''
    ).toLowerCase();

    if (targetAction === 'not-interested') {
      if (
        iconAttr.includes('not_interested') ||
        iconAttr === 'not-interested' ||
        ariaLabel.includes('not_interested')
      ) {
        return item;
      }
    } else {
      if (
        iconAttr.includes('remove') ||
        iconAttr.includes('dont_recommend') ||
        iconAttr.includes('channel') ||
        ariaLabel.includes('dont_recommend') ||
        ariaLabel.includes('channel')
      ) {
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
    }),
  );

  // 2. Remove / dismiss any backdrop
  const backdrops = document.querySelectorAll(SELECTORS.menuBackdrop);
  for (const bd of Array.from(backdrops)) {
    (bd as HTMLElement).click?.();
    bd.remove();
  }

  // 3. Close open popup renderers
  const popups = document.querySelectorAll(SELECTORS.menuPopupRenderer);
  for (const popup of Array.from(popups)) {
    const closable = popup as Element & { close?: () => void };
    if (typeof closable.close === 'function') {
      closable.close();
    }
    if (popup.hasAttribute('opened')) {
      popup.removeAttribute('opened');
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

  // Temporarily make the menu button operable without visibly uncollapsing the card
  const overriddenElements: { el: HTMLElement; prevDisplay: string }[] = [];
  let curr: HTMLElement | null = menuButton;
  while (curr && curr !== tile) {
    if (curr.style.display === 'none') {
      overriddenElements.push({ el: curr, prevDisplay: curr.style.display });
      curr.style.setProperty('display', 'block', 'important');
    }
    curr = curr.parentElement;
  }

  try {
    // Notify MAIN world script to inspect and resolve menu
    window.dispatchEvent(
      new CustomEvent('ac-resolve-menu', {
        detail: { tile },
        bubbles: true,
      }),
    );

    // Open the tile menu
    menuButton.click();
    menuButton.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );

    // Small delay/microtask for popup renderers
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Find popup items (filtering out nested items)
    const items = Array.from(
      document.querySelectorAll(SELECTORS.menuPopupItems),
    ).filter(
      (el) =>
        !el.parentElement ||
        !el.parentElement.closest(SELECTORS.menuPopupItems),
    );
    if (items.length === 0) {
      return 'unavailable';
    }

    const matchedItem = identifyMatchingItem(items, tile, action);
    if (!matchedItem) {
      return 'unavailable';
    }

    // Click the matched item (or its inner clickable element)
    const clickable =
      (matchedItem.querySelector(
        SELECTORS.menuItemButton,
      ) as HTMLElement | null) ?? (matchedItem as HTMLElement);
    clickable.click();

    // Close any leftover popup
    closeLeftoverPopups();

    return 'ok';
  } catch (err) {
    console.error(`Error in sendFeedbackAction (${action}):`, err);
    return 'failed';
  } finally {
    // Restore overridden styles
    for (const { el, prevDisplay } of overriddenElements) {
      el.style.display = prevDisplay;
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
