import { browser } from 'wxt/browser';
import { DEFAULT_SETTINGS, type Settings } from './types';

export const SETTINGS_KEY = 'settings';
export const CHANNELS_KEY = 'channels';

export type ScalarSettings = Omit<
  Settings,
  'blockedChannels' | 'allowedChannels'
>;
export type ChannelsSettings = Pick<
  Settings,
  'blockedChannels' | 'allowedChannels'
>;

const SCALAR_KEYS = [
  'enabled',
  'strictness',
  'hideShorts',
  'autoNotInterested',
  'autoCategories',
  'dontRecommendOnBlock',
  'feedbackConsent',
] as const;

/**
 * Normalizes a channel handle to lowercase with a leading '@'.
 */
export function normalizeChannelHandle(handle: string): string {
  const trimmed = handle.trim();
  const withoutAt = trimmed.replace(/^@+/, '');
  return `@${withoutAt.toLowerCase()}`;
}

function cleanChannelList(val: unknown): string[] {
  if (!Array.isArray(val)) {
    return [];
  }
  const strings = val.filter((x): x is string => typeof x === 'string');
  return Array.from(new Set(strings)).slice(-1000);
}

/**
 * Merges a stored or raw sync item over DEFAULT_SETTINGS scalar fields.
 * Any list fields (blockedChannels, allowedChannels) or unknown keys are ignored.
 */
export function mergeScalars(stored?: unknown): ScalarSettings {
  const result: ScalarSettings = {
    enabled: DEFAULT_SETTINGS.enabled,
    strictness: DEFAULT_SETTINGS.strictness,
    hideShorts: DEFAULT_SETTINGS.hideShorts,
    autoNotInterested: DEFAULT_SETTINGS.autoNotInterested,
    autoCategories: [...DEFAULT_SETTINGS.autoCategories],
    dontRecommendOnBlock: DEFAULT_SETTINGS.dontRecommendOnBlock,
    feedbackConsent: DEFAULT_SETTINGS.feedbackConsent,
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
  }

  return result;
}

/**
 * Merges a stored or raw local channels item over DEFAULT_SETTINGS list fields.
 * Validates each list (strings only, de-duplicated, slice(-1000)).
 */
export function mergeChannels(stored?: unknown): ChannelsSettings {
  const result: ChannelsSettings = {
    blockedChannels: [...DEFAULT_SETTINGS.blockedChannels],
    allowedChannels: [...DEFAULT_SETTINGS.allowedChannels],
  };

  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    const record = stored as Record<string, unknown>;
    if (Array.isArray(record.blockedChannels)) {
      result.blockedChannels = cleanChannelList(record.blockedChannels);
    }
    if (Array.isArray(record.allowedChannels)) {
      result.allowedChannels = cleanChannelList(record.allowedChannels);
    }
  }

  return result;
}

/**
 * Merges sync and local stored objects into a single Settings object.
 * List fields in the sync item are ignored.
 */
export function mergeSettings(
  syncStored?: unknown,
  localStored?: unknown,
): Settings {
  return {
    ...mergeScalars(syncStored),
    ...mergeChannels(localStored),
  };
}

const getBrowser = (): typeof browser => {
  const g = globalThis as unknown as { browser?: typeof browser };
  return g.browser ?? browser;
};

/**
 * Reads browser.storage.sync key settings and browser.storage.local key channels,
 * merging over DEFAULT_SETTINGS (unknown keys dropped, wrong types replaced by defaults).
 * List fields in sync.settings are ignored.
 */
export async function getSettings(): Promise<Settings> {
  const b = getBrowser();
  const [syncData, localData] = await Promise.all([
    b.storage.sync.get(SETTINGS_KEY),
    b.storage.local.get(CHANNELS_KEY),
  ]);
  const syncStored = syncData?.[SETTINGS_KEY];
  const localStored = localData?.[CHANNELS_KEY];
  return mergeSettings(syncStored, localStored);
}

/**
 * Updates settings with the provided patch and returns the new settings.
 * Writes scalar fields to sync.settings and list fields to local.channels.
 * Skips sync for a lists-only patch; skips local for a scalars-only patch.
 */
export async function updateSettings(
  patch: Partial<Settings>,
): Promise<Settings> {
  const hasScalarKey = SCALAR_KEYS.some(
    (key) => key in patch && patch[key] !== undefined,
  );
  const hasChannelKey =
    ('blockedChannels' in patch && patch.blockedChannels !== undefined) ||
    ('allowedChannels' in patch && patch.allowedChannels !== undefined);

  if (!hasScalarKey && !hasChannelKey) {
    return getSettings();
  }

  const b = getBrowser();
  const current = await getSettings();

  let newScalars: ScalarSettings = {
    enabled: current.enabled,
    strictness: current.strictness,
    hideShorts: current.hideShorts,
    autoNotInterested: current.autoNotInterested,
    autoCategories: [...current.autoCategories],
    dontRecommendOnBlock: current.dontRecommendOnBlock,
    feedbackConsent: current.feedbackConsent,
  };

  if (hasScalarKey) {
    newScalars = mergeScalars({
      ...newScalars,
      ...patch,
    });
  }

  let newChannels: ChannelsSettings = {
    blockedChannels: [...current.blockedChannels],
    allowedChannels: [...current.allowedChannels],
  };

  if (hasChannelKey) {
    newChannels = {
      blockedChannels:
        patch.blockedChannels !== undefined
          ? cleanChannelList(patch.blockedChannels)
          : current.blockedChannels,
      allowedChannels:
        patch.allowedChannels !== undefined
          ? cleanChannelList(patch.allowedChannels)
          : current.allowedChannels,
    };
  }

  const writes: Promise<void>[] = [];
  if (hasScalarKey) {
    writes.push(b.storage.sync.set({ [SETTINGS_KEY]: newScalars }));
  }
  if (hasChannelKey) {
    writes.push(b.storage.local.set({ [CHANNELS_KEY]: newChannels }));
  }
  if (writes.length > 0) {
    await Promise.all(writes);
  }

  return {
    ...newScalars,
    ...newChannels,
  };
}

export type SettingsCallback = (settings: Settings) => void;

/**
 * Subscribes to settings changes via storage.onChanged. Returns an unsubscribe function.
 * Fires with merged settings when sync/settings or local/channels changes.
 * Ignores other areas and keys.
 */
export function watchSettings(callback: SettingsCallback): () => void {
  const b = getBrowser();
  const listener: Parameters<
    typeof browser.storage.onChanged.addListener
  >[0] = async (changes, areaName) => {
    const isSyncSettings = areaName === 'sync' && SETTINGS_KEY in changes;
    const isLocalChannels = areaName === 'local' && CHANNELS_KEY in changes;

    if (isSyncSettings || isLocalChannels) {
      const merged = await getSettings();
      callback(merged);
    }
  };

  b.storage.onChanged.addListener(listener);

  return () => {
    b.storage.onChanged.removeListener(listener);
  };
}

/**
 * Blocks a channel by handle. Normalized lowercase with leading @.
 * Removes from allowed list, de-duplicates, and caps list at 1000 (oldest dropped).
 * Writes only local.channels.
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
 * Writes only local.channels.
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
 * Writes only local.channels.
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
