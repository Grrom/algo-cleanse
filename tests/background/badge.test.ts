import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  handleBadgeMessage,
  initBadgeHandler,
  isCollapsedCountMessage,
} from '../../src/background/badge';

describe('background badge handler', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('validates collapsed count messages', () => {
    expect(isCollapsedCountMessage(null)).toBe(false);
    expect(isCollapsedCountMessage({})).toBe(false);
    expect(isCollapsedCountMessage({ type: 'OTHER' })).toBe(false);
    expect(
      isCollapsedCountMessage({ type: 'COLLAPSED_COUNT', count: '1' }),
    ).toBe(false);
    expect(isCollapsedCountMessage({ type: 'COLLAPSED_COUNT', count: 3 })).toBe(
      true,
    );
  });

  // Acceptance criterion: Toolbar badge: content script sends the collapsed count to background, which sets the tab's badge text (empty when 0)
  it('sets tab badge text when count > 0 and clears text when count is 0', async () => {
    // 1. Positive count sets badge text
    handleBadgeMessage(
      { type: 'COLLAPSED_COUNT', count: 4 },
      { tab: { id: 101 } },
    );

    const badgeText1 = await fakeBrowser.action.getBadgeText({ tabId: 101 });
    expect(badgeText1).toBe('4');

    // 2. Count 0 clears badge text to empty string
    handleBadgeMessage(
      { type: 'COLLAPSED_COUNT', count: 0 },
      { tab: { id: 101 } },
    );

    const badgeText2 = await fakeBrowser.action.getBadgeText({ tabId: 101 });
    expect(badgeText2).toBe('');
  });

  it('handles badge message without tab id', async () => {
    handleBadgeMessage({ type: 'COLLAPSED_COUNT', count: 7 });
    const badgeText = await fakeBrowser.action.getBadgeText({});
    expect(badgeText).toBe('7');
  });

  it('registers runtime.onMessage listener on initBadgeHandler', () => {
    initBadgeHandler();
    expect(fakeBrowser.runtime.onMessage.hasListeners()).toBe(true);
  });
});
