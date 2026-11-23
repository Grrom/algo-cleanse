import { browser } from 'wxt/browser';
import { storage } from 'wxt/utils/storage';
import {
  getValidRemotePatterns,
  type RemotePatternsRecord,
} from '../core/active-patterns';
import { BUNDLED_PATTERNS } from '../core/bundled-patterns';
import { ENGINE_VERSION } from '../core/engine-version';
import { parsePatterns } from '../core/patterns-schema';

export const PATTERN_REFRESH_ALARM = 'patterns-refresh';
export const PATTERN_REFRESH_PERIOD_MINUTES = 720;

export function getApiBaseUrl(): string {
  const metaUrl = (typeof import.meta !== 'undefined' &&
    import.meta.env?.WXT_API_BASE_URL) as string | undefined;
  if (metaUrl && typeof metaUrl === 'string' && metaUrl.trim() !== '') {
    return metaUrl.trim();
  }
  return '';
}

let updateInProgress: Promise<boolean> | null = null;

export async function updatePatterns(apiBaseUrl?: string): Promise<boolean> {
  if (updateInProgress) {
    return updateInProgress;
  }
  updateInProgress = performUpdate(apiBaseUrl).finally(() => {
    updateInProgress = null;
  });
  return updateInProgress;
}

async function performUpdate(apiBaseUrl?: string): Promise<boolean> {
  const baseUrl = apiBaseUrl ?? getApiBaseUrl();
  if (!baseUrl || !baseUrl.trim()) {
    // Empty WXT_API_BASE_URL -> no fetch
    return false;
  }

  const cleanBase = baseUrl.trim().replace(/\/+$/, '');
  const url = `${cleanBase}/patterns.json`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error('Pattern update request timed out'));
  }, 10_000);

  try {
    const response = await fetch(url, {
      cache: 'no-cache',
      signal: controller.signal,
    });

    if (!response.ok) {
      return false;
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      return false;
    }

    const parsed = parsePatterns(json);
    if (!parsed) {
      return false;
    }

    if (parsed.minEngineVersion > ENGINE_VERSION) {
      return false;
    }

    const stored = await storage.getItem<RemotePatternsRecord | null>(
      'local:remotePatterns',
    );
    const validStored = getValidRemotePatterns(stored);
    const storedRevision = validStored ? validStored.revision : undefined;
    const baselineRevision =
      storedRevision !== undefined ? storedRevision : BUNDLED_PATTERNS.revision;

    if (parsed.revision <= baselineRevision) {
      return false;
    }

    const record: RemotePatternsRecord = {
      patterns: parsed,
      fetchedAt: new Date().toISOString(),
    };
    await storage.setItem('local:remotePatterns', record);
    return true;
  } catch {
    // Failures keep what's stored
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function initPatternUpdater(): Promise<void> {
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === PATTERN_REFRESH_ALARM) {
      void updatePatterns();
    }
  });

  browser.runtime.onInstalled.addListener(() => {
    void updatePatterns();
  });

  browser.runtime.onStartup.addListener(() => {
    void updatePatterns();
  });

  return browser.alarms.get(PATTERN_REFRESH_ALARM).then((existingAlarm) => {
    if (!existingAlarm) {
      browser.alarms.create(PATTERN_REFRESH_ALARM, {
        periodInMinutes: PATTERN_REFRESH_PERIOD_MINUTES,
      });
    }
  });
}
