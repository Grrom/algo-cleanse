import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Verdict } from '../../../src/core/engine';
import type { VideoInfo } from '../../../src/core/types';
import {
  clearEventListeners,
  emitAllowed,
  emitBlocked,
  emitCollapsed,
  emitRevealed,
  events,
  onAllowed,
  onBlocked,
  onCollapsed,
  onRevealed,
} from '../../../src/platforms/youtube/events';

describe('events', () => {
  const dummyTile = document.createElement('div');
  const dummyVideo: VideoInfo = {
    videoId: 'testVid',
    title: 'Test Video',
    channelHandle: '@testchannel',
    channelName: 'Test Channel',
    durationText: '10:00',
    isShort: false,
  };
  const dummyVerdict: Verdict = {
    flagged: true,
    score: 3,
    reasons: ['Bait phrase: “gone wrong”'],
    matchedRuleIds: ['gone-wrong'],
    matchedCategories: ['bait-phrase'],
    source: 'patterns',
  };

  beforeEach(() => {
    clearEventListeners();
    vi.restoreAllMocks();
  });

  describe('onCollapsed event bus', () => {
    it('subscribes with callback and fires when onCollapsed(tile, video, verdict) is called', () => {
      const listener = vi.fn();
      const unsub = onCollapsed(listener);

      onCollapsed(dummyTile, dummyVideo, dummyVerdict);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        dummyTile,
        dummyVideo,
        dummyVerdict,
      );

      unsub();
      onCollapsed(dummyTile, dummyVideo, dummyVerdict);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('works with emitCollapsed and events.emitCollapsed', () => {
      const listener = vi.fn();
      onCollapsed.addListener(listener);

      emitCollapsed(dummyTile, dummyVideo, dummyVerdict);
      expect(listener).toHaveBeenCalledWith(
        dummyTile,
        dummyVideo,
        dummyVerdict,
      );

      events.onCollapsed.emit(dummyTile, dummyVideo, dummyVerdict);
      expect(listener).toHaveBeenCalledTimes(2);
    });
  });

  describe('onRevealed event bus', () => {
    it('subscribes with callback and fires when onRevealed(tile, video) is called', () => {
      const listener = vi.fn();
      const unsub = onRevealed(listener);

      onRevealed(dummyTile, dummyVideo);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(dummyTile, dummyVideo);

      unsub();
      onRevealed(dummyTile, dummyVideo);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('works with emitRevealed', () => {
      const listener = vi.fn();
      onRevealed.subscribe(listener);

      emitRevealed(dummyTile, dummyVideo);
      expect(listener).toHaveBeenCalledWith(dummyTile, dummyVideo);
    });
  });

  describe('onAllowed event bus', () => {
    it('subscribes with callback and fires when onAllowed(handle) is called', () => {
      const listener = vi.fn();
      const unsub = onAllowed(listener);

      onAllowed('@creator');
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith('@creator');

      unsub();
      onAllowed('@creator');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('works with emitAllowed', () => {
      const listener = vi.fn();
      onAllowed.addListener(listener);

      emitAllowed('@creator');
      expect(listener).toHaveBeenCalledWith('@creator');
    });
  });

  describe('onBlocked event bus', () => {
    it('subscribes with callback and fires when onBlocked(handle, tile) is called', () => {
      const listener = vi.fn();
      const unsub = onBlocked(listener);

      onBlocked('@badcreator', dummyTile);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith('@badcreator', dummyTile);

      unsub();
      onBlocked('@badcreator', dummyTile);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('works with emitBlocked', () => {
      const listener = vi.fn();
      onBlocked.addListener(listener);

      emitBlocked('@badcreator', dummyTile);
      expect(listener).toHaveBeenCalledWith('@badcreator', dummyTile);
    });
  });

  describe('clearEventListeners', () => {
    it('clears all registered listeners across all buses', () => {
      const c1 = vi.fn();
      const r1 = vi.fn();
      const a1 = vi.fn();
      const b1 = vi.fn();

      onCollapsed(c1);
      onRevealed(r1);
      onAllowed(a1);
      onBlocked(b1);

      clearEventListeners();

      onCollapsed(dummyTile, dummyVideo, dummyVerdict);
      onRevealed(dummyTile, dummyVideo);
      onAllowed('@c');
      onBlocked('@b', dummyTile);

      expect(c1).not.toHaveBeenCalled();
      expect(r1).not.toHaveBeenCalled();
      expect(a1).not.toHaveBeenCalled();
      expect(b1).not.toHaveBeenCalled();
    });
  });
});
