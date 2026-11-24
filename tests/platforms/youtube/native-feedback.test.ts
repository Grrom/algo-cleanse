import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { Verdict } from '../../../src/core/engine';
import { getDailyAutoCount } from '../../../src/core/train-queue';
import { DEFAULT_SETTINGS } from '../../../src/core/types';
import {
  collapseTile,
  createCard,
  handleManualNotInterested,
  resetCollapseState,
} from '../../../src/platforms/youtube/collapse';
import { handleBlockDontRecommend } from '../../../src/platforms/youtube/content-main';
import * as nativeFeedbackModule from '../../../src/platforms/youtube/native-feedback';
import {
  isSignedIn,
  sendDontRecommendChannel,
  sendNotInterested,
} from '../../../src/platforms/youtube/native-feedback';
import { SELECTORS } from '../../../src/platforms/youtube/selectors';

describe('native feedback & tell youtube', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    document.body.innerHTML = '';
    resetCollapseState();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    resetCollapseState();
    vi.restoreAllMocks();
  });

  // Acceptance criterion 1:
  // Manual: clicking Not interested on a collapsed card calls sendNotInterested once, shows the success status, and doesn't increment the daily auto counter
  it("Manual: clicking Not interested on a collapsed card calls sendNotInterested once, shows the success status, and doesn't increment the daily auto counter", async () => {
    // 1. User is signed in
    const avatar = document.createElement('button');
    avatar.id = 'avatar-btn';
    document.body.appendChild(avatar);
    expect(isSignedIn()).toBe(true);

    // 2. Setup video tile and card
    const tile = document.createElement('ytd-rich-item-renderer');
    const menuBtn = document.createElement('button');
    menuBtn.setAttribute('aria-label', 'Action menu');
    tile.appendChild(menuBtn);
    document.body.appendChild(tile);

    const video = {
      videoId: 'manualTestVid',
      title: 'Manual Test Video Title',
      channelHandle: '@creator',
      channelName: 'Creator',
      durationText: '10:00',
      isShort: false,
    };

    const verdict: Verdict = {
      flagged: true,
      score: 4,
      reasons: ['Bait phrase'],
      matchedRuleIds: ['gone-wrong'],
      matchedCategories: ['bait-phrase'],
      source: 'patterns',
    };

    const card = collapseTile(tile, video, verdict);
    const notInterestedBtn = card.querySelector(
      SELECTORS.notInterestedAction,
    ) as HTMLButtonElement | null;
    expect(notInterestedBtn).not.toBeNull();

    // Mock sendNotInterested
    const sendSpy = vi
      .spyOn(nativeFeedbackModule, 'sendNotInterested')
      .mockResolvedValue('ok');

    const initialDailyCount = await getDailyAutoCount();
    expect(initialDailyCount).toBe(0);

    // Click Not interested button
    notInterestedBtn!.click();
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Calls sendNotInterested once
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith(tile);

    // Shows success status
    const statusEl = card.querySelector(SELECTORS.status);
    expect(statusEl?.textContent).toBe('✓ Told YouTube: Not interested');

    // Button disables
    expect(notInterestedBtn!.disabled).toBe(true);

    // Doesn't increment the daily auto counter
    const afterCount = await getDailyAutoCount();
    expect(afterCount).toBe(0);
  });

  // Acceptance criterion 2:
  // Manual button not rendered for blocklist-collapsed tiles or when not signed in
  it('Manual button not rendered for blocklist-collapsed tiles or when not signed in', () => {
    const tile = document.createElement('ytd-rich-item-renderer');
    const video = {
      videoId: 'vidBlockOrAnon',
      title: 'Some Video Title',
      channelHandle: '@blockedchannel',
      channelName: 'Blocked Channel',
      durationText: '05:00',
      isShort: false,
    };

    // Case A: Signed in, but collapsed by blocklist
    document.body.innerHTML = '<button id="avatar-btn"></button>';
    expect(isSignedIn()).toBe(true);

    const blocklistVerdict: Verdict = {
      flagged: true,
      score: 0,
      reasons: ['You blocked this channel'],
      matchedRuleIds: [],
      matchedCategories: [],
      source: 'blocklist',
    };

    const cardA = createCard(tile, video, blocklistVerdict);
    expect(cardA.querySelector(SELECTORS.notInterestedAction)).toBeNull();

    // Case B: Flagged by patterns, but NOT signed in
    document.body.innerHTML = '';
    expect(isSignedIn()).toBe(false);

    const patternVerdict: Verdict = {
      flagged: true,
      score: 3,
      reasons: ['Bait phrase'],
      matchedRuleIds: ['gone-wrong'],
      matchedCategories: ['bait-phrase'],
      source: 'patterns',
    };

    const cardB = createCard(tile, video, patternVerdict);
    expect(cardB.querySelector(SELECTORS.notInterestedAction)).toBeNull();
  });

  // Acceptance criterion 8:
  // Block with dontRecommendOnBlock true -> sendDontRecommendChannel called once; false -> not called; same handle blocked again -> not called again; no fetch to the backend in any case
  it('Block with dontRecommendOnBlock true -> sendDontRecommendChannel called once; false -> not called; same handle blocked again -> not called again; no fetch to the backend in any case', async () => {
    // 1. Setup signed-in state
    document.body.innerHTML = '<button id="avatar-btn"></button>';
    expect(isSignedIn()).toBe(true);

    const tile = document.createElement('ytd-rich-item-renderer');
    const card = document.createElement('div');
    card.setAttribute(SELECTORS.cardAttr, '');
    const statusEl = document.createElement('div');
    statusEl.setAttribute(SELECTORS.statusAttr, '');
    card.appendChild(statusEl);
    tile.appendChild(card);
    document.body.appendChild(tile);

    const sendDontRecommendSpy = vi
      .spyOn(nativeFeedbackModule, 'sendDontRecommendChannel')
      .mockResolvedValue('ok');

    const globalFetchSpy = vi.fn();
    (globalThis as unknown as { fetch: typeof globalFetchSpy }).fetch =
      globalFetchSpy;

    // A. Block with dontRecommendOnBlock: true -> called once
    await handleBlockDontRecommend('@blockchannel1', tile, {
      ...DEFAULT_SETTINGS,
      dontRecommendOnBlock: true,
    });

    expect(sendDontRecommendSpy).toHaveBeenCalledTimes(1);
    expect(sendDontRecommendSpy).toHaveBeenCalledWith(tile);
    expect(statusEl.textContent).toBe(
      "✓ Told YouTube: Don't recommend channel",
    );
    expect(globalFetchSpy).not.toHaveBeenCalled();

    // B. Same handle blocked again -> not called again
    await handleBlockDontRecommend('@blockchannel1', tile, {
      ...DEFAULT_SETTINGS,
      dontRecommendOnBlock: true,
    });
    expect(sendDontRecommendSpy).toHaveBeenCalledTimes(1);
    expect(globalFetchSpy).not.toHaveBeenCalled();

    // C. dontRecommendOnBlock: false -> not called
    await handleBlockDontRecommend('@blockchannel2', tile, {
      ...DEFAULT_SETTINGS,
      dontRecommendOnBlock: false,
    });
    expect(sendDontRecommendSpy).toHaveBeenCalledTimes(1);
    expect(globalFetchSpy).not.toHaveBeenCalled();
  });

  // Acceptance criterion 9:
  // Fixture test: sendNotInterested clicks the item identified from data, and still works with non-English labels in the fixture
  it('Fixture test: sendNotInterested clicks the item identified from data, and still works with non-English labels in the fixture', async () => {
    const fixtureHtml = readFileSync(
      resolve(__dirname, '../../fixtures/youtube/menu-non-english.html'),
      'utf-8',
    );
    document.body.innerHTML = fixtureHtml;

    const tile = document.querySelector(SELECTORS.tile)!;
    expect(tile).not.toBeNull();

    // Find popup items in French fixture
    const popupItems = Array.from(
      document.querySelectorAll(SELECTORS.menuPopupItems),
    ).filter(
      (el) =>
        !el.parentElement ||
        !el.parentElement.closest(SELECTORS.menuPopupItems),
    );
    expect(popupItems.length).toBe(3);

    const [shareItem, notInterestedItem, dontRecommendItem] = popupItems;
    expect(shareItem).toBeDefined();
    expect(notInterestedItem).toBeDefined();
    expect(dontRecommendItem).toBeDefined();

    // Set YouTube renderer data on items (with non-English text)
    (shareItem as unknown as Record<string, unknown>).data = {
      menuServiceItemRenderer: {
        icon: { iconType: 'SHARE' },
        text: { runs: [{ text: 'Partager' }] },
      },
    };
    (notInterestedItem as unknown as Record<string, unknown>).data = {
      menuServiceItemRenderer: {
        icon: { iconType: 'NOT_INTERESTED' },
        serviceEndpoint: { feedbackEndpoint: { feedbackToken: 'token_ni' } },
        text: { runs: [{ text: 'Pas intéressé' }] },
      },
    };
    (dontRecommendItem as unknown as Record<string, unknown>).data = {
      menuServiceItemRenderer: {
        icon: { iconType: 'REMOVE' },
        serviceEndpoint: { feedbackEndpoint: { feedbackToken: 'token_dr' } },
        text: { runs: [{ text: 'Ne pas recommander la chaîne' }] },
      },
    };

    const shareClick = vi.fn();
    const niClick = vi.fn();
    const drClick = vi.fn();

    shareItem!.addEventListener('click', shareClick);
    notInterestedItem!.addEventListener('click', niClick);
    dontRecommendItem!.addEventListener('click', drClick);

    // Call sendNotInterested
    const niResult = await sendNotInterested(tile);
    expect(niResult).toBe('ok');
    expect(niClick).toHaveBeenCalledTimes(1);
    expect(shareClick).not.toHaveBeenCalled();
    expect(drClick).not.toHaveBeenCalled();

    // Call sendDontRecommendChannel
    const drResult = await sendDontRecommendChannel(tile);
    expect(drResult).toBe('ok');
    expect(drClick).toHaveBeenCalledTimes(1);
    expect(shareClick).not.toHaveBeenCalled();
  });

  it('handles unavailable and failed feedback gracefully and re-enables button', async () => {
    const tile = document.createElement('div'); // Not a valid tile
    const res = await sendNotInterested(tile);
    expect(res).toBe('unavailable');

    const button = document.createElement('button');
    const card = document.createElement('div');
    const statusEl = document.createElement('div');
    statusEl.setAttribute(SELECTORS.statusAttr, '');
    card.appendChild(statusEl);

    await handleManualNotInterested(
      tile,
      {
        videoId: 'failVid',
        title: 'Title',
        channelHandle: '@h',
        channelName: 'N',
        durationText: null,
        isShort: false,
      },
      button,
      card,
    );

    expect(statusEl.textContent).toBe("Couldn't reach YouTube's menu");
    expect(button.disabled).toBe(false);
  });
});
