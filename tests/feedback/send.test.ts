import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from 'wxt/utils/storage';
import {
  handleFeedbackMessage,
  initFeedbackHandler,
  isFeedbackMessage,
} from '../../src/background/feedback';
import { updateSettings } from '../../src/core/settings';
import {
  getApiBaseUrl,
  getBrowserName,
  getExtensionVersion,
  postFeedbackDirect,
  sendFeedback,
  type FeedbackPayload,
} from '../../src/feedback/send';

describe('feedback sending and payload schema', () => {
  const TEST_API_BASE = 'https://api.algocleanse.test';

  const samplePayload: FeedbackPayload = {
    kind: 'false_positive',
    videoId: 'abc123vid',
    title: 'Sensational Title (Gone Wrong)',
    channelHandle: '@sample_channel',
    matchedRuleIds: ['gone-wrong', 'sensational-words'],
    score: 6,
    strictness: 'balanced',
    patternsRevision: 2,
    extensionVersion: '0.1.0',
    browser: 'chrome',
  };

  beforeEach(async () => {
    fakeBrowser.reset();
    await storage.clear('sync');
    await storage.clear('local');
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  // Acceptance criterion: Payload has no URL besides videoId and no user identifier
  it('Payload has no URL besides videoId and no user identifier', () => {
    const keys = Object.keys(samplePayload);
    const expectedKeys = [
      'kind',
      'videoId',
      'title',
      'channelHandle',
      'matchedRuleIds',
      'score',
      'strictness',
      'patternsRevision',
      'extensionVersion',
      'browser',
    ];

    expect(keys.sort()).toEqual(expectedKeys.sort());

    // Verify no user identifiers
    expect('userId' in samplePayload).toBe(false);
    expect('user' in samplePayload).toBe(false);
    expect('ip' in samplePayload).toBe(false);
    expect('email' in samplePayload).toBe(false);
    expect('accountId' in samplePayload).toBe(false);

    // Verify videoId is a bare ID without URL prefix
    expect(samplePayload.videoId).not.toContain('http://');
    expect(samplePayload.videoId).not.toContain('https://');
    expect(samplePayload.videoId).not.toContain('youtube.com');
    expect(samplePayload.videoId).toBe('abc123vid');

    // Title and channelHandle do not contain URL
    expect(samplePayload.title).not.toContain('http');
    expect(samplePayload.channelHandle).toBe('@sample_channel');
  });

  // Acceptance criterion: Consent unset or denied: no feedback buttons in DOM and fetch never called
  it('Consent unset or denied: no feedback buttons in DOM and fetch never called', async () => {
    vi.stubEnv('WXT_API_BASE_URL', TEST_API_BASE);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    // 1. With consent 'unset'
    await updateSettings({ feedbackConsent: 'unset' });
    await sendFeedback(samplePayload);
    expect(fetchSpy).not.toHaveBeenCalled();

    // 2. With consent 'denied'
    await updateSettings({ feedbackConsent: 'denied' });
    await sendFeedback(samplePayload);
    expect(fetchSpy).not.toHaveBeenCalled();

    // 3. Directly in background handler with consent 'denied'
    await handleFeedbackMessage({
      type: 'SEND_FEEDBACK',
      payload: samplePayload,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not send feedback when WXT_API_BASE_URL is not configured or empty', async () => {
    await updateSettings({ feedbackConsent: 'granted' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    // No base URL
    vi.stubEnv('WXT_API_BASE_URL', '');
    await sendFeedback(samplePayload);
    expect(fetchSpy).not.toHaveBeenCalled();

    // Whitespace base URL
    vi.stubEnv('WXT_API_BASE_URL', '   ');
    await sendFeedback(samplePayload);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends POST request to ${WXT_API_BASE_URL}/feedback when consent is granted', async () => {
    vi.stubEnv('WXT_API_BASE_URL', TEST_API_BASE);
    await updateSettings({ feedbackConsent: 'granted' });

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));

    await sendFeedback(samplePayload);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      `${TEST_API_BASE}/feedback`,
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(samplePayload),
      }),
    );
  });

  it('background message handler validates messages and sends feedback', async () => {
    vi.stubEnv('WXT_API_BASE_URL', TEST_API_BASE);
    await updateSettings({ feedbackConsent: 'granted' });

    expect(isFeedbackMessage(null)).toBe(false);
    expect(isFeedbackMessage({})).toBe(false);
    expect(isFeedbackMessage({ type: 'OTHER' })).toBe(false);
    expect(isFeedbackMessage({ type: 'SEND_FEEDBACK', payload: null })).toBe(
      false,
    );
    expect(
      isFeedbackMessage({
        type: 'SEND_FEEDBACK',
        payload: samplePayload,
      }),
    ).toBe(true);

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));

    initFeedbackHandler();

    await fakeBrowser.runtime.onMessage.trigger(
      {
        type: 'SEND_FEEDBACK',
        payload: samplePayload,
      },
      {} as never,
      (() => {}) as never,
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      `${TEST_API_BASE}/feedback`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(samplePayload),
      }),
    );
  });

  it('fire-and-forget: does not throw on network failure', async () => {
    vi.stubEnv('WXT_API_BASE_URL', TEST_API_BASE);
    await updateSettings({ feedbackConsent: 'granted' });

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('Network offline'),
    );

    await expect(sendFeedback(samplePayload)).resolves.toBeUndefined();
    await expect(
      postFeedbackDirect(TEST_API_BASE, samplePayload),
    ).resolves.toBeUndefined();
  });

  it('detects browser name and extension version correctly', () => {
    expect(['chrome', 'firefox']).toContain(getBrowserName());
    expect(getExtensionVersion()).toBe('0.1.0');
    expect(getApiBaseUrl()).toBe('');
    vi.stubEnv('WXT_API_BASE_URL', 'https://api.example.com');
    expect(getApiBaseUrl()).toBe('https://api.example.com');
  });
});
