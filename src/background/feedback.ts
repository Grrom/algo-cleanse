import { browser } from 'wxt/browser';
import { getSettings } from '../core/settings';
import {
  getApiBaseUrl,
  postFeedbackDirect,
  type FeedbackPayload,
} from '../feedback/send';

export interface FeedbackMessage {
  type: 'SEND_FEEDBACK';
  payload: FeedbackPayload;
}

export function isFeedbackMessage(msg: unknown): msg is FeedbackMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    (msg as Record<string, unknown>).type === 'SEND_FEEDBACK' &&
    'payload' in msg &&
    typeof (msg as Record<string, unknown>).payload === 'object' &&
    (msg as Record<string, unknown>).payload !== null
  );
}

export async function handleFeedbackMessage(message: unknown): Promise<void> {
  if (!isFeedbackMessage(message)) {
    return;
  }

  const settings = await getSettings();
  if (settings.feedbackConsent !== 'granted') {
    return;
  }

  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    return;
  }

  await postFeedbackDirect(baseUrl, message.payload);
}

export function initFeedbackHandler(): void {
  const b =
    typeof browser !== 'undefined'
      ? browser
      : (globalThis as unknown as { browser?: typeof browser }).browser;
  b?.runtime?.onMessage?.addListener?.(handleFeedbackMessage);
}
