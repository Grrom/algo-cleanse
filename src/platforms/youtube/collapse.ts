import { evaluate, type Verdict } from '../../core/engine';
import type { Patterns } from '../../core/patterns-schema';
import {
  allowChannel,
  blockChannel,
  normalizeChannelHandle,
} from '../../core/settings';
import {
  isVideoActed,
  markVideoActed,
  type TrainQueue,
} from '../../core/train-queue';
import type { Settings, VideoInfo } from '../../core/types';
import {
  getExtensionVersion,
  getBrowserName,
  sendFeedback,
  type FeedbackPayload,
} from '../../feedback/send';
import { extractVideo } from './extract';
import { onAllowed, onBlocked, onCollapsed, onRevealed } from './events';
import {
  isSignedIn,
  resetFeedbackQueue,
  sendNotInterested,
} from './native-feedback';
import { SELECTORS } from './selectors';

const sessionRevealedVideoIds = new Set<string>();
const sessionReportedVideoIds = new Set<string>();
const sentFalsePositiveSessionVideoIds = new Set<string>();
const collapsedTileVideoMap = new WeakMap<Element, string>();
const videoInfoMap = new WeakMap<Element, VideoInfo>();
const inFlightManualSends = new Set<string>();
const lastVerdictMap = new WeakMap<Element, Verdict>();
const lastVerdictByVideoMap = new Map<string, Verdict>();
let currentSettings: Settings | null = null;
let currentPatterns: Patterns | null = null;
let lastBadgeCount: number | null = null;
let globalTrainQueue: TrainQueue | null = null;

export function setGlobalTrainQueue(queue: TrainQueue | null): void {
  globalTrainQueue = queue;
}

export function getGlobalTrainQueue(): TrainQueue | null {
  return globalTrainQueue;
}

/**
 * Handles manual Not interested button click.
 */
export async function handleManualNotInterested(
  tile: Element,
  video: VideoInfo,
  button: HTMLButtonElement,
  card: HTMLElement,
): Promise<void> {
  if (
    inFlightManualSends.has(video.videoId) ||
    getGlobalTrainQueue()?.isVideoInFlight(video.videoId)
  ) {
    return;
  }
  button.disabled = true;

  // Cancel pending auto train job for this video
  getGlobalTrainQueue()?.cancelVideo(video.videoId);

  inFlightManualSends.add(video.videoId);
  try {
    // Never act twice on the same videoId
    if (await isVideoActed(video.videoId)) {
      const statusEl = card.querySelector(SELECTORS.status);
      if (statusEl) {
        statusEl.textContent = '✓ Told YouTube: Not interested';
      }
      return;
    }

    const result = await sendNotInterested(tile);
    const statusEl = card.querySelector(SELECTORS.status);

    if (result === 'ok') {
      await markVideoActed(video.videoId);
      if (statusEl) {
        statusEl.textContent = '✓ Told YouTube: Not interested';
      }
    } else {
      if (statusEl) {
        statusEl.textContent = "Couldn't reach YouTube's menu";
      }
      button.disabled = false;
    }
  } finally {
    inFlightManualSends.delete(video.videoId);
  }
}

// Register onRevealed listener to attach Wrongly filtered? if eligible
onRevealed((tile, video) => {
  const verdict =
    lastVerdictMap.get(tile) || lastVerdictByVideoMap.get(video.videoId);
  if (
    verdict &&
    verdict.source === 'patterns' &&
    currentSettings?.feedbackConsent === 'granted'
  ) {
    attachWronglyFilteredButton(
      tile,
      video,
      verdict,
      currentSettings ?? undefined,
    );
  }
});

/**
 * Checks if a videoId has been revealed via Show anyway during this page session.
 */
export function isSessionRevealed(videoId: string): boolean {
  return sessionRevealedVideoIds.has(videoId);
}

/**
 * Marks a videoId as revealed for the current page session so rescans don't re-collapse.
 */
export function markSessionRevealed(videoId: string): void {
  sessionRevealedVideoIds.add(videoId);
}

/**
 * Clears the session revealed videoId set.
 */
export function clearSessionRevealed(): void {
  sessionRevealedVideoIds.clear();
}

/**
 * Formats the channel line text: "<channel name> · <duration>" (parts omitted when null).
 */
export function formatChannelLine(
  channelName: string | null,
  durationText: string | null,
): string {
  if (channelName && durationText) {
    return `${channelName} · ${durationText}`;
  }
  if (channelName) {
    return channelName;
  }
  if (durationText) {
    return durationText;
  }
  return '';
}

/**
 * Updates or creates the feedback note element on a collapsed card.
 */
export function updateFeedbackNote(
  card: Element,
  verdict: Verdict,
  settings: Settings | null | undefined,
): void {
  const existingNote = card.querySelector(SELECTORS.feedbackNote);
  const shouldHaveNote =
    settings?.feedbackConsent === 'granted' && verdict.source !== 'blocklist';

  if (shouldHaveNote && !existingNote) {
    const feedbackNoteEl = document.createElement('div');
    feedbackNoteEl.className = 'ac-card-feedback-note';
    feedbackNoteEl.setAttribute(SELECTORS.feedbackNoteAttr, '');
    feedbackNoteEl.textContent = 'Your feedback helps improve detection';
    card.appendChild(feedbackNoteEl);
  } else if (!shouldHaveNote && existingNote) {
    existingNote.remove();
  }
}

/**
 * Creates the AlgoCleanse collapsed card DOM element.
 */
export function createCard(
  tile: Element,
  video: VideoInfo,
  verdict: Verdict,
  settings?: Settings,
): HTMLElement {
  const card = document.createElement('div');
  card.setAttribute(SELECTORS.cardAttr, '');
  card.className = 'ac-card';

  // Header: Filtered by AlgoCleanse
  const headerEl = document.createElement('div');
  headerEl.className = 'ac-card-header';
  headerEl.setAttribute(SELECTORS.cardHeaderAttr, '');
  const dotEl = document.createElement('span');
  dotEl.className = 'ac-header-dot';
  const headerTitle = document.createElement('span');
  headerTitle.className = 'ac-header-title';
  headerTitle.textContent = 'Filtered by AlgoCleanse';
  headerEl.appendChild(dotEl);
  headerEl.appendChild(headerTitle);
  card.appendChild(headerEl);

  // Struck-through Title
  const titleEl = document.createElement('div');
  titleEl.className = 'ac-card-title';
  titleEl.setAttribute(SELECTORS.cardTitleAttr, '');
  const sEl = document.createElement('s');
  sEl.textContent = video.title ?? '';
  titleEl.appendChild(sEl);
  card.appendChild(titleEl);

  // Channel line: <channel name> · <duration> (parts omitted when null)
  const channelEl = document.createElement('div');
  channelEl.className = 'ac-card-channel';
  channelEl.setAttribute(SELECTORS.cardChannelAttr, '');
  channelEl.textContent = formatChannelLine(
    video.channelName,
    video.durationText,
  );
  card.appendChild(channelEl);

  // Reason chips: one chip per matched label
  const chipsEl = document.createElement('div');
  chipsEl.className = 'ac-card-chips';
  chipsEl.setAttribute(SELECTORS.chipsAttr, '');
  for (const reason of verdict.reasons) {
    const chip = document.createElement('span');
    chip.className = 'ac-chip';
    chip.setAttribute(SELECTORS.chipAttr, '');
    chip.textContent = reason;
    chipsEl.appendChild(chip);
  }
  card.appendChild(chipsEl);

  // Actions container
  const actionsEl = document.createElement('div');
  actionsEl.className = 'ac-card-actions';
  actionsEl.setAttribute(SELECTORS.actionsContainerAttr, '');

  const showBtn = document.createElement('button');
  showBtn.type = 'button';
  showBtn.className = 'ac-btn ac-btn-show';
  showBtn.setAttribute(SELECTORS.actionAttr, 'show');
  showBtn.textContent = 'Show anyway';
  showBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    revealTile(tile, video);
  });
  actionsEl.appendChild(showBtn);

  const allowBtn = document.createElement('button');
  allowBtn.type = 'button';
  allowBtn.className = 'ac-btn ac-btn-allow';
  allowBtn.setAttribute(SELECTORS.actionAttr, 'allow');
  allowBtn.textContent = 'Always allow channel';
  if (!video.channelHandle) {
    allowBtn.hidden = true;
    allowBtn.style.display = 'none';
  }
  allowBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (video.channelHandle) {
      await handleAlwaysAllow(video.channelHandle);
    }
  });
  actionsEl.appendChild(allowBtn);

  // Extra actions slot
  const extraEl = document.createElement('div');
  extraEl.className = 'ac-actions-extra';
  extraEl.setAttribute(SELECTORS.actionsExtraAttr, '');

  if (verdict.source === 'patterns' && isSignedIn()) {
    const notInterestedBtn = document.createElement('button');
    notInterestedBtn.type = 'button';
    notInterestedBtn.className = 'ac-btn ac-btn-not-interested';
    notInterestedBtn.setAttribute(SELECTORS.actionAttr, 'not-interested');
    notInterestedBtn.textContent = 'Not interested';

    notInterestedBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await handleManualNotInterested(tile, video, notInterestedBtn, card);
    });

    extraEl.appendChild(notInterestedBtn);

    void isVideoActed(video.videoId).then((acted) => {
      if (acted) {
        notInterestedBtn.disabled = true;
        const statusEl = card.querySelector(SELECTORS.status);
        if (statusEl && !statusEl.textContent) {
          statusEl.textContent = '✓ Told YouTube: Not interested';
        }
      }
    });
  }

  actionsEl.appendChild(extraEl);

  card.appendChild(actionsEl);

  // Status slot
  const statusEl = document.createElement('div');
  statusEl.className = 'ac-card-status';
  statusEl.setAttribute(SELECTORS.statusAttr, '');
  card.appendChild(statusEl);

  // Feedback note below status when feedbackConsent === 'granted'
  updateFeedbackNote(card, verdict, settings ?? currentSettings);

  return card;
}

/**
 * Calculates the current number of collapsed tiles.
 */
export function getCollapsedCount(): number {
  const root = document.body || document.documentElement;
  if (!root) return 0;
  return root.querySelectorAll(SELECTORS.collapsedSelector).length;
}

/**
 * Sends the current collapsed count to the background script to update badge text.
 */
export function updateBadgeCount(): number {
  const count = getCollapsedCount();
  if (count === lastBadgeCount) {
    return count;
  }
  lastBadgeCount = count;
  try {
    const b =
      typeof browser !== 'undefined'
        ? browser
        : (globalThis as unknown as { browser?: typeof browser }).browser;
    if (b?.runtime?.sendMessage) {
      b.runtime
        .sendMessage({
          type: 'COLLAPSED_COUNT',
          count,
        })
        ?.catch?.(() => {});
    }
  } catch {
    // Ignore in non-extension environments
  }
  return count;
}

/**
 * Attaches the "Block channel" and/or "Clickbait?" buttons on hover for a clean tile.
 */
export function attachBlockButton(
  tile: Element,
  video: VideoInfo,
  settings?: Settings,
  allowClickbait: boolean = false,
): void {
  videoInfoMap.set(tile, video);
  const activeSettings = settings ?? currentSettings;

  if (
    activeSettings?.enabled === false ||
    tile.classList.contains(SELECTORS.collapsedClass)
  ) {
    removeBlockButton(tile);
    return;
  }

  const showBlock = Boolean(video.channelHandle);
  const showClickbait =
    allowClickbait &&
    activeSettings?.feedbackConsent === 'granted' &&
    !sessionReportedVideoIds.has(video.videoId);

  if (!showBlock && !showClickbait) {
    removeBlockButton(tile);
    return;
  }

  tile.classList.add(SELECTORS.tileClass);

  let hoverContainer = tile.querySelector(
    SELECTORS.hoverActions,
  ) as HTMLElement | null;

  if (!hoverContainer) {
    hoverContainer = document.createElement('div');
    hoverContainer.className = 'ac-tile-hover-actions';
    hoverContainer.setAttribute(SELECTORS.hoverActionsAttr, '');
    tile.appendChild(hoverContainer);
  }

  // Block channel button
  let blockBtn = hoverContainer.querySelector(
    SELECTORS.blockAction,
  ) as HTMLButtonElement | null;
  if (showBlock) {
    if (!blockBtn) {
      blockBtn = document.createElement('button');
      blockBtn.type = 'button';
      blockBtn.className = 'ac-btn-block';
      blockBtn.setAttribute(SELECTORS.actionAttr, 'block');
      blockBtn.textContent = 'Block channel';
      hoverContainer.appendChild(blockBtn);
    }
    blockBtn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (video.channelHandle) {
        await handleBlockChannel(video.channelHandle, tile);
      }
    };
  } else if (blockBtn) {
    blockBtn.remove();
  }

  // Clickbait? button
  let clickbaitBtn = hoverContainer.querySelector(
    SELECTORS.clickbaitAction,
  ) as HTMLButtonElement | null;
  if (showClickbait) {
    if (!clickbaitBtn) {
      clickbaitBtn = document.createElement('button');
      clickbaitBtn.type = 'button';
      clickbaitBtn.className = 'ac-btn-clickbait';
      clickbaitBtn.setAttribute(SELECTORS.actionAttr, 'clickbait');
      clickbaitBtn.textContent = 'Clickbait?';
      hoverContainer.appendChild(clickbaitBtn);
    }
    clickbaitBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleReportClickbait(tile, video);
    };
  } else if (clickbaitBtn) {
    clickbaitBtn.remove();
  }
}

/**
 * Handles reporting a non-flagged video as clickbait:
 * sends feedback with kind: 'missed' and collapses tile with reason "Reported by you" for the session.
 */
export function handleReportClickbait(tile: Element, video: VideoInfo): void {
  const payload: FeedbackPayload = {
    kind: 'missed',
    videoId: video.videoId,
    title: video.title ?? '',
    channelHandle: video.channelHandle ?? null,
    matchedRuleIds: [],
    score: 0,
    strictness: currentSettings?.strictness ?? 'balanced',
    patternsRevision: currentPatterns?.revision ?? 1,
    extensionVersion: getExtensionVersion(),
    browser: getBrowserName(),
  };
  void sendFeedback(payload);

  sessionReportedVideoIds.add(video.videoId);
  const reportedVerdict: Verdict = {
    flagged: true,
    score: 0,
    reasons: ['Reported by you'],
    matchedRuleIds: [],
    matchedCategories: [],
    source: 'user_reported',
  };
  collapseTile(tile, video, reportedVerdict, currentSettings ?? undefined);
}

/**
 * Removes the hover buttons container and buttons from a tile.
 */
export function removeBlockButton(tile: Element): void {
  tile.classList.remove(SELECTORS.tileClass);
  const hoverContainer = tile.querySelector(SELECTORS.hoverActions);
  if (hoverContainer) {
    hoverContainer.remove();
  }
  const blockBtn = tile.querySelector(SELECTORS.blockAction);
  if (blockBtn) {
    blockBtn.remove();
  }
  const clickbaitBtn = tile.querySelector(SELECTORS.clickbaitAction);
  if (clickbaitBtn) {
    clickbaitBtn.remove();
  }
}

/**
 * Attaches the "Wrongly filtered?" button to a revealed tile if eligible.
 */
export function attachWronglyFilteredButton(
  tile: Element,
  video: VideoInfo,
  verdict: Verdict,
  settings?: Settings,
): HTMLElement | null {
  const activeSettings = settings ?? currentSettings;
  if (
    activeSettings?.feedbackConsent !== 'granted' ||
    verdict.source === 'blocklist'
  ) {
    removeWronglyFilteredButton(tile);
    return null;
  }

  let wfBtn = tile.querySelector(
    SELECTORS.wronglyFilteredAction,
  ) as HTMLButtonElement | null;

  if (sentFalsePositiveSessionVideoIds.has(video.videoId)) {
    if (!wfBtn) {
      wfBtn = document.createElement('button');
      wfBtn.type = 'button';
      wfBtn.className = 'ac-btn-wrongly-filtered';
      wfBtn.setAttribute(SELECTORS.actionAttr, 'wrongly-filtered');
      tile.appendChild(wfBtn);
    }
    wfBtn.textContent = 'Thanks!';
    wfBtn.disabled = true;
    return wfBtn;
  }

  if (!wfBtn) {
    wfBtn = document.createElement('button');
    wfBtn.type = 'button';
    wfBtn.className = 'ac-btn-wrongly-filtered';
    wfBtn.setAttribute(SELECTORS.actionAttr, 'wrongly-filtered');
    wfBtn.textContent = 'Wrongly filtered?';
    tile.appendChild(wfBtn);
  }

  wfBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (sentFalsePositiveSessionVideoIds.has(video.videoId)) {
      wfBtn!.textContent = 'Thanks!';
      wfBtn!.disabled = true;
      return;
    }
    sentFalsePositiveSessionVideoIds.add(video.videoId);
    const payload: FeedbackPayload = {
      kind: 'false_positive',
      videoId: video.videoId,
      title: video.title ?? '',
      channelHandle: video.channelHandle ?? null,
      matchedRuleIds: verdict.matchedRuleIds,
      score: verdict.score,
      strictness: activeSettings?.strictness ?? 'balanced',
      patternsRevision: currentPatterns?.revision ?? 1,
      extensionVersion: getExtensionVersion(),
      browser: getBrowserName(),
    };
    void sendFeedback(payload);
    wfBtn!.textContent = 'Thanks!';
    wfBtn!.disabled = true;
  };

  return wfBtn;
}

/**
 * Removes the "Wrongly filtered?" button from a tile.
 */
export function removeWronglyFilteredButton(tile: Element): void {
  const wfBtn = tile.querySelector(SELECTORS.wronglyFilteredAction);
  if (wfBtn) {
    wfBtn.remove();
  }
}

/**
 * Collapses a video tile, attaching the card and firing onCollapsed once per tile+videoId.
 */
export function collapseTile(
  tile: Element,
  video: VideoInfo,
  verdict: Verdict,
  settings?: Settings,
): HTMLElement {
  videoInfoMap.set(tile, video);
  lastVerdictMap.set(tile, verdict);
  lastVerdictByVideoMap.set(video.videoId, verdict);
  tile.classList.add(SELECTORS.collapsedClass);

  removeBlockButton(tile);
  removeWronglyFilteredButton(tile);

  const existingCard = tile.querySelector(SELECTORS.card);
  const prevVideoId = collapsedTileVideoMap.get(tile);

  if (existingCard && prevVideoId === video.videoId) {
    const existingChips = Array.from(
      existingCard.querySelectorAll(SELECTORS.chip),
    ).map((c) => c.textContent ?? '');
    const reasonsEqual =
      existingChips.length === verdict.reasons.length &&
      existingChips.every((r, idx) => r === verdict.reasons[idx]);

    if (reasonsEqual) {
      if (verdict.source !== 'patterns') {
        const notInterestedBtn = existingCard.querySelector(
          SELECTORS.notInterestedAction,
        );
        notInterestedBtn?.remove();
      }
      updateFeedbackNote(existingCard, verdict, settings ?? currentSettings);
      updateBadgeCount();
      return existingCard as HTMLElement;
    }

    const chipsContainer = existingCard.querySelector(SELECTORS.chips);
    if (chipsContainer) {
      chipsContainer.innerHTML = '';
      for (const reason of verdict.reasons) {
        const chip = document.createElement('span');
        chip.className = 'ac-chip';
        chip.setAttribute(SELECTORS.chipAttr, '');
        chip.textContent = reason;
        chipsContainer.appendChild(chip);
      }
      if (verdict.source !== 'patterns') {
        const notInterestedBtn = existingCard.querySelector(
          SELECTORS.notInterestedAction,
        );
        notInterestedBtn?.remove();
      }
      updateFeedbackNote(existingCard, verdict, settings ?? currentSettings);
      updateBadgeCount();
      return existingCard as HTMLElement;
    }
  }

  if (existingCard) {
    existingCard.remove();
  }

  const card = createCard(tile, video, verdict, settings);
  tile.appendChild(card);

  if (prevVideoId !== video.videoId) {
    collapsedTileVideoMap.set(tile, video.videoId);
    onCollapsed(tile, video, verdict);
  }

  updateBadgeCount();
  return card;
}

/**
 * Un-collapses a video tile, removing the card and collapsed class.
 */
export function uncollapseTile(tile: Element): void {
  tile.classList.remove(SELECTORS.collapsedClass);
  const existingCard = tile.querySelector(SELECTORS.card);
  if (existingCard) {
    existingCard.remove();
  }
  collapsedTileVideoMap.delete(tile);
  updateBadgeCount();
}

/**
 * Reveals a collapsed tile (Show anyway), un-collapsing it, firing onRevealed,
 * and remembering videoId for the page session.
 */
export function revealTile(tile: Element, video: VideoInfo): void {
  markSessionRevealed(video.videoId);
  uncollapseTile(tile);
  onRevealed(tile, video);
  attachBlockButton(tile, video, currentSettings ?? undefined, false);
  const verdict =
    lastVerdictMap.get(tile) || lastVerdictByVideoMap.get(video.videoId);
  if (
    verdict &&
    verdict.source === 'patterns' &&
    currentSettings?.feedbackConsent === 'granted'
  ) {
    attachWronglyFilteredButton(
      tile,
      video,
      verdict,
      currentSettings ?? undefined,
    );
  }
  updateBadgeCount();
}

/**
 * Handles "Always allow channel" action.
 */
export async function handleAlwaysAllow(handle: string): Promise<void> {
  await allowChannel(handle);
  onAllowed(handle);

  const normHandle = normalizeChannelHandle(handle);
  const root = document.body || document.documentElement;
  if (!root) return;

  const allTiles = Array.from(root.querySelectorAll(SELECTORS.tile)).filter(
    (el) => !el.parentElement || !el.parentElement.closest(SELECTORS.tile),
  );

  for (const t of allTiles) {
    const video = extractVideo(t) || videoInfoMap.get(t);
    if (
      video?.channelHandle &&
      normalizeChannelHandle(video.channelHandle) === normHandle
    ) {
      uncollapseTile(t);
      attachBlockButton(t, video, currentSettings ?? undefined, false);
    }
  }

  updateBadgeCount();
}

/**
 * Handles "Block channel" action.
 */
export async function handleBlockChannel(
  handle: string,
  tile: Element,
): Promise<void> {
  await blockChannel(handle);
  onBlocked(handle, tile);

  const normHandle = normalizeChannelHandle(handle);
  const root = document.body || document.documentElement;
  if (!root) return;

  const allTiles = Array.from(root.querySelectorAll(SELECTORS.tile)).filter(
    (el) => !el.parentElement || !el.parentElement.closest(SELECTORS.tile),
  );

  const blockVerdict: Verdict = {
    flagged: true,
    score: 0,
    reasons: ['You blocked this channel'],
    matchedRuleIds: [],
    matchedCategories: [],
    source: 'blocklist',
  };

  for (const t of allTiles) {
    const video = extractVideo(t) || videoInfoMap.get(t);
    if (
      video?.channelHandle &&
      normalizeChannelHandle(video.channelHandle) === normHandle
    ) {
      collapseTile(t, video, blockVerdict, currentSettings ?? undefined);
    }
  }

  updateBadgeCount();
}

/**
 * Evaluates and applies collapse or uncollapse state to a single tile.
 */
export function evaluateAndProcessTile(
  tile: Element,
  video: VideoInfo,
  patterns: Patterns,
  settings: Settings,
): void {
  currentPatterns = patterns;
  currentSettings = settings;
  videoInfoMap.set(tile, video);

  if (video.isShort) {
    return;
  }

  // If reported as clickbait by user during this session
  if (sessionReportedVideoIds.has(video.videoId)) {
    if (sessionRevealedVideoIds.has(video.videoId)) {
      if (tile.classList.contains(SELECTORS.collapsedClass)) {
        uncollapseTile(tile);
      }
      if (settings.enabled) {
        attachBlockButton(tile, video, settings, false);
      } else {
        removeBlockButton(tile);
      }
      return;
    }
    const reportedVerdict: Verdict = {
      flagged: true,
      score: 0,
      reasons: ['Reported by you'],
      matchedRuleIds: [],
      matchedCategories: [],
      source: 'user_reported',
    };
    collapseTile(tile, video, reportedVerdict, settings);
    return;
  }

  const verdict = evaluate(video, patterns, settings);

  if (
    sessionRevealedVideoIds.has(video.videoId) &&
    verdict.source === 'patterns'
  ) {
    if (tile.classList.contains(SELECTORS.collapsedClass)) {
      uncollapseTile(tile);
    }
    if (settings.enabled) {
      attachBlockButton(tile, video, settings, false);
    } else {
      removeBlockButton(tile);
    }
    if (settings.feedbackConsent === 'granted') {
      attachWronglyFilteredButton(tile, video, verdict, settings);
    } else {
      removeWronglyFilteredButton(tile);
    }
    return;
  }

  if (verdict.flagged) {
    collapseTile(tile, video, verdict, settings);
  } else {
    uncollapseTile(tile);
    if (settings.enabled) {
      attachBlockButton(tile, video, settings, !verdict.flagged);
    } else {
      removeBlockButton(tile);
    }
  }
}

/**
 * Re-evaluates all visible tiles on the page.
 */
export function reEvaluateAllTiles(
  patterns: Patterns,
  settings: Settings,
): void {
  currentPatterns = patterns;
  currentSettings = settings;

  const root = document.body || document.documentElement;
  if (!root) return;

  const allTiles = Array.from(root.querySelectorAll(SELECTORS.tile)).filter(
    (el) => !el.parentElement || !el.parentElement.closest(SELECTORS.tile),
  );

  for (const t of allTiles) {
    const video = extractVideo(t) || videoInfoMap.get(t);
    if (!video) continue;
    evaluateAndProcessTile(t, video, patterns, settings);
  }

  updateBadgeCount();
}

/**
 * Resets state for tests.
 */
export function resetCollapseState(): void {
  clearSessionRevealed();
  inFlightManualSends.clear();
  sessionReportedVideoIds.clear();
  sentFalsePositiveSessionVideoIds.clear();
  currentSettings = null;
  currentPatterns = null;
  lastBadgeCount = null;
  globalTrainQueue = null;
  resetFeedbackQueue();
}
