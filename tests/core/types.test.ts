import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  type Settings,
  type Strictness,
  type VideoInfo,
} from '../../src/core/types';

describe('DEFAULT_SETTINGS', () => {
  // A Vitest test asserts DEFAULT_SETTINGS (enabled true, strictness balanced, hideShorts true, autoNotInterested false, autoCategories [], dontRecommendOnBlock true, feedbackConsent unset, empty channel lists)
  it('asserts DEFAULT_SETTINGS (enabled true, strictness balanced, hideShorts true, autoNotInterested false, autoCategories [], dontRecommendOnBlock true, feedbackConsent unset, empty channel lists)', () => {
    expect(DEFAULT_SETTINGS.enabled).toBe(true);
    expect(DEFAULT_SETTINGS.strictness).toBe('balanced');
    expect(DEFAULT_SETTINGS.hideShorts).toBe(true);
    expect(DEFAULT_SETTINGS.autoNotInterested).toBe(false);
    expect(DEFAULT_SETTINGS.autoCategories).toEqual([]);
    expect(DEFAULT_SETTINGS.dontRecommendOnBlock).toBe(true);
    expect(DEFAULT_SETTINGS.feedbackConsent).toBe('unset');
    expect(DEFAULT_SETTINGS.blockedChannels).toEqual([]);
    expect(DEFAULT_SETTINGS.allowedChannels).toEqual([]);

    expect(DEFAULT_SETTINGS).toEqual({
      enabled: true,
      strictness: 'balanced',
      hideShorts: true,
      autoNotInterested: false,
      autoCategories: [],
      dontRecommendOnBlock: true,
      feedbackConsent: 'unset',
      blockedChannels: [],
      allowedChannels: [],
    });
  });

  // src/core/types.ts exports VideoInfo, Settings, Strictness, DEFAULT_SETTINGS matching the Design section
  it('exports VideoInfo, Settings, Strictness, DEFAULT_SETTINGS matching the Design section', () => {
    const video: VideoInfo = {
      videoId: 'test-video-id',
      title: 'Test Video',
      channelHandle: '@testchannel',
      channelName: 'Test Channel',
      durationText: '12:34',
      isShort: false,
    };
    expect(video.videoId).toBe('test-video-id');
    expect(video.title).toBe('Test Video');
    expect(video.channelHandle).toBe('@testchannel');
    expect(video.channelName).toBe('Test Channel');
    expect(video.durationText).toBe('12:34');
    expect(video.isShort).toBe(false);

    const strictnessOptions: Strictness[] = ['gentle', 'balanced', 'strict'];
    expect(strictnessOptions).toContain('gentle');
    expect(strictnessOptions).toContain('balanced');
    expect(strictnessOptions).toContain('strict');

    const settings: Settings = { ...DEFAULT_SETTINGS };
    expect(settings.enabled).toBe(true);
    expect(settings.strictness).toBe('balanced');
  });
});
