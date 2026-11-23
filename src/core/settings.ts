import { browser } from 'wxt/browser';
import { DEFAULT_SETTINGS, type Settings } from './types';

export const SETTINGS_KEY = 'settings';

/**
 * Normalizes a channel handle to lowercase with a leading '@'.
 */
export function normalizeChannelHandle(handle: string): string {
  const trimmed = handle.trim();
  const withoutAt = trimmed.replace(/^@+/, '');
  return `@${withoutAt.toLowerCase()}`;
}

/**
 * Merges a stored or raw settings object over DEFAULT_SETTINGS.
 * Unknown keys are dropped and field types are validated.
 */
export function mergeSettings(stored?: unknown): Settings {
  const result: Settings = {
    enabled: DEFAULT_SETTINGS.enabled,
    strictness: DEFAULT_SETTINGS.strictness,
    hideShorts: DEFAULT_SETTINGS.hideShorts,
    autoNotInterested: DEFAULT_SETTINGS.autoNotInterested,
    autoCategories: [...DEFAULT_SETTINGS.autoCategories],
    dontRecommendOnBlock: DEFAULT_SETTINGS.dontRecommendOnBlock,
    feedbackConsent: DEFAULT_SETTINGS.feedbackConsent,
    blockedChannels: [...DEFAULT_SETTINGS.blockedChannels],
    allowedChannels: [...DEFAULT_SETTINGS.allowedChannels],
  };

  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    const record = stored as Record<string, unknown>;
    if (typeof record.enabled === 'boolean') {
      result.enabled = record.enabled;
    }
    if (
      record.strictness === 'gentle' ||
      record.strictness === 'balanced' ||
      record.strictness === 'strict'
    ) {
      result.strictness = record.strictness;
    }
    if (typeof record.hideShorts === 'boolean') {
      result.hideShorts = record.hideShorts;
    }
    if (typeof record.autoNotInterested === 'boolean') {
      result.autoNotInterested = record.autoNotInterested;
    }
    if (Array.isArray(record.autoCategories)) {
      result.autoCategories = Array.from(
        new Set(
          record.autoCategories.filter(
            (x): x is string => typeof x === 'string',
          ),
        ),
      );
    }
    if (typeof record.dontRecommendOnBlock === 'boolean') {
      result.dontRecommendOnBlock = record.dontRecommendOnBlock;
    }
    if (
      record.feedbackConsent === 'unset' ||
      record.feedbackConsent === 'granted' ||
      record.feedbackConsent === 'denied'
    ) {
      result.feedbackConsent = record.feedbackConsent;
    }
    if (Array.isArray(record.blockedChannels)) {
      result.blockedChannels = Array.from(
        new Set(
          record.blockedChannels.filter(
            (x): x is string => typeof x === 'string',
          ),
        ),
      ).slice(-1000);
    }
    if (Array.isArray(record.allowedChannels)) {
      result.allowedChannels = Array.from(
        new Set(
          record.allowedChannels.filter(
            (x): x is string => typeof x === 'string',
          ),
        ),
      ).slice(-1000);
    }
  }

  return result;
}

const getBrowser = (): typeof browser => (globalThis as any).browser ?? browser;

/**
 * Reads browser.storage.sync key settings, merging over DEFAULT_SETTINGS (unknown keys dropped).
 */
export async function getSettings(): Promise<Settings> {
  const b = getBrowser();
  const data = await b.storage.sync.get(SETTINGS_KEY);
  const stored = data?.[SETTINGS_KEY];
  return mergeSettings(stored);
}

/**
 * Updates settings with the provided patch and returns the new settings.
 */
export async function updateSettings(
  patch: Partial<Settings>,
): Promise<Settings> {
  const current = await getSettings();
  const merged = mergeSettings({
    ...current,
    ...patch,
  });
  const b = getBrowser();
  await b.storage.sync.set({ [SETTINGS_KEY]: merged });
  return merged;
}

export type SettingsCallback = (settings: Settings) => void;

/**
 * Subscribes to settings changes via storage.onChanged. Returns an unsubscribe function.
 */
export function watchSettings(callback: SettingsCallback): () => void {
  const b = getBrowser();
  const listener = (
    changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
    areaName: string,
  ) => {
    if ((areaName === 'sync' || !areaName) && SETTINGS_KEY in changes) {
      const change = changes[SETTINGS_KEY];
      callback(mergeSettings(change?.newValue));
    }
  };

  b.storage.onChanged.addListener(listener as any);

  return () => {
    b.storage.onChanged.removeListener(listener as any);
  };
}

/**
 * Blocks a channel by handle. Normalized lowercase with leading @.
 * Removes from allowed list, de-duplicates, and caps list at 1000 (oldest dropped).
 */
export async function blockChannel(handle: string): Promise<Settings> {
  const norm = normalizeChannelHandle(handle);
  if (norm === '@') {
    return getSettings();
  }
  const current = await getSettings();
  const blockedChannels = current.blockedChannels.filter((h) => h !== norm);
  blockedChannels.push(norm);
  const cappedBlocked =
    blockedChannels.length > 1000
      ? blockedChannels.slice(-1000)
      : blockedChannels;
  const allowedChannels = current.allowedChannels.filter((h) => h !== norm);
  return updateSettings({
    blockedChannels: cappedBlocked,
    allowedChannels,
  });
}

/**
 * Allows a channel by handle. Normalized lowercase with leading @.
 * Removes from blocked list, de-duplicates, and caps list at 1000 (oldest dropped).
 */
export async function allowChannel(handle: string): Promise<Settings> {
  const norm = normalizeChannelHandle(handle);
  if (norm === '@') {
    return getSettings();
  }
  const current = await getSettings();
  const allowedChannels = current.allowedChannels.filter((h) => h !== norm);
  allowedChannels.push(norm);
  const cappedAllowed =
    allowedChannels.length > 1000
      ? allowedChannels.slice(-1000)
      : allowedChannels;
  const blockedChannels = current.blockedChannels.filter((h) => h !== norm);
  return updateSettings({
    blockedChannels,
    allowedChannels: cappedAllowed,
  });
}

/**
 * Removes a channel by handle from both blocked and allowed lists.
 */
export async function removeChannel(handle: string): Promise<Settings> {
  const norm = normalizeChannelHandle(handle);
  if (norm === '@') {
    return getSettings();
  }
  const current = await getSettings();
  const blockedChannels = current.blockedChannels.filter((h) => h !== norm);
  const allowedChannels = current.allowedChannels.filter((h) => h !== norm);
  return updateSettings({
    blockedChannels,
    allowedChannels,
  });
}

/**
 * Adds or removes a category id in autoCategories, de-duplicated.
 */
export async function setAutoCategory(
  id: string,
  on: boolean,
): Promise<Settings> {
  const current = await getSettings();
  let autoCategories: string[];
  if (on) {
    if (current.autoCategories.includes(id)) {
      autoCategories = [...current.autoCategories];
    } else {
      autoCategories = [...current.autoCategories, id];
    }
  } else {
    autoCategories = current.autoCategories.filter((cat) => cat !== id);
  }
  return updateSettings({ autoCategories });
}
