import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { BUNDLED_PATTERNS } from '../../../src/core/bundled-patterns';
import { getSettings, updateSettings } from '../../../src/core/settings';
import { DEFAULT_SETTINGS, type Settings } from '../../../src/core/types';
import {
  attachBlockButton,
  clearSessionRevealed,
  collapseTile,
  createCard,
  evaluateAndProcessTile,
  formatChannelLine,
  handleAlwaysAllow,
  handleBlockChannel,
  isSessionRevealed,
  markSessionRevealed,
  reEvaluateAllTiles,
  resetCollapseState,
  revealTile,
  uncollapseTile,
  updateBadgeCount,
} from '../../../src/platforms/youtube/collapse';
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

      attachBlockButton(tile, video);
      expect(tile.querySelector(SELECTORS.blockAction)).not.toBeNull();

      // Does not attach when tile is collapsed
      tile.classList.add(SELECTORS.collapsedClass);
      attachBlockButton(tile, video);
      expect(tile.querySelector(SELECTORS.blockAction)).toBeNull();
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
    const clickbaitTile = createTestTile({
      videoId: 'cb001',
      title: "You Won't Believe What Happened Next! (Gone Wrong)",
      channelHandle: '@creator1',
      channelName: 'Creator One',
      durationText: '18:02',
    });

    const cleanTile = createTestTile({
      videoId: 'clean001',
      title: 'Building a REST API with Node.js and Express',
      channelHandle: '@devmastery',
      channelName: 'Dev Mastery',
      durationText: '14:20',
    });

    document.body.appendChild(clickbaitTile);
    document.body.appendChild(cleanTile);

    const cbVideo = extractVideo(clickbaitTile)!;
    const cleanVideo = extractVideo(cleanTile)!;

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
      "You Won't Believe What Happened Next! (Gone Wrong)",
    );
    expect(titleEl?.querySelector('s')).not.toBeNull();

    // Channel line "<channel name> · <duration>"
    const channelEl = card!.querySelector(SELECTORS.cardChannel);
    expect(channelEl?.textContent).toBe('Creator One · 18:02');

    // One chip per matched label
    const chips = Array.from(card!.querySelectorAll(SELECTORS.chip));
    expect(chips.length).toBe(2);
    const chipLabels = chips.map((c) => c.textContent);
    expect(chipLabels).toContain('Bait phrase: “gone wrong”');
    expect(chipLabels).toContain("Bait phrase: “you won't believe”");

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

    await handleAlwaysAllow('@craftsgonewrong');

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

    await handleBlockChannel('@mathlab', tile1);

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

    // Initial evaluation under balanced
    settings.strictness = 'balanced';
    evaluateAndProcessTile(tile, extractVideo(tile)!, patterns, settings);
    expect(tile.classList.contains(SELECTORS.collapsedClass)).toBe(true);

    // Change strictness to gentle via settings
    settings = await updateSettings({ strictness: 'gentle' });
    expect(settings.strictness).toBe('gentle');

    // Re-evaluate tiles without page reload
    reEvaluateAllTiles(patterns, settings);

    expect(tile.classList.contains(SELECTORS.collapsedClass)).toBe(false);
    expect(tile.querySelector(SELECTORS.card)).toBeNull();
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
    const sendSpy = vi.fn();
    (globalThis as unknown as { browser: unknown }).browser = {
      runtime: {
        sendMessage: sendSpy,
      },
    };

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
});
