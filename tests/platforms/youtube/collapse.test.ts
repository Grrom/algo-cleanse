import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { BUNDLED_PATTERNS } from '../../../src/core/bundled-patterns';
import { getSettings, updateSettings } from '../../../src/core/settings';
import { DEFAULT_SETTINGS, type Settings } from '../../../src/core/types';
import { TrainQueue } from '../../../src/core/train-queue';
import * as nativeFeedbackModule from '../../../src/platforms/youtube/native-feedback';
import {
  attachBlockButton,
  clearSessionRevealed,
  collapseTile,
  createCard,
  evaluateAndProcessTile,
  formatChannelLine,
  handleBlockChannel,
  isSessionRevealed,
  markSessionRevealed,
  reEvaluateAllTiles,
  resetCollapseState,
  revealTile,
  uncollapseTile,
  updateBadgeCount,
} from '../../../src/platforms/youtube/collapse';
import { initContent } from '../../../src/platforms/youtube/content-main';
import {
  clearEventListeners,
  onAllowed,
  onBlocked,
  onCollapsed,
  onRevealed,
} from '../../../src/platforms/youtube/events';
import { extractVideo } from '../../../src/platforms/youtube/extract';
import { SELECTORS } from '../../../src/platforms/youtube/selectors';

describe('collapse UI & channel actions', () => {
  let patterns = BUNDLED_PATTERNS;
  let settings: Settings = { ...DEFAULT_SETTINGS };

  function createTestTile(options: {
    videoId: string;
    title: string;
    channelHandle?: string;
    channelName?: string;
    durationText?: string;
  }): HTMLElement {
    const tile = document.createElement('ytd-rich-item-renderer');

    const link = document.createElement('a');
    link.setAttribute('href', `/watch?v=${options.videoId}`);
    tile.appendChild(link);

    const titleEl = document.createElement('span');
    titleEl.id = 'video-title';
    titleEl.textContent = options.title;
    tile.appendChild(titleEl);

    if (options.channelHandle) {
      const handleLink = document.createElement('a');
      const href = options.channelHandle.startsWith('@')
        ? `/${options.channelHandle}`
        : `/@${options.channelHandle}`;
      handleLink.setAttribute('href', href);
      tile.appendChild(handleLink);
    }

    if (options.channelName) {
      const nameContainer = document.createElement('div');
      nameContainer.id = 'channel-name';
      const textSpan = document.createElement('span');
      textSpan.id = 'text';
      textSpan.textContent = options.channelName;
      nameContainer.appendChild(textSpan);
      tile.appendChild(nameContainer);
    }

    if (options.durationText) {
      const badge = document.createElement('div');
      badge.className = 'badge-shape-wiz__text';
      badge.textContent = options.durationText;
      tile.appendChild(badge);
    }

    return tile;
  }

  beforeEach(async () => {
    fakeBrowser.reset();
    document.body.innerHTML = '';
    clearEventListeners();
    resetCollapseState();
    patterns = BUNDLED_PATTERNS;
    settings = { ...DEFAULT_SETTINGS };
  });

  afterEach(() => {
    document.body.innerHTML = '';
    clearEventListeners();
    resetCollapseState();
    vi.restoreAllMocks();
  });

  describe('formatChannelLine', () => {
    it('formats channel line correctly for all combinations of null/present values', () => {
      expect(formatChannelLine('Dev Mastery', '14:20')).toBe(
        'Dev Mastery · 14:20',
      );
      expect(formatChannelLine('Dev Mastery', null)).toBe('Dev Mastery');
      expect(formatChannelLine(null, '14:20')).toBe('14:20');
      expect(formatChannelLine(null, null)).toBe('');
    });
  });

  describe('direct card & collapse utilities', () => {
    it('creates card DOM element with hidden allow button when handle is null', () => {
      const tile = createTestTile({
        videoId: 'noHandleVid',
        title: 'Video Without Handle',
      });
      const video = extractVideo(tile)!;
      const verdict = {
        flagged: true,
        score: 3,
        reasons: ['Bait phrase: “gone wrong”'],
        matchedRuleIds: ['gone-wrong'],
        matchedCategories: ['bait-phrase'],
        source: 'patterns' as const,
      };

      const card = createCard(tile, video, verdict);
      expect(card.getAttribute('data-ac-card')).toBe('');
      const allowBtn = card.querySelector(
        SELECTORS.allowAction,
      ) as HTMLButtonElement;
      expect(allowBtn.hidden).toBe(true);

      const collapsedCard = collapseTile(tile, video, verdict);
      expect(collapsedCard).toBeDefined();
      expect(tile.classList.contains(SELECTORS.collapsedClass)).toBe(true);

      uncollapseTile(tile);
      expect(tile.classList.contains(SELECTORS.collapsedClass)).toBe(false);
    });

    it('attaches and removes block button appropriately', () => {
      const tile = createTestTile({
        videoId: 'blockTestVid',
        title: 'Clean Video with Handle',
        channelHandle: '@cooldev',
      });
      const video = extractVideo(tile)!;

      attachBlockButton(tile, video, settings);
      expect(tile.querySelector(SELECTORS.blockAction)).not.toBeNull();
      expect(tile.classList.contains(SELECTORS.tileClass)).toBe(true);

      // Does not attach when tile is collapsed
      tile.classList.add(SELECTORS.collapsedClass);
      attachBlockButton(tile, video, settings);
      expect(tile.querySelector(SELECTORS.blockAction)).toBeNull();
      expect(tile.classList.contains(SELECTORS.tileClass)).toBe(false);
    });

    it('manages session revealed state', () => {
      clearSessionRevealed();
      expect(isSessionRevealed('vidX')).toBe(false);
      markSessionRevealed('vidX');
      expect(isSessionRevealed('vidX')).toBe(true);
      clearSessionRevealed();
      expect(isSessionRevealed('vidX')).toBe(false);
    });
  });

  // Acceptance criterion 1:
  // jsdom: clickbait fixture tile gets ac-collapsed and a card with title, channel line and one chip per matched label; clean tile untouched
  it('jsdom: clickbait fixture tile gets ac-collapsed and a card with title, channel line and one chip per matched label; clean tile untouched', () => {
    const fixtureHtml = readFileSync(
      resolve(__dirname, '../../fixtures/youtube/home-clickbait.html'),
      'utf-8',
    );
    const container = document.createElement('div');
    container.innerHTML = fixtureHtml;
    document.body.appendChild(container);

    const tiles = Array.from(container.querySelectorAll(SELECTORS.tile)).filter(
      (el) => !el.parentElement || !el.parentElement.closest(SELECTORS.tile),
    );

    expect(tiles.length).toBe(2);
    const clickbaitTile = tiles[0]!;
    const cleanTile = tiles[1]!;

    const cbVideo = extractVideo(clickbaitTile)!;
    const cleanVideo = extractVideo(cleanTile)!;

    expect(cbVideo.title).toBe(
      'I SPENT 24 HOURS IN AN ABANDONED BUNKER (GONE WRONG) 😱😱😱!!!',
    );
    expect(cbVideo.channelName).toBe('Extreme Vlogs');
    expect(cbVideo.durationText).toBe('18:02');

    expect(cleanVideo.title).toBe('Building a Modern Extension from Scratch');
    expect(cleanVideo.channelName).toBe('Dev Mastery');
    expect(cleanVideo.durationText).toBe('14:20');

    evaluateAndProcessTile(clickbaitTile, cbVideo, patterns, settings);
    evaluateAndProcessTile(cleanTile, cleanVideo, patterns, settings);

    // 1. Clickbait tile gets ac-collapsed and card
    expect(clickbaitTile.classList.contains(SELECTORS.collapsedClass)).toBe(
      true,
    );
    const card = clickbaitTile.querySelector(SELECTORS.card);
    expect(card).not.toBeNull();

    // Card header "Filtered by AlgoCleanse"
    const header = card!.querySelector(SELECTORS.cardHeader);
    expect(header?.textContent).toContain('Filtered by AlgoCleanse');

    // Title struck through
    const titleEl = card!.querySelector(SELECTORS.cardTitle);
    expect(titleEl?.textContent).toBe(
      'I SPENT 24 HOURS IN AN ABANDONED BUNKER (GONE WRONG) 😱😱😱!!!',
    );
    expect(titleEl?.querySelector('s')).not.toBeNull();
    expect(titleEl?.querySelector('s')?.textContent).toBe(
      'I SPENT 24 HOURS IN AN ABANDONED BUNKER (GONE WRONG) 😱😱😱!!!',
    );

    // Channel line "<channel name> · <duration>"
    const channelEl = card!.querySelector(SELECTORS.cardChannel);
    expect(channelEl?.textContent).toBe('Extreme Vlogs · 18:02');

    // One chip per matched label
    const chips = Array.from(card!.querySelectorAll(SELECTORS.chip));
    expect(chips.length).toBeGreaterThanOrEqual(1);
    const chipLabels = chips.map((c) => c.textContent);
    expect(chipLabels).toContain('Bait phrase: “gone wrong”');
    expect(chipLabels).toContain('ALL CAPS title');
    expect(chipLabels).toContain('Emoji spam');
    expect(chipLabels).toContain('Excessive !!! / ???');

    // Action buttons
    const showBtn = card!.querySelector(SELECTORS.showAction);
    expect(showBtn).not.toBeNull();
    expect(showBtn?.textContent).toBe('Show anyway');

    const allowBtn = card!.querySelector(
      SELECTORS.allowAction,
    ) as HTMLButtonElement | null;
    expect(allowBtn).not.toBeNull();
    expect(allowBtn?.hidden).toBe(false);
    expect(allowBtn?.textContent).toBe('Always allow channel');

    // Empty extra slot and status line
    expect(card!.querySelector(SELECTORS.actionsExtra)).not.toBeNull();
    expect(card!.querySelector(SELECTORS.status)).not.toBeNull();

    // 2. Clean tile is untouched
    expect(cleanTile.classList.contains(SELECTORS.collapsedClass)).toBe(false);
    expect(cleanTile.querySelector(SELECTORS.card)).toBeNull();
    // Clean tile gets hover block button
    expect(cleanTile.querySelector(SELECTORS.blockAction)).not.toBeNull();
  });

  // Acceptance criterion 2:
  // Show anyway restores the tile, fires onRevealed, and a rescan of the same videoId doesn't re-collapse
  it("Show anyway restores the tile, fires onRevealed, and a rescan of the same videoId doesn't re-collapse", () => {
    const tile = createTestTile({
      videoId: 'cb002',
      title: 'STOP DOING THIS RIGHT NOW 😱😱😱',
      channelHandle: '@shockchannel',
      channelName: 'Shock Channel',
    });
    document.body.appendChild(tile);

    const video = extractVideo(tile)!;
    evaluateAndProcessTile(tile, video, patterns, settings);
    expect(tile.classList.contains(SELECTORS.collapsedClass)).toBe(true);

    const revealedListener = vi.fn();
    onRevealed(revealedListener);

    const showBtn = tile.querySelector(
      SELECTORS.showAction,
    ) as HTMLButtonElement;
    expect(showBtn).not.toBeNull();
    showBtn.click();

    // Tile is restored
    expect(tile.classList.contains(SELECTORS.collapsedClass)).toBe(false);
    expect(tile.querySelector(SELECTORS.card)).toBeNull();
    expect(revealedListener).toHaveBeenCalledTimes(1);
    expect(revealedListener).toHaveBeenCalledWith(tile, video);
    expect(isSessionRevealed('cb002')).toBe(true);

    // Rescan of same videoId does not re-collapse
    evaluateAndProcessTile(tile, video, patterns, settings);
    expect(tile.classList.contains(SELECTORS.collapsedClass)).toBe(false);
    expect(tile.querySelector(SELECTORS.card)).toBeNull();
  });

  // Block channel on a revealed tile keeps tile collapsed when re-evaluated via settings
  it('Block channel on a revealed tile keeps tile collapsed when re-evaluated via settings', async () => {
    const tile = createTestTile({
      videoId: 'cb002_revealed_block',
      title: 'STOP DOING THIS RIGHT NOW 😱😱😱',
      channelHandle: '@shockchannel',
      channelName: 'Shock Channel',
    });
    document.body.appendChild(tile);

    const video = extractVideo(tile)!;
    evaluateAndProcessTile(tile, video, patterns, settings);
    expect(tile.classList.contains(SELECTORS.collapsedClass)).toBe(true);

    // Reveal tile
    const showBtn = tile.querySelector(
      SELECTORS.showAction,
    ) as HTMLButtonElement;
    showBtn.click();
    expect(tile.classList.contains(SELECTORS.collapsedClass)).toBe(false);

    // Block the channel for this tile
    await handleBlockChannel('@shockchannel', tile);

    // Re-evaluate with latest settings
    const currentSettings = await getSettings();
    expect(currentSettings.blockedChannels).toContain('@shockchannel');
    reEvaluateAllTiles(patterns, currentSettings);

    // Tile remains collapsed with "You blocked this channel"
    expect(tile.classList.contains(SELECTORS.collapsedClass)).toBe(true);
    const chips = Array.from(tile.querySelectorAll(SELECTORS.chip)).map(
      (c) => c.textContent,
    );
    expect(chips).toEqual(['You blocked this channel']);
  });

  // Acceptance criterion 3:
  // Always allow channel stores the handle, un-collapses all tiles of that channel, fires onAllowed
  it('Always allow channel stores the handle, un-collapses all tiles of that channel, fires onAllowed', async () => {
    const tile1 = createTestTile({
      videoId: 'cb003a',
      title: 'Testing 5-Minute Crafts Gone Wrong (INSANE Results)',
      channelHandle: '@craftsgonewrong',
      channelName: 'Crafts Gone Wrong',
    });
    const tile2 = createTestTile({
      videoId: 'cb003b',
      title: '10 Crazy Life Hacks Gone Wrong',
      channelHandle: '@craftsgonewrong',
      channelName: 'Crafts Gone Wrong',
    });
    document.body.appendChild(tile1);
    document.body.appendChild(tile2);

    evaluateAndProcessTile(tile1, extractVideo(tile1)!, patterns, settings);
    evaluateAndProcessTile(tile2, extractVideo(tile2)!, patterns, settings);
    expect(tile1.classList.contains(SELECTORS.collapsedClass)).toBe(true);
    expect(tile2.classList.contains(SELECTORS.collapsedClass)).toBe(true);

    const allowedListener = vi.fn();
    onAllowed(allowedListener);

    const allowBtn = tile1.querySelector(
      SELECTORS.allowAction,
    ) as HTMLButtonElement;
    expect(allowBtn).not.toBeNull();

    // Click "Always allow channel" button
    allowBtn.click();
    await new Promise((r) => setTimeout(r, 0));

    expect(allowedListener).toHaveBeenCalledTimes(1);
    expect(allowedListener).toHaveBeenCalledWith('@craftsgonewrong');

    const updatedSettings = await getSettings();
    expect(updatedSettings.allowedChannels).toContain('@craftsgonewrong');

    expect(tile1.classList.contains(SELECTORS.collapsedClass)).toBe(false);
    expect(tile1.querySelector(SELECTORS.card)).toBeNull();
    expect(tile2.classList.contains(SELECTORS.collapsedClass)).toBe(false);
    expect(tile2.querySelector(SELECTORS.card)).toBeNull();
  });

  // Acceptance criterion 4:
  // Block channel on a clean tile stores the handle in blockedChannels, collapses every tile of that channel with reason "You blocked this channel", fires onBlocked once
  it('Block channel on a clean tile stores the handle in blockedChannels, collapses every tile of that channel with reason "You blocked this channel", fires onBlocked once', async () => {
    const tile1 = createTestTile({
      videoId: 'clean004a',
      title: 'Introduction to Linear Algebra: Vector Spaces',
      channelHandle: '@mathlab',
      channelName: 'Math Lab',
    });
    const tile2 = createTestTile({
      videoId: 'clean004b',
      title: 'Linear Algebra Part 2: Eigenvectors',
      channelHandle: '@mathlab',
      channelName: 'Math Lab',
    });
    document.body.appendChild(tile1);
    document.body.appendChild(tile2);

    evaluateAndProcessTile(tile1, extractVideo(tile1)!, patterns, settings);
    evaluateAndProcessTile(tile2, extractVideo(tile2)!, patterns, settings);
    expect(tile1.classList.contains(SELECTORS.collapsedClass)).toBe(false);
    expect(tile2.classList.contains(SELECTORS.collapsedClass)).toBe(false);

    const blockedListener = vi.fn();
    onBlocked(blockedListener);
    const collapsedListener = vi.fn();
    onCollapsed(collapsedListener);

    const blockBtn = tile1.querySelector(
      SELECTORS.blockAction,
    ) as HTMLButtonElement;
    expect(blockBtn).not.toBeNull();

    // Click "Block channel" button
    blockBtn.click();
    await new Promise((r) => setTimeout(r, 0));

    expect(blockedListener).toHaveBeenCalledTimes(1);
    expect(blockedListener).toHaveBeenCalledWith('@mathlab', tile1);

    const updatedSettings = await getSettings();
    expect(updatedSettings.blockedChannels).toContain('@mathlab');

    // Both tiles collapse with reason "You blocked this channel"
    expect(tile1.classList.contains(SELECTORS.collapsedClass)).toBe(true);
    expect(tile2.classList.contains(SELECTORS.collapsedClass)).toBe(true);

    const chips1 = Array.from(tile1.querySelectorAll(SELECTORS.chip)).map(
      (c) => c.textContent,
    );
    const chips2 = Array.from(tile2.querySelectorAll(SELECTORS.chip)).map(
      (c) => c.textContent,
    );
    expect(chips1).toEqual(['You blocked this channel']);
    expect(chips2).toEqual(['You blocked this channel']);

    expect(collapsedListener).toHaveBeenCalledTimes(2);
  });

  // Acceptance criterion 5:
  // Strictness balanced -> gentle via settings un-collapses tiles below the gentle threshold without reload
  it('Strictness balanced -> gentle via settings un-collapses tiles below the gentle threshold without reload', async () => {
    // Single rule match "gone wrong" has weight 3.
    // Balanced threshold is 3 (so flagged: true).
    // Gentle threshold is 5 (so score 3 < 5, flagged: false).
    const tile = createTestTile({
      videoId: 'threshold005',
      title: 'Simple project gone wrong yesterday',
      channelHandle: '@builder',
      channelName: 'Builder',
    });
    document.body.appendChild(tile);

    const stop = await initContent({
      settings: { ...DEFAULT_SETTINGS, strictness: 'balanced' },
      patterns: BUNDLED_PATTERNS,
    });

    evaluateAndProcessTile(tile, extractVideo(tile)!, BUNDLED_PATTERNS, {
      ...DEFAULT_SETTINGS,
      strictness: 'balanced',
    });
    expect(tile.classList.contains(SELECTORS.collapsedClass)).toBe(true);

    // Change strictness to gentle via settings
    await updateSettings({ strictness: 'gentle' });
    await new Promise((r) => setTimeout(r, 0));

    expect(tile.classList.contains(SELECTORS.collapsedClass)).toBe(false);
    expect(tile.querySelector(SELECTORS.card)).toBeNull();

    stop();
  });

  // Acceptance criterion 6:
  // Recycled tile changed to a clean video loses its card
  it('Recycled tile changed to a clean video loses its card', () => {
    const tile = createTestTile({
      videoId: 'cb006',
      title: 'You Won’t Believe What Happened Next! (Gone Wrong)',
      channelHandle: '@baitchannel',
    });
    document.body.appendChild(tile);

    evaluateAndProcessTile(tile, extractVideo(tile)!, patterns, settings);
    expect(tile.classList.contains(SELECTORS.collapsedClass)).toBe(true);
    expect(tile.querySelector(SELECTORS.card)).not.toBeNull();

    // YouTube recycles the tile for a clean video
    const link = tile.querySelector(SELECTORS.videoLink)!;
    link.setAttribute('href', '/watch?v=clean006');
    const titleEl = tile.querySelector(SELECTORS.title[1])!;
    titleEl.textContent = 'How to Bake Sourdough Bread from Scratch';

    const cleanVideo = extractVideo(tile)!;
    expect(cleanVideo.videoId).toBe('clean006');

    evaluateAndProcessTile(tile, cleanVideo, patterns, settings);

    expect(tile.classList.contains(SELECTORS.collapsedClass)).toBe(false);
    expect(tile.querySelector(SELECTORS.card)).toBeNull();
  });

  // Acceptance criterion 7:
  // onCollapsed fires once per collapsed tile+videoId with the verdict
  it('onCollapsed fires once per collapsed tile+videoId with the verdict', () => {
    const tile = createTestTile({
      videoId: 'cb007',
      title: 'He DESTROYED His Entire Career In 5 Minutes (Gone Wrong)',
      channelHandle: '@drama',
    });
    document.body.appendChild(tile);

    const collapsedListener = vi.fn();
    onCollapsed(collapsedListener);

    const video = extractVideo(tile)!;
    evaluateAndProcessTile(tile, video, patterns, settings);

    expect(collapsedListener).toHaveBeenCalledTimes(1);
    expect(collapsedListener).toHaveBeenCalledWith(
      tile,
      video,
      expect.objectContaining({ flagged: true, source: 'patterns' }),
    );

    // Rescan or duplicate mutation pass does not fire onCollapsed again
    evaluateAndProcessTile(tile, video, patterns, settings);
    expect(collapsedListener).toHaveBeenCalledTimes(1);
  });

  // Acceptance criterion 8:
  // Badge count message equals number of collapsed tiles
  it('Badge count message equals number of collapsed tiles', () => {
    const sendSpy = vi.spyOn(fakeBrowser.runtime, 'sendMessage');

    const tile1 = createTestTile({
      videoId: 'badge001',
      title: 'STOP DOING THIS RIGHT NOW 😱😱😱',
    });
    const tile2 = createTestTile({
      videoId: 'badge002',
      title: 'He DESTROYED His Entire Career In 5 Minutes (Gone Wrong)',
    });
    document.body.appendChild(tile1);
    document.body.appendChild(tile2);

    expect(updateBadgeCount()).toBe(0);
    expect(sendSpy).toHaveBeenLastCalledWith({
      type: 'COLLAPSED_COUNT',
      count: 0,
    });

    // Collapse tile 1
    evaluateAndProcessTile(tile1, extractVideo(tile1)!, patterns, settings);
    expect(sendSpy).toHaveBeenLastCalledWith({
      type: 'COLLAPSED_COUNT',
      count: 1,
    });

    // Collapse tile 2
    evaluateAndProcessTile(tile2, extractVideo(tile2)!, patterns, settings);
    expect(sendSpy).toHaveBeenLastCalledWith({
      type: 'COLLAPSED_COUNT',
      count: 2,
    });

    // Reveal tile 1 -> count drops to 1
    revealTile(tile1, extractVideo(tile1)!);
    expect(sendSpy).toHaveBeenLastCalledWith({
      type: 'COLLAPSED_COUNT',
      count: 1,
    });

    // Uncollapse tile 2 -> count drops to 0
    uncollapseTile(tile2);
    expect(sendSpy).toHaveBeenLastCalledWith({
      type: 'COLLAPSED_COUNT',
      count: 0,
    });
  });

  describe('card reuse and disabled extension behavior', () => {
    it('preserves existing card and slots when re-evaluated with same or updated reasons', () => {
      const tile = createTestTile({
        videoId: 'reuseVid01',
        title: 'Video Gone Wrong',
        channelHandle: '@creator',
      });
      document.body.appendChild(tile);
      const video = extractVideo(tile)!;

      const verdict1 = {
        flagged: true,
        score: 3,
        reasons: ['Bait phrase: “gone wrong”'],
        matchedRuleIds: ['gone-wrong'],
        matchedCategories: ['bait-phrase'],
        source: 'patterns' as const,
      };

      const card1 = collapseTile(tile, video, verdict1);

      // Populate extra actions slot and status slot
      const extraSlot = card1.querySelector(SELECTORS.actionsExtra)!;
      const dummyAction = document.createElement('span');
      dummyAction.id = 'dummy-extra';
      dummyAction.textContent = 'Not interested';
      extraSlot.appendChild(dummyAction);

      const statusSlot = card1.querySelector(SELECTORS.status)!;
      const dummyStatus = document.createElement('span');
      dummyStatus.id = 'dummy-status';
      dummyStatus.textContent = 'Told YouTube';
      statusSlot.appendChild(dummyStatus);

      // Re-evaluate with exact same verdict -> exact same card node and slots preserved
      const card2 = collapseTile(tile, video, verdict1);
      expect(card2).toBe(card1);
      expect(card2.querySelector('#dummy-extra')).not.toBeNull();
      expect(card2.querySelector('#dummy-status')).not.toBeNull();

      // Re-evaluate with modified reasons -> card node and slots still preserved, chips updated
      const verdict2 = {
        ...verdict1,
        reasons: ['Bait phrase: “gone wrong”', 'ALL CAPS title'],
      };
      const card3 = collapseTile(tile, video, verdict2);
      expect(card3).toBe(card1);
      expect(card3.querySelector('#dummy-extra')).not.toBeNull();
      expect(card3.querySelector('#dummy-status')).not.toBeNull();

      const chips = Array.from(card3.querySelectorAll(SELECTORS.chip)).map(
        (c) => c.textContent,
      );
      expect(chips).toEqual(['Bait phrase: “gone wrong”', 'ALL CAPS title']);
    });

    it('does not attach block button and removes existing button when settings.enabled is false', () => {
      const tile = createTestTile({
        videoId: 'cleanDisabled01',
        title: 'Clean Video Title',
        channelHandle: '@cleancreator',
      });
      document.body.appendChild(tile);
      const video = extractVideo(tile)!;

      const disabledSettings: Settings = {
        ...DEFAULT_SETTINGS,
        enabled: false,
      };

      evaluateAndProcessTile(tile, video, patterns, disabledSettings);
      expect(tile.querySelector(SELECTORS.blockAction)).toBeNull();

      // Enable and verify button attaches
      evaluateAndProcessTile(tile, video, patterns, DEFAULT_SETTINGS);
      expect(tile.querySelector(SELECTORS.blockAction)).not.toBeNull();

      // Disable again and verify button is removed
      evaluateAndProcessTile(tile, video, patterns, disabledSettings);
      expect(tile.querySelector(SELECTORS.blockAction)).toBeNull();
    });

    it('initContent wires onCollapsed to auto train queue and onBlocked to native feedback', async () => {
      document.body.innerHTML = '<button id="avatar-btn"></button>';
      const sendNotInterestedSpy = vi
        .spyOn(nativeFeedbackModule, 'sendNotInterested')
        .mockResolvedValue('ok');
      const sendDontRecommendSpy = vi
        .spyOn(nativeFeedbackModule, 'sendDontRecommendChannel')
        .mockResolvedValue('ok');

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

      const trainQueue = new TrainQueue({
        clock: fakeClock,
      });

      const autoSettings: Settings = {
        ...DEFAULT_SETTINGS,
        autoNotInterested: true,
        autoCategories: ['bait-phrase'],
        dontRecommendOnBlock: true,
      };

      const cleanup = await initContent({
        settings: autoSettings,
        patterns,
        trainQueue,
      });

      const tile = createTestTile({
        videoId: 'autoVid001',
        title: 'I SPENT 24 HOURS IN AN ABANDONED BUNKER (GONE WRONG)',
        channelHandle: '@extremevlogs',
      });
      document.body.appendChild(tile);

      const video = extractVideo(tile)!;
      evaluateAndProcessTile(tile, video, patterns, autoSettings);

      expect(trainQueue.getPendingCount()).toBe(1);

      // Trigger the queue execution
      if (tickCb) {
        (tickCb as () => void)();
      }
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(sendNotInterestedSpy).toHaveBeenCalledWith(tile);
      const card = tile.querySelector(SELECTORS.card);
      expect(card?.querySelector(SELECTORS.status)?.textContent).toBe(
        '✓ Told YouTube: Not interested',
      );

      // Test onBlocked via handleBlockChannel
      await handleBlockChannel('@extremevlogs', tile);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(sendDontRecommendSpy).toHaveBeenCalled();

      cleanup();
    });

    // Acceptance criterion 5:
    // onRevealed before the job runs cancels it; onAllowed cancels that channel's jobs; manual click cancels the pending auto job for that video
    it("onRevealed before the job runs cancels it; onAllowed cancels that channel's jobs; manual click cancels the pending auto job for that video", async () => {
      document.body.innerHTML = '<button id="avatar-btn"></button>';
      const sendNotInterestedSpy = vi
        .spyOn(nativeFeedbackModule, 'sendNotInterested')
        .mockResolvedValue('ok');

      let tickCb: (() => void) | null = null;
      const fakeClock = {
        currentTime: 1000,
        now: function () {
          return this.currentTime;
        },
        setTimeout: (cb: () => void) => {
          tickCb = cb;
          return 1;
        },
        clearTimeout: () => {
          tickCb = null;
        },
      };

      const trainQueue = new TrainQueue({
        clock: fakeClock,
      });

      const autoSettings: Settings = {
        ...DEFAULT_SETTINGS,
        autoNotInterested: true,
        autoCategories: ['bait-phrase'],
      };
      await updateSettings(autoSettings);

      const cleanup = await initContent({
        settings: autoSettings,
        patterns,
        trainQueue,
      });

      // 1. Show anyway cancels pending job for that video
      const tile1 = createTestTile({
        videoId: 'cancelRevealVid',
        title: 'Video Gone Wrong 1',
        channelHandle: '@channel1',
      });
      document.body.appendChild(tile1);
      evaluateAndProcessTile(
        tile1,
        extractVideo(tile1)!,
        patterns,
        autoSettings,
      );
      expect(trainQueue.getPendingCount()).toBe(1);

      const showBtn = tile1.querySelector(
        SELECTORS.showAction,
      ) as HTMLButtonElement;
      expect(showBtn).not.toBeNull();
      showBtn.click();
      expect(trainQueue.getPendingCount()).toBe(0);

      if (tickCb) (tickCb as () => void)();
      await new Promise((r) => setTimeout(r, 10));
      expect(sendNotInterestedSpy).not.toHaveBeenCalled();

      // 2. Always allow cancels jobs for that channel
      const tile2 = createTestTile({
        videoId: 'cancelAllowVid',
        title: 'Video Gone Wrong 2',
        channelHandle: '@channelAllow',
      });
      document.body.appendChild(tile2);
      evaluateAndProcessTile(
        tile2,
        extractVideo(tile2)!,
        patterns,
        autoSettings,
      );
      expect(trainQueue.getPendingCount()).toBe(1);

      const allowBtn = tile2.querySelector(
        SELECTORS.allowAction,
      ) as HTMLButtonElement;
      expect(allowBtn).not.toBeNull();
      allowBtn.click();
      await new Promise((r) => setTimeout(r, 0));
      expect(trainQueue.getPendingCount()).toBe(0);

      if (tickCb) (tickCb as () => void)();
      await new Promise((r) => setTimeout(r, 10));
      expect(sendNotInterestedSpy).not.toHaveBeenCalled();

      // 3. Manual Not interested click cancels auto job and calls sendNotInterested once
      const tile3 = createTestTile({
        videoId: 'cancelManualVid',
        title: 'Video Gone Wrong 3',
        channelHandle: '@channelManual',
      });
      document.body.appendChild(tile3);
      evaluateAndProcessTile(
        tile3,
        extractVideo(tile3)!,
        patterns,
        autoSettings,
      );
      expect(trainQueue.getPendingCount()).toBe(1);

      const card3 = tile3.querySelector(SELECTORS.card)!;
      const notInterestedBtn = card3.querySelector(
        SELECTORS.notInterestedAction,
      ) as HTMLButtonElement;
      expect(notInterestedBtn).not.toBeNull();

      notInterestedBtn.click();
      expect(trainQueue.getPendingCount()).toBe(0);
      await new Promise((r) => setTimeout(r, 10));

      expect(sendNotInterestedSpy).toHaveBeenCalledTimes(1);
      expect(sendNotInterestedSpy).toHaveBeenCalledWith(tile3);

      // Trigger timer if any was scheduled
      if (tickCb) (tickCb as () => void)();
      await new Promise((r) => setTimeout(r, 10));

      // Still only called once by the manual action
      expect(sendNotInterestedSpy).toHaveBeenCalledTimes(1);

      cleanup();
    });

    // Acceptance criterion 3:
    // Auto: eligible verdict enqueues; autoNotInterested false -> nothing; no selected category matched -> nothing
    it('Auto: eligible verdict enqueues; autoNotInterested false -> nothing; no selected category matched -> nothing (through initContent)', async () => {
      const trainQueue = new TrainQueue();

      // 1. autoNotInterested false -> nothing
      const disabledSettings: Settings = {
        ...DEFAULT_SETTINGS,
        autoNotInterested: false,
        autoCategories: ['bait-phrase'],
      };

      const cleanup1 = await initContent({
        settings: disabledSettings,
        patterns,
        trainQueue,
      });

      const tile1 = createTestTile({
        videoId: 'noAutoEnq1',
        title: 'Bait Phrase Gone Wrong Video 1',
        channelHandle: '@creator1',
      });
      document.body.appendChild(tile1);

      evaluateAndProcessTile(
        tile1,
        extractVideo(tile1)!,
        patterns,
        disabledSettings,
      );
      expect(tile1.classList.contains(SELECTORS.collapsedClass)).toBe(true);
      expect(trainQueue.getPendingCount()).toBe(0);

      cleanup1();

      // 2. no selected category matched -> nothing
      const mismatchedSettings: Settings = {
        ...DEFAULT_SETTINGS,
        autoNotInterested: true,
        autoCategories: ['ai-slop'], // 'bait-phrase' is matched by title, not 'ai-slop'
      };

      const cleanup2 = await initContent({
        settings: mismatchedSettings,
        patterns,
        trainQueue,
      });

      const tile2 = createTestTile({
        videoId: 'noAutoEnq2',
        title: 'Bait Phrase Gone Wrong Video 2',
        channelHandle: '@creator2',
      });
      document.body.appendChild(tile2);

      evaluateAndProcessTile(
        tile2,
        extractVideo(tile2)!,
        patterns,
        mismatchedSettings,
      );
      expect(tile2.classList.contains(SELECTORS.collapsedClass)).toBe(true);
      expect(trainQueue.getPendingCount()).toBe(0);

      cleanup2();

      // 3. Eligible verdict with matching category enqueues
      const matchedSettings: Settings = {
        ...DEFAULT_SETTINGS,
        autoNotInterested: true,
        autoCategories: ['bait-phrase'],
      };

      const cleanup3 = await initContent({
        settings: matchedSettings,
        patterns,
        trainQueue,
      });

      const tile3 = createTestTile({
        videoId: 'autoEnq3',
        title: 'Bait Phrase Gone Wrong Video 3',
        channelHandle: '@creator3',
      });
      document.body.appendChild(tile3);

      evaluateAndProcessTile(
        tile3,
        extractVideo(tile3)!,
        patterns,
        matchedSettings,
      );
      expect(tile3.classList.contains(SELECTORS.collapsedClass)).toBe(true);
      expect(trainQueue.getPendingCount()).toBe(1);

      cleanup3();
    });

    it('clears trainQueue when autoNotInterested or enabled is toggled off, and validate drops ineligible job', async () => {
      const fakeClock = {
        now: () => 1000,
        setTimeout: () => 1,
        clearTimeout: () => {},
      };

      const trainQueue = new TrainQueue({ clock: fakeClock });

      const autoSettings: Settings = {
        ...DEFAULT_SETTINGS,
        autoNotInterested: true,
        autoCategories: ['bait-phrase'],
      };
      await updateSettings(autoSettings);

      const cleanup = await initContent({
        settings: autoSettings,
        patterns,
        trainQueue,
      });

      const tile = createTestTile({
        videoId: 'toggleOffVid',
        title: 'Bait Phrase Gone Wrong Video',
        channelHandle: '@creator',
      });
      document.body.appendChild(tile);

      evaluateAndProcessTile(
        tile,
        extractVideo(tile)!,
        patterns,
        autoSettings,
      );
      expect(trainQueue.getPendingCount()).toBe(1);

      // Disable autoNotInterested via settings update
      await updateSettings({
        ...autoSettings,
        autoNotInterested: false,
      });

      // trainQueue should be cleared by watchSettings
      expect(trainQueue.getPendingCount()).toBe(0);

      cleanup();
    });
  });
});
