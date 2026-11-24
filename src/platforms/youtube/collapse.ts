import { evaluate, type Verdict } from '../../core/engine';
import type { Patterns } from '../../core/patterns-schema';
import {
  allowChannel,
  blockChannel,
  normalizeChannelHandle,
} from '../../core/settings';
import type { Settings, VideoInfo } from '../../core/types';
import { extractVideo } from './extract';
import { onAllowed, onBlocked, onCollapsed, onRevealed } from './events';
import { SELECTORS } from './selectors';

const sessionRevealedVideoIds = new Set<string>();
const collapsedTileVideoMap = new WeakMap<Element, string>();
const videoInfoMap = new WeakMap<Element, VideoInfo>();
let lastBadgeCount: number | null = null;

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
 * Creates the AlgoCleanse collapsed card DOM element.
 */
export function createCard(
  tile: Element,
  video: VideoInfo,
  verdict: Verdict,
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
  actionsEl.appendChild(extraEl);

  card.appendChild(actionsEl);

  // Status slot
  const statusEl = document.createElement('div');
  statusEl.className = 'ac-card-status';
  statusEl.setAttribute(SELECTORS.statusAttr, '');
  card.appendChild(statusEl);

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
 * Attaches the "Block channel" button on hover for a clean tile with a known handle.
 */
export function attachBlockButton(
  tile: Element,
  video: VideoInfo,
  settings?: Settings,
): void {
  videoInfoMap.set(tile, video);
  if (
    settings?.enabled === false ||
    tile.classList.contains(SELECTORS.collapsedClass) ||
    !video.channelHandle
  ) {
    removeBlockButton(tile);
    return;
  }

  tile.classList.add(SELECTORS.tileClass);

  let blockBtn = tile.querySelector(
    SELECTORS.blockAction,
  ) as HTMLButtonElement | null;
  if (!blockBtn) {
    blockBtn = document.createElement('button');
    blockBtn.type = 'button';
    blockBtn.className = 'ac-btn-block';
    blockBtn.setAttribute(SELECTORS.actionAttr, 'block');
    blockBtn.textContent = 'Block channel';
    tile.appendChild(blockBtn);
  }

  blockBtn.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (video.channelHandle) {
      await handleBlockChannel(video.channelHandle, tile);
    }
  };
}

/**
 * Removes the "Block channel" button from a tile.
 */
export function removeBlockButton(tile: Element): void {
  tile.classList.remove(SELECTORS.tileClass);
  const blockBtn = tile.querySelector(SELECTORS.blockAction);
  if (blockBtn) {
    blockBtn.remove();
  }
}

/**
 * Collapses a video tile, attaching the card and firing onCollapsed once per tile+videoId.
 */
export function collapseTile(
  tile: Element,
  video: VideoInfo,
  verdict: Verdict,
): HTMLElement {
  videoInfoMap.set(tile, video);
  tile.classList.add(SELECTORS.collapsedClass);

  removeBlockButton(tile);

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
      updateBadgeCount();
      return existingCard as HTMLElement;
    }
  }

  if (existingCard) {
    existingCard.remove();
  }

  const card = createCard(tile, video, verdict);
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
  if (video.channelHandle) {
    attachBlockButton(tile, video);
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
      attachBlockButton(t, video);
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
      collapseTile(t, video, blockVerdict);
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
  videoInfoMap.set(tile, video);

  if (video.isShort) {
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
    if (video.channelHandle && settings.enabled) {
      attachBlockButton(tile, video, settings);
    } else {
      removeBlockButton(tile);
    }
    return;
  }

  if (verdict.flagged) {
    collapseTile(tile, video, verdict);
  } else {
    uncollapseTile(tile);
    if (video.channelHandle && settings.enabled) {
      attachBlockButton(tile, video, settings);
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
  lastBadgeCount = null;
}
