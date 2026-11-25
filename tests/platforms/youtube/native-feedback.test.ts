import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
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
  resetFeedbackQueue,
  sendNotInterested,
} from '../../../src/platforms/youtube/native-feedback';
import { SELECTORS } from '../../../src/platforms/youtube/selectors';

describe('native feedback & tell youtube', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    document.body.innerHTML = '';
    resetCollapseState();
    resetFeedbackQueue();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    resetCollapseState();
    resetFeedbackQueue();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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

    // Case C: Collapsed with patterns verdict, then re-collapsed with blocklist verdict -> Not interested button is removed
    document.body.innerHTML = '<button id="avatar-btn"></button>';
    const tileC = document.createElement('ytd-rich-item-renderer');
    document.body.appendChild(tileC);
    const cardC = collapseTile(tileC, video, patternVerdict);
    expect(cardC.querySelector(SELECTORS.notInterestedAction)).not.toBeNull();

    // Re-collapse the same tile with blocklist verdict (reusing existing card)
    const recardC = collapseTile(tileC, video, blocklistVerdict);
    expect(recardC).toBe(cardC);
    expect(recardC.querySelector(SELECTORS.notInterestedAction)).toBeNull();
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

    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const sendMessageSpy = vi.spyOn(browser.runtime, 'sendMessage');

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
    expect(fetchSpy).not.toHaveBeenCalled();

    // Verify no SEND_FEEDBACK message dispatched
    const sendFeedbackMessages = sendMessageSpy.mock.calls.filter(
      (args) =>
        (args[0] as unknown as Record<string, unknown>)?.type ===
        'SEND_FEEDBACK',
    );
    expect(sendFeedbackMessages).toHaveLength(0);

    // B. Same handle blocked again -> not called again
    await handleBlockDontRecommend('@blockchannel1', tile, {
      ...DEFAULT_SETTINGS,
      dontRecommendOnBlock: true,
    });
    expect(sendDontRecommendSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(
      sendMessageSpy.mock.calls.filter(
        (args) =>
          (args[0] as unknown as Record<string, unknown>)?.type ===
          'SEND_FEEDBACK',
      ),
    ).toHaveLength(0);

    // C. dontRecommendOnBlock: false -> not called
    await handleBlockDontRecommend('@blockchannel2', tile, {
      ...DEFAULT_SETTINGS,
      dontRecommendOnBlock: false,
    });
    expect(sendDontRecommendSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(
      sendMessageSpy.mock.calls.filter(
        (args) =>
          (args[0] as unknown as Record<string, unknown>)?.type ===
          'SEND_FEEDBACK',
      ),
    ).toHaveLength(0);
  });

  // Acceptance criterion 9:
  // Fixture test: sendNotInterested clicks the item identified from data, and still works with non-English labels in the fixture
  it('Fixture test: sendNotInterested clicks the item identified from data, and still works with non-English labels in the fixture', async () => {
    (globalThis as Record<string, unknown>).defineContentScript = (
      def: unknown,
    ) => def;
    const youtubeMain = (
      await import('../../../entrypoints/youtube-main.content')
    ).default;
    youtubeMain.main(
      {} as unknown as NonNullable<Parameters<typeof youtubeMain.main>[0]>,
    );

    const fixtureHtml = readFileSync(
      resolve(__dirname, '../../fixtures/youtube/menu-non-english.html'),
      'utf-8',
    );
    document.body.innerHTML = fixtureHtml;

    const tile = document.querySelector(SELECTORS.tile)!;
    expect(tile).not.toBeNull();

    const dropdown = document.querySelector(SELECTORS.menuDropdown)!;
    const popupRenderer = dropdown.querySelector(SELECTORS.menuPopupRenderer)!;
    const itemsContainer = popupRenderer.querySelector('#items')!;

    // Initial state: popup is closed with aria-hidden="true" and no opened attribute
    dropdown.setAttribute('aria-hidden', 'true');
    dropdown.removeAttribute('opened');
    popupRenderer.removeAttribute('opened');

    // 1. Initial state: popup is stamped for a DIFFERENT menu:
    // In this stale menu, item 1 carries NOT_INTERESTED
    itemsContainer.innerHTML = `
      <ytd-menu-service-item-renderer id="stale-item-0">
        <tp-yt-paper-item>
          <yt-formatted-string>Partager</yt-formatted-string>
        </tp-yt-paper-item>
      </ytd-menu-service-item-renderer>
      <ytd-menu-service-item-renderer id="stale-item-1">
        <tp-yt-paper-item>
          <yt-formatted-string>Pas intéressé (ancien)</yt-formatted-string>
        </tp-yt-paper-item>
      </ytd-menu-service-item-renderer>
    `;

    const staleItem0 = document.getElementById(
      'stale-item-0',
    ) as unknown as Record<string, unknown>;
    const staleItem1 = document.getElementById(
      'stale-item-1',
    ) as unknown as Record<string, unknown>;
    staleItem0.data = {
      menuServiceItemRenderer: {
        icon: { iconType: 'SHARE' },
        text: { runs: [{ text: 'Partager' }] },
      },
    };
    staleItem1.data = {
      menuServiceItemRenderer: {
        icon: { iconType: 'NOT_INTERESTED' },
        serviceEndpoint: { feedbackEndpoint: { feedbackToken: 'stale_ni' } },
        text: { runs: [{ text: 'Pas intéressé (ancien)' }] },
      },
    };

    const staleNiClick = vi.fn();
    (staleItem1 as unknown as HTMLElement).addEventListener(
      'click',
      staleNiClick,
    );

    // 2. Tile's actual renderer data has Not interested at index 2 (NOT index 1):
    const tileMenuData = [
      {
        menuServiceItemRenderer: {
          icon: { iconType: 'WATCH_LATER' },
          text: { runs: [{ text: 'À regarder plus tard' }] },
        },
      },
      {
        menuServiceItemRenderer: {
          icon: { iconType: 'SHARE' },
          text: { runs: [{ text: 'Partager' }] },
        },
      },
      {
        menuServiceItemRenderer: {
          icon: { iconType: 'NOT_INTERESTED' },
          serviceEndpoint: {
            feedbackEndpoint: { feedbackToken: 'tile_ni_token' },
          },
          text: { runs: [{ text: 'Pas intéressé' }] },
        },
      },
      {
        menuServiceItemRenderer: {
          icon: { iconType: 'REMOVE' },
          serviceEndpoint: {
            feedbackEndpoint: { feedbackToken: 'tile_dr_token' },
          },
          text: { runs: [{ text: 'Ne pas recommander la chaîne' }] },
        },
      },
    ];

    (tile as unknown as Record<string, unknown>).data = {
      content: {
        videoRenderer: {
          menu: {
            menuRenderer: {
              items: tileMenuData,
            },
          },
        },
      },
    };

    // 3. Attach click handler to fixture's ⋮ button:
    // after a setTimeout, re-stamps the items with this tile's data and opens the dropdown
    const menuBtn = tile.querySelector(SELECTORS.tileMenuButton) as HTMLElement;
    expect(menuBtn).not.toBeNull();

    let freshItem0: HTMLElement;
    let freshItem1: HTMLElement;
    let freshItem2: HTMLElement; // this tile's Not interested!
    let freshItem3: HTMLElement; // this tile's Don't recommend!

    const freshClick0 = vi.fn();
    const freshClick1 = vi.fn();
    const freshNiClick2 = vi.fn();
    const freshDrClick3 = vi.fn();

    menuBtn.addEventListener('click', () => {
      setTimeout(() => {
        itemsContainer.innerHTML = `
          <ytd-menu-service-item-renderer id="fresh-item-0">
            <tp-yt-paper-item>
              <yt-formatted-string>À regarder plus tard</yt-formatted-string>
            </tp-yt-paper-item>
          </ytd-menu-service-item-renderer>
          <ytd-menu-service-item-renderer id="fresh-item-1">
            <tp-yt-paper-item>
              <yt-formatted-string>Partager</yt-formatted-string>
            </tp-yt-paper-item>
          </ytd-menu-service-item-renderer>
          <ytd-menu-service-item-renderer id="fresh-item-2">
            <tp-yt-paper-item>
              <yt-formatted-string>Pas intéressé</yt-formatted-string>
            </tp-yt-paper-item>
          </ytd-menu-service-item-renderer>
          <ytd-menu-service-item-renderer id="fresh-item-3">
            <tp-yt-paper-item>
              <yt-formatted-string>Ne pas recommander la chaîne</yt-formatted-string>
            </tp-yt-paper-item>
          </ytd-menu-service-item-renderer>
        `;

        freshItem0 = document.getElementById('fresh-item-0')!;
        freshItem1 = document.getElementById('fresh-item-1')!;
        freshItem2 = document.getElementById('fresh-item-2')!;
        freshItem3 = document.getElementById('fresh-item-3')!;

        (freshItem0 as unknown as Record<string, unknown>).data =
          tileMenuData[0];
        (freshItem1 as unknown as Record<string, unknown>).data =
          tileMenuData[1];
        (freshItem2 as unknown as Record<string, unknown>).data =
          tileMenuData[2];
        (freshItem3 as unknown as Record<string, unknown>).data =
          tileMenuData[3];

        freshItem0.addEventListener('click', freshClick0);
        freshItem1.addEventListener('click', freshClick1);
        freshItem2.addEventListener('click', freshNiClick2);
        freshItem3.addEventListener('click', freshDrClick3);

        // Open dropdown
        dropdown.setAttribute('aria-hidden', 'false');
        dropdown.setAttribute('opened', '');
        popupRenderer.setAttribute('opened', '');
      }, 30);
    });

    // Call sendNotInterested
    const result = await sendNotInterested(tile);

    expect(result).toBe('ok');
    // Assert that sendNotInterested clicks the correct French item (fresh item 2),
    // and that no other item is clicked (stale item 1, fresh item 0, 1, 3).
    expect(freshNiClick2).toHaveBeenCalledTimes(1);
    expect(staleNiClick).not.toHaveBeenCalled();
    expect(freshClick0).not.toHaveBeenCalled();
    expect(freshClick1).not.toHaveBeenCalled();
    expect(freshDrClick3).not.toHaveBeenCalled();
  });

  it('returns unavailable with no click and no English-text pick when matching data is never seen', async () => {
    (
      window as unknown as { __AC_MENU_TIMEOUT_MS__?: number }
    ).__AC_MENU_TIMEOUT_MS__ = 50;
    (
      window as unknown as { __AC_FEEDBACK_TIMEOUT_MS__?: number }
    ).__AC_FEEDBACK_TIMEOUT_MS__ = 100;

    const fixtureHtml = readFileSync(
      resolve(__dirname, '../../fixtures/youtube/menu-non-english.html'),
      'utf-8',
    );
    document.body.innerHTML = fixtureHtml;

    const tile = document.querySelector(SELECTORS.tile)!;
    const dropdown = document.querySelector(SELECTORS.menuDropdown)!;
    const popupRenderer = dropdown.querySelector(SELECTORS.menuPopupRenderer)!;
    const itemsContainer = popupRenderer.querySelector('#items')!;

    // Popup is open and contains an item with English text "Not interested",
    // but the renderer data does NOT match this tile's data
    dropdown.setAttribute('aria-hidden', 'false');
    dropdown.setAttribute('opened', '');
    popupRenderer.setAttribute('opened', '');

    itemsContainer.innerHTML = `
      <ytd-menu-service-item-renderer id="unmatched-item">
        <tp-yt-paper-item>
          <yt-formatted-string>Not interested</yt-formatted-string>
        </tp-yt-paper-item>
      </ytd-menu-service-item-renderer>
    `;

    const unmatchedItem = document.getElementById(
      'unmatched-item',
    ) as unknown as Record<string, unknown>;
    unmatchedItem.data = {
      menuServiceItemRenderer: {
        icon: { iconType: 'SOME_OTHER_ACTION' },
      },
    };
    const itemClick = vi.fn();
    (unmatchedItem as unknown as HTMLElement).addEventListener(
      'click',
      itemClick,
    );

    // Tile has completely different menu data
    (tile as unknown as Record<string, unknown>).data = {
      menu: {
        menuRenderer: {
          items: [
            {
              menuServiceItemRenderer: {
                icon: { iconType: 'NOT_INTERESTED' },
              },
            },
            {
              menuServiceItemRenderer: {
                icon: { iconType: 'REMOVE' },
              },
            },
          ],
        },
      },
    };

    const result = await sendNotInterested(tile);

    // Must return 'unavailable'
    expect(result).toBe('unavailable');
    // Must NOT click the unmatched item (no click and no English-text pick!)
    expect(itemClick).not.toHaveBeenCalled();

    delete (window as unknown as { __AC_MENU_TIMEOUT_MS__?: number })
      .__AC_MENU_TIMEOUT_MS__;
    delete (window as unknown as { __AC_FEEDBACK_TIMEOUT_MS__?: number })
      .__AC_FEEDBACK_TIMEOUT_MS__;
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

  it('re-enables manual button on auto train job failure and disables on success', async () => {
    document.body.innerHTML = '<button id="avatar-btn"></button>';

    // Mock sendNotInterested to return 'unavailable'
    const sendSpy = vi
      .spyOn(nativeFeedbackModule, 'sendNotInterested')
      .mockResolvedValue('unavailable');

    let tickCb: (() => void) | null = null;
    const fakeClock = {
      now: () => 1000,
      setTimeout: (cb: () => void) => {
        tickCb = cb;
        return 1;
      },
      clearTimeout: () => {
        tickCb = null;
      },
    };

    const trainQueue = new (
      await import('../../../src/core/train-queue')
    ).TrainQueue({
      clock: fakeClock,
    });

    const { initContent } =
      await import('../../../src/platforms/youtube/content-main');
    const cleanup = await initContent({
      settings: {
        ...DEFAULT_SETTINGS,
        autoNotInterested: true,
        autoCategories: ['bait-phrase'],
      },
      trainQueue,
    });

    const tile = document.createElement('ytd-rich-item-renderer');
    const link = document.createElement('a');
    link.setAttribute('href', '/watch?v=autoFailVid');
    tile.appendChild(link);
    const titleEl = document.createElement('span');
    titleEl.id = 'video-title';
    titleEl.textContent = 'Auto Test Video Gone Wrong';
    tile.appendChild(titleEl);
    document.body.appendChild(tile);

    const video = {
      videoId: 'autoFailVid',
      title: 'Auto Test Video Gone Wrong',
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
    ) as HTMLButtonElement;
    expect(notInterestedBtn).not.toBeNull();
    expect(notInterestedBtn.disabled).toBe(false);

    expect(trainQueue.getPendingCount()).toBe(1);

    // Run the queued auto action (returns 'unavailable')
    if (tickCb) (tickCb as () => void)();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(sendSpy).toHaveBeenCalled();
    const statusEl = card.querySelector(SELECTORS.status);
    expect(statusEl?.textContent).toBe("Couldn't reach YouTube's menu");
    // Manual button must be re-enabled so user can retry!
    expect(notInterestedBtn.disabled).toBe(false);

    cleanup();
  });

  it('serializes concurrent sendFeedbackAction calls so they run one at a time sequentially', async () => {
    const tile1 = document.createElement('div');
    const tile2 = document.createElement('div');
    document.body.appendChild(tile1);
    document.body.appendChild(tile2);

    const executionOrder: string[] = [];

    // Attach menu button to tiles
    const btn1 = document.createElement('button');
    btn1.setAttribute('aria-label', 'Action menu');
    tile1.appendChild(btn1);

    const btn2 = document.createElement('button');
    btn2.setAttribute('aria-label', 'Action menu');
    tile2.appendChild(btn2);

    btn1.addEventListener('click', () => {
      executionOrder.push('start-1');
      setTimeout(() => {
        executionOrder.push('end-1');
      }, 50);
    });

    btn2.addEventListener('click', () => {
      executionOrder.push('start-2');
    });

    // Make timeout short
    (
      window as unknown as { __AC_FEEDBACK_TIMEOUT_MS__?: number }
    ).__AC_FEEDBACK_TIMEOUT_MS__ = 70;

    const p1 = sendNotInterested(tile1);
    const p2 = sendNotInterested(tile2);

    await Promise.all([p1, p2]);

    delete (window as unknown as { __AC_FEEDBACK_TIMEOUT_MS__?: number })
      .__AC_FEEDBACK_TIMEOUT_MS__;

    // start-2 should only occur after end-1
    expect(executionOrder.indexOf('start-2')).toBeGreaterThan(
      executionOrder.indexOf('end-1'),
    );
  });
});
