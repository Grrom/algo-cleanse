import { browser } from 'wxt/browser';
import { getSettings } from '../core/settings';

export interface FeedbackPayload {
  kind: 'false_positive' | 'missed';
  videoId: string;
  title: string;
  channelHandle: string | null;
  matchedRuleIds: string[];
  score: number;
  strictness: 'gentle' | 'balanced' | 'strict';
  patternsRevision: number;
  extensionVersion: string;
  browser: 'chrome' | 'firefox';
}

export function getApiBaseUrl(): string {
  const metaUrl = (typeof import.meta !== 'undefined' &&
    import.meta.env?.WXT_API_BASE_URL) as string | undefined;
  if (metaUrl && typeof metaUrl === 'string' && metaUrl.trim() !== '') {
    return metaUrl.trim();
  }
  return '';
}

export function getExtensionVersion(): string {
  try {
    const b =
      typeof browser !== 'undefined'
        ? browser
        : (globalThis as unknown as { browser?: typeof browser }).browser;
    const v = b?.runtime?.getManifest?.()?.version;
    if (v) return v;
  } catch {
    // ignore
  }
  return '0.1.0';
}

export function getBrowserName(): 'chrome' | 'firefox' {
  if (
    typeof import.meta !== 'undefined' &&
    import.meta.env?.BROWSER === 'firefox'
  ) {
    return 'firefox';
  }
  if (
    typeof navigator !== 'undefined' &&
    /firefox/i.test(navigator.userAgent)
  ) {
    return 'firefox';
  }
  return 'chrome';
}

/**
 * Sends feedback payload via background POST to ${WXT_API_BASE_URL}/feedback.
 * No-op unless feedbackConsent === 'granted' and base URL set.
 * Fire-and-forget.
 */
export async function sendFeedback(payload: FeedbackPayload): Promise<void> {
  try {
    const settings = await getSettings();
    if (settings.feedbackConsent !== 'granted') {
      return;
    }

    const baseUrl = getApiBaseUrl();
    if (!baseUrl) {
      return;
    }

    const b =
      typeof browser !== 'undefined'
        ? browser
        : (globalThis as unknown as { browser?: typeof browser }).browser;

    // Send via background message if available
    if (b?.runtime?.sendMessage) {
      try {
        await b.runtime.sendMessage({
          type: 'SEND_FEEDBACK',
          payload,
        });
        return;
      } catch {
        // Fall back to direct fetch if background message listener is not registered
      }
    }

    await postFeedbackDirect(baseUrl, payload);
  } catch {
    // Fire-and-forget: catch all exceptions
  }
}

export async function postFeedbackDirect(
  baseUrl: string,
  payload: FeedbackPayload,
): Promise<void> {
  const cleanBase = baseUrl.trim().replace(/\/+$/, '');
  const url = `${cleanBase}/feedback`;

  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // Fire-and-forget
  }
}
