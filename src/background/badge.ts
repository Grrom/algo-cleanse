import { browser } from 'wxt/browser';

export interface CollapsedCountMessage {
  type: 'COLLAPSED_COUNT';
  count: number;
}

export function isCollapsedCountMessage(
  message: unknown,
): message is CollapsedCountMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    (message as Record<string, unknown>).type === 'COLLAPSED_COUNT' &&
    'count' in message &&
    typeof (message as Record<string, unknown>).count === 'number'
  );
}

export function handleBadgeMessage(
  message: unknown,
  sender?: { tab?: { id?: number } },
): void {
  if (isCollapsedCountMessage(message)) {
    const count = message.count;
    const text = count > 0 ? String(count) : '';
    const tabId = sender?.tab?.id;
    if (tabId !== undefined) {
      browser.action.setBadgeText({ tabId, text });
    } else {
      browser.action.setBadgeText({ text });
    }
  }
}

export function initBadgeHandler(): void {
  browser.runtime.onMessage.addListener(handleBadgeMessage);
}
