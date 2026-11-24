import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from 'wxt/utils/storage';
import { initFeedbackHandler } from '../../../src/background/feedback';
import { BUNDLED_PATTERNS } from '../../../src/core/bundled-patterns';
import { evaluate } from '../../../src/core/engine';
import { updateSettings } from '../../../src/core/settings';
import { DEFAULT_SETTINGS, type Settings } from '../../../src/core/types';
import {
  evaluateAndProcessTile,
  handleBlockChannel,
  resetCollapseState,
  revealTile,
} from '../../../src/platforms/youtube/collapse';
import { clearEventListeners } from '../../../src/platforms/youtube/events';
import { extractVideo } from '../../../src/platforms/youtube/extract';
import { SELECTORS } from '../../../src/platforms/youtube/selectors';

describe('YouTube feedback UI and interactions', () => {
  const TEST_API_BASE = 'https://api.algocleanse.test';
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
    await storage.clear('sync');
    await storage.clear('local');
    initFeedbackHandler();
    document.body.innerHTML = '';
    clearEventListeners();
    resetCollapseState();
    patterns = BUNDLED_PATTERNS;
    settings = { ...DEFAULT_SETTINGS };
    vi.stubEnv('WXT_API_BASE_URL', TEST_API_BASE);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    clearEventListeners();
    resetCollapseState();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  // Acceptance criterion: Consent unset or denied: no feedback buttons in DOM and fetch never called
  describe('Consent unset or denied: no feedback buttons in DOM and fetch never called', () => {
    it('does not render feedback controls or call fetch when consent is unset', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      settings.feedbackConsent = 'unset';

      // 1. Collapsed tile: no feedback note below status
      const tileFlagged = createTestTile({
        videoId: 'flagged_unset_01',
        title: 'I SPENT 24 HOURS IN AN ABANDONED BUNKER (GONE WRONG) 😱😱😱!!!',
        channelHandle: '@extreme',
      });
      document.body.appendChild(tileFlagged);
      evaluateAndProcessTile(
        tileFlagged,
        extractVideo(tileFlagged)!,
        patterns,
        settings,
      );

      const card = tileFlagged.querySelector(SELECTORS.card);
      expect(card).not.toBeNull();
      expect(card?.querySelector(SELECTORS.feedbackNote)).toBeNull();

      // 2. Revealed tile (Show anyway): no Wrongly filtered? button
      revealTile(tileFlagged, extractVideo(tileFlagged)!);
      expect(
        tileFlagged.querySelector(SELECTORS.wronglyFilteredAction),
      ).toBeNull();

      // 3. Clean tile: no Clickbait? hover button
      const tileClean = createTestTile({
        videoId: 'clean_unset_01',
        title: 'Learn TypeScript in 30 minutes',
        channelHandle: '@coding',
      });
      document.body.appendChild(tileClean);
      evaluateAndProcessTile(
        tileClean,
        extractVideo(tileClean)!,
        patterns,
        settings,
      );

      expect(tileClean.querySelector(SELECTORS.clickbaitAction)).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('does not render feedback controls or call fetch when consent is denied', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      settings.feedbackConsent = 'denied';

      // 1. Collapsed tile: no feedback note
      const tileFlagged = createTestTile({
        videoId: 'flagged_denied_01',
        title: 'I SPENT 24 HOURS IN AN ABANDONED BUNKER (GONE WRONG) 😱😱😱!!!',
        channelHandle: '@extreme',
      });
      document.body.appendChild(tileFlagged);
      evaluateAndProcessTile(
        tileFlagged,
        extractVideo(tileFlagged)!,
        patterns,
        settings,
      );

      const card = tileFlagged.querySelector(SELECTORS.card);
      expect(card?.querySelector(SELECTORS.feedbackNote)).toBeNull();

      // 2. Revealed tile: no Wrongly filtered? button
      revealTile(tileFlagged, extractVideo(tileFlagged)!);
      expect(
        tileFlagged.querySelector(SELECTORS.wronglyFilteredAction),
      ).toBeNull();

      // 3. Clean tile: no Clickbait? button
      const tileClean = createTestTile({
        videoId: 'clean_denied_01',
        title: 'Introduction to Rust',
        channelHandle: '@rustacean',
      });
      document.body.appendChild(tileClean);
      evaluateAndProcessTile(
        tileClean,
        extractVideo(tileClean)!,
        patterns,
        settings,
      );

      expect(tileClean.querySelector(SELECTORS.clickbaitAction)).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  // Acceptance criterion: Granted: Wrongly filtered? sends exactly the Design payload with kind: 'false_positive'; second click does nothing
  describe("Granted: Wrongly filtered? sends exactly the Design payload with kind: 'false_positive'; second click does nothing", () => {
    it("Granted: Wrongly filtered? sends exactly the Design payload with kind: 'false_positive'; second click does nothing", async () => {
      settings.feedbackConsent = 'granted';
      await updateSettings({ feedbackConsent: 'granted' });

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(null, { status: 204 }));

      const tile = createTestTile({
        videoId: 'video_fp_101',
        title: 'TOP 10 SHOCKING MOMENTS (GONE WRONG)',
        channelHandle: '@top10channel',
      });
      document.body.appendChild(tile);

      const video = extractVideo(tile)!;
      evaluateAndProcessTile(tile, video, patterns, settings);

      // Collapsed card shows feedback note below status
      const card = tile.querySelector(SELECTORS.card);
      expect(card).not.toBeNull();
      const feedbackNote = card?.querySelector(SELECTORS.feedbackNote);
      expect(feedbackNote).not.toBeNull();
      expect(feedbackNote?.textContent).toBe(
        'Your feedback helps improve detection',
      );

      // User reveals tile (Show anyway)
      revealTile(tile, video);

      // Revealed tile shows "Wrongly filtered?" button
      const wfBtn = tile.querySelector<HTMLButtonElement>(
        SELECTORS.wronglyFilteredAction,
      );
      expect(wfBtn).not.toBeNull();
      expect(wfBtn?.textContent).toBe('Wrongly filtered?');

      // First click: sends false_positive payload
      wfBtn!.click();
      await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

      const firstCall = fetchSpy.mock.calls[0];
      expect(firstCall).toBeDefined();
      const [callUrl, callOptions] = firstCall!;
      expect(callUrl).toBe(`${TEST_API_BASE}/feedback`);
      expect(callOptions?.method).toBe('POST');
      expect(callOptions?.headers).toEqual({
        'Content-Type': 'application/json',
      });

      const parsedBody = JSON.parse(callOptions?.body as string);
      const expectedVerdict = evaluate(video, patterns, settings);
      expect(parsedBody).toEqual({
        kind: 'false_positive',
        videoId: 'video_fp_101',
        title: 'TOP 10 SHOCKING MOMENTS (GONE WRONG)',
        channelHandle: '@top10channel',
        matchedRuleIds: expectedVerdict.matchedRuleIds,
        score: expectedVerdict.score,
        strictness: 'balanced',
        patternsRevision: patterns.revision,
        extensionVersion: '0.1.0',
        browser: expect.stringMatching(/^(chrome|firefox)$/),
      });

      // Button updates to "Thanks!" and is disabled
      expect(wfBtn?.textContent).toBe('Thanks!');
      expect(wfBtn?.disabled).toBe(true);

      // Second click does nothing and does not send another request
      wfBtn!.click();
      await new Promise((r) => setTimeout(r, 20));
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Also test the session guard itself (not just the disabled attribute):
      wfBtn!.disabled = false;
      wfBtn!.click();
      await new Promise((r) => setTimeout(r, 20));
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(wfBtn?.textContent).toBe('Thanks!');
      expect(wfBtn?.disabled).toBe(true);

      // Revealing tile again in the same session keeps the button disabled with 'Thanks!'
      revealTile(tile, video);
      const reRevealedWfBtn = tile.querySelector<HTMLButtonElement>(
        SELECTORS.wronglyFilteredAction,
      );
      expect(reRevealedWfBtn?.textContent).toBe('Thanks!');
      expect(reRevealedWfBtn?.disabled).toBe(true);
      reRevealedWfBtn?.click();
      await new Promise((r) => setTimeout(r, 20));
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  // Acceptance criterion: Granted: Clickbait? sends kind: 'missed' and collapses the tile with reason "Reported by you"
  describe('Granted: Clickbait? sends kind: \'missed\' and collapses the tile with reason "Reported by you"', () => {
    it('Granted: Clickbait? sends kind: \'missed\' and collapses the tile with reason "Reported by you"', async () => {
      settings.feedbackConsent = 'granted';
      await updateSettings({ feedbackConsent: 'granted' });

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(null, { status: 204 }));

      const tile = createTestTile({
        videoId: 'video_missed_202',
        title: 'Restoring an old wooden chair',
        channelHandle: '@woodcraft',
      });
      document.body.appendChild(tile);

      const video = extractVideo(tile)!;
      evaluateAndProcessTile(tile, video, patterns, settings);

      // Clean tile is not collapsed and has hover Clickbait? button
      expect(tile.classList.contains(SELECTORS.collapsedClass)).toBe(false);
      const clickbaitBtn = tile.querySelector<HTMLButtonElement>(
        SELECTORS.clickbaitAction,
      );
      expect(clickbaitBtn).not.toBeNull();
      expect(clickbaitBtn?.textContent).toBe('Clickbait?');

      // Click "Clickbait?"
      clickbaitBtn!.click();
      await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

      // Verifies exact payload sent with kind: 'missed'
      const firstCall = fetchSpy.mock.calls[0];
      expect(firstCall).toBeDefined();
      const [callUrl, callOptions] = firstCall!;
      expect(callUrl).toBe(`${TEST_API_BASE}/feedback`);
      const parsedBody = JSON.parse(callOptions?.body as string);
      expect(parsedBody).toEqual({
        kind: 'missed',
        videoId: 'video_missed_202',
        title: 'Restoring an old wooden chair',
        channelHandle: '@woodcraft',
        matchedRuleIds: [],
        score: 0,
        strictness: 'balanced',
        patternsRevision: patterns.revision,
        extensionVersion: '0.1.0',
        browser: expect.stringMatching(/^(chrome|firefox)$/),
      });

      // Verifies tile collapses with reason "Reported by you"
      expect(tile.classList.contains(SELECTORS.collapsedClass)).toBe(true);
      const card = tile.querySelector(SELECTORS.card);
      expect(card).not.toBeNull();
      const chips = card?.querySelectorAll(SELECTORS.chip);
      expect(chips?.length).toBe(1);
      expect(chips?.[0]?.textContent).toBe('Reported by you');

      // Subsequent evaluation in the same session keeps the tile collapsed with "Reported by you"
      evaluateAndProcessTile(tile, video, patterns, settings);
      expect(tile.classList.contains(SELECTORS.collapsedClass)).toBe(true);
      const chipsAfterRescan = tile.querySelectorAll(SELECTORS.chip);
      expect(chipsAfterRescan[0]?.textContent).toBe('Reported by you');
    });
  });

  // Acceptance criterion: Revealing a tile collapsed because of a user block shows no Wrongly filtered? button and sends nothing
  describe('Revealing a tile collapsed because of a user block shows no Wrongly filtered? button and sends nothing', () => {
    it('Revealing a tile collapsed because of a user block shows no Wrongly filtered? button and sends nothing', async () => {
      settings.feedbackConsent = 'granted';
      await updateSettings({ feedbackConsent: 'granted' });
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const tile = createTestTile({
        videoId: 'video_blocked_303',
        title: 'Normal vlog about cooking',
        channelHandle: '@annoying_chef',
      });
      document.body.appendChild(tile);
      const video = extractVideo(tile)!;

      // 1. First process tile with feedbackConsent = 'granted' so currentSettings is set in collapse.ts
      evaluateAndProcessTile(tile, video, patterns, settings);
      expect(tile.classList.contains(SELECTORS.collapsedClass)).toBe(false);

      // 2. User blocks channel
      await handleBlockChannel('@annoying_chef', tile);

      // Tile is collapsed with reason "You blocked this channel"
      expect(tile.classList.contains(SELECTORS.collapsedClass)).toBe(true);
      const card = tile.querySelector(SELECTORS.card);
      expect(card?.querySelector(SELECTORS.chip)?.textContent).toBe(
        'You blocked this channel',
      );
      // Collapsed card for a user block has NO feedback note
      expect(card?.querySelector(SELECTORS.feedbackNote)).toBeNull();

      // 3. User reveals tile (Show anyway)
      revealTile(tile, video);

      // Verify uncollapsed
      expect(tile.classList.contains(SELECTORS.collapsedClass)).toBe(false);

      // Verify NO Wrongly filtered? button and NO Clickbait? button is rendered
      expect(tile.querySelector(SELECTORS.wronglyFilteredAction)).toBeNull();
      expect(tile.querySelector(SELECTORS.clickbaitAction)).toBeNull();

      // Block channel button remains present on uncollapsed tile with channel handle
      expect(tile.querySelector(SELECTORS.blockAction)).not.toBeNull();

      // Wait a tick before asserting fetch was never called
      await new Promise((r) => setTimeout(r, 20));
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('revealing a pattern-flagged tile shows Wrongly filtered? but no Clickbait?', async () => {
      settings.feedbackConsent = 'granted';
      await updateSettings({ feedbackConsent: 'granted' });
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const tile = createTestTile({
        videoId: 'video_pattern_flagged_404',
        title: 'UNBELIEVABLE EXPERIMENT (GONE WRONG) 😱',
        channelHandle: '@sensational_experiments',
      });
      document.body.appendChild(tile);
      const video = extractVideo(tile)!;
      evaluateAndProcessTile(tile, video, patterns, settings);

      expect(tile.classList.contains(SELECTORS.collapsedClass)).toBe(true);

      // Reveal tile
      revealTile(tile, video);

      expect(tile.classList.contains(SELECTORS.collapsedClass)).toBe(false);
      // Has Wrongly filtered? button
      expect(
        tile.querySelector(SELECTORS.wronglyFilteredAction),
      ).not.toBeNull();
      // Has NO Clickbait? button
      expect(tile.querySelector(SELECTORS.clickbaitAction)).toBeNull();
      // Has Block channel button
      expect(tile.querySelector(SELECTORS.blockAction)).not.toBeNull();

      await new Promise((r) => setTimeout(r, 20));
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('updates feedback note on card reuse when consent changes', async () => {
      settings.feedbackConsent = 'unset';
      await updateSettings({ feedbackConsent: 'unset' });

      const tile = createTestTile({
        videoId: 'video_reuse_card_01',
        title: 'ANOTHER CRAZY VIDEO (GONE WRONG) 😱',
        channelHandle: '@extreme',
      });
      document.body.appendChild(tile);
      const video = extractVideo(tile)!;

      // 1. Initial evaluation with unset: no feedback note
      evaluateAndProcessTile(tile, video, patterns, settings);
      const card = tile.querySelector(SELECTORS.card);
      expect(card).not.toBeNull();
      expect(card?.querySelector(SELECTORS.feedbackNote)).toBeNull();

      // 2. Change consent to granted and re-evaluate: note added to existing card
      settings.feedbackConsent = 'granted';
      await updateSettings({ feedbackConsent: 'granted' });
      evaluateAndProcessTile(tile, video, patterns, settings);
      expect(card?.querySelector(SELECTORS.feedbackNote)).not.toBeNull();
      expect(card?.querySelector(SELECTORS.feedbackNote)?.textContent).toBe(
        'Your feedback helps improve detection',
      );

      // 3. Change consent to denied and re-evaluate: note removed from existing card
      settings.feedbackConsent = 'denied';
      await updateSettings({ feedbackConsent: 'denied' });
      evaluateAndProcessTile(tile, video, patterns, settings);
      expect(card?.querySelector(SELECTORS.feedbackNote)).toBeNull();
    });
  });
});
