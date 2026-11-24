import { SELECTORS } from './selectors';

export type NativeFeedbackResult = 'ok' | 'unavailable' | 'failed';

/**
 * Checks whether the user is signed in by looking for YouTube's account avatar button.
 */
export function isSignedIn(): boolean {
  return document.querySelector(SELECTORS.accountAvatar) !== null;
}

function identifyMatchingItem(
  items: Element[],
  targetAction: 'not-interested' | 'dont-recommend',
): Element | null {
  // 1. Check data-ac-item-type attribute (set by MAIN world script)
  for (const item of items) {
    if (item.getAttribute(SELECTORS.itemTypeAttr) === targetAction) {
      return item;
    }
  }

  // 2. Check DOM icons and attributes on each item (strict check)
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

  // 3. Last-resort fallback: localized English text
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
  tile.setAttribute(SELECTORS.resolveIdAttr, resolveId);

  const wasCollapsed = tile.classList.contains(SELECTORS.collapsedClass);
  if (wasCollapsed) {
    tile.classList.add('ac-menu-operating');
  }

  try {
    const timeoutMs =
      (window as unknown as { __AC_FEEDBACK_TIMEOUT_MS__?: number })
        .__AC_FEEDBACK_TIMEOUT_MS__ ?? 1500;

    // 1. Prepare waiting for ac-menu-resolved reply from MAIN world script
    const resolvedPromise = new Promise<'ok' | 'timeout'>((resolve) => {
      const handler = (event: Event) => {
        const customEvent = event as CustomEvent<unknown>;
        const detail =
          typeof customEvent.detail === 'string' ? customEvent.detail : '';
        if (detail.startsWith(resolveId)) {
          window.removeEventListener(SELECTORS.menuResolvedEvent, handler);
          if (detail.endsWith(':ok')) {
            resolve('ok');
          } else {
            resolve('timeout');
          }
        }
      };
      window.addEventListener(SELECTORS.menuResolvedEvent, handler);
      setTimeout(() => {
        window.removeEventListener(SELECTORS.menuResolvedEvent, handler);
        resolve('timeout');
      }, timeoutMs);
    });

    // 2. Open the tile menu (single click)
    menuButton.click();

    // 3. Dispatch ac-resolve-menu with resolveId as a primitive string
    window.dispatchEvent(
      new CustomEvent(SELECTORS.resolveMenuEvent, {
        detail: resolveId,
        bubbles: true,
      }),
    );

    // 4. Await response from MAIN world script
    const resolved = await resolvedPromise;
    tile.removeAttribute(SELECTORS.resolveIdAttr);
    if (resolved !== 'ok') {
      closeLeftoverPopups();
      return 'unavailable';
    }

    // 5. Query open popup container stamped with resolveId by MAIN world script
    const openPopup =
      document.querySelector(SELECTORS.resolvedPopup(resolveId)) ??
      document.querySelector(SELECTORS.openMenuPopup);
    if (!openPopup) {
      closeLeftoverPopups();
      return 'unavailable';
    }

    // 6. Query popup items scoped strictly inside the open popup
    const items = Array.from(
      openPopup.querySelectorAll(SELECTORS.menuPopupItems),
    ).filter(
      (el) =>
        !el.parentElement ||
        !el.parentElement.closest(SELECTORS.menuPopupItems),
    );
    if (items.length === 0) {
      closeLeftoverPopups();
      return 'unavailable';
    }

    // 7. Identify the matching item from renderer data tags
    const matchedItem = identifyMatchingItem(items, action);
    if (!matchedItem) {
      closeLeftoverPopups();
      return 'unavailable';
    }

    // 8. Click the matched item (or its inner clickable element)
    const clickable =
      (matchedItem.querySelector(
        SELECTORS.menuItemButton,
      ) as HTMLElement | null) ?? (matchedItem as HTMLElement);
    clickable.click();

    // 9. Close any leftover popup
    closeLeftoverPopups();

    return 'ok';
  } catch (err) {
    console.error(`Error in sendFeedbackAction (${action}):`, err);
    return 'failed';
  } finally {
    tile.removeAttribute(SELECTORS.resolveIdAttr);
    const stampedPopup = document.querySelector(
      SELECTORS.resolvedPopup(resolveId),
    );
    stampedPopup?.removeAttribute(SELECTORS.resolveIdAttr);
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
