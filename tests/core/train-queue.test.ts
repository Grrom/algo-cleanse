import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isAutoEligible, type Verdict } from '../../src/core/engine';
import {
  ACTED_VIDEO_IDS_KEY,
  type Clock,
  DAILY_ACTIONS_KEY,
  getDailyAutoCount,
  getLocalDateString,
  isVideoActed,
  markVideoActed,
  type StorageAreaLike,
  type TrainJob,
  TrainQueue,
} from '../../src/core/train-queue';
import { DEFAULT_SETTINGS, type Settings } from '../../src/core/types';

class FakeClock implements Clock {
  public currentTime = 1_000_000;
  private timers: { id: number; callback: () => void; runAt: number }[] = [];
  private nextId = 1;

  now(): number {
    return this.currentTime;
  }

  setTimeout(callback: () => void, ms: number): number {
    const id = this.nextId++;
    this.timers.push({ id, callback, runAt: this.currentTime + ms });
    return id;
  }

  clearTimeout(id: unknown): void {
    const numId = id as number;
    this.timers = this.timers.filter((t) => t.id !== numId);
  }

  tick(ms: number): void {
    this.currentTime += ms;
    while (true) {
      const readyTimers = this.timers
        .filter((t) => t.runAt <= this.currentTime)
        .sort((a, b) => a.runAt - b.runAt);
      if (readyTimers.length === 0) break;
      const nextTimer = readyTimers[0]!;
      this.timers = this.timers.filter((t) => t.id !== nextTimer.id);
      nextTimer.callback();
    }
  }

  advanceToNext(): number {
    if (this.timers.length === 0) return 0;
    this.timers.sort((a, b) => a.runAt - b.runAt);
    const nextTimer = this.timers[0]!;
    const diff = Math.max(0, nextTimer.runAt - this.currentTime);
    this.tick(diff);
    return diff;
  }

  getTimerCount(): number {
    return this.timers.length;
  }
}

class FakeStorage implements StorageAreaLike {
  public data: Record<string, unknown> = {};

  async get(
    keys: string | string[] | Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const res: Record<string, unknown> = {};
    if (typeof keys === 'string') {
      if (keys in this.data) res[keys] = this.data[keys];
    } else if (Array.isArray(keys)) {
      for (const k of keys) {
        if (k in this.data) res[k] = this.data[k];
      }
    }
    return res;
  }

  async set(items: Record<string, unknown>): Promise<void> {
    Object.assign(this.data, items);
  }
}

describe('train-queue', () => {
  let fakeClock: FakeClock;
  let fakeStorage: FakeStorage;

  beforeEach(() => {
    fakeClock = new FakeClock();
    fakeStorage = new FakeStorage();
  });

  // Acceptance criterion 3:
  // Auto: eligible verdict enqueues; autoNotInterested false -> nothing; no selected category matched -> nothing
  it('Auto: eligible verdict enqueues; autoNotInterested false -> nothing; no selected category matched -> nothing', () => {
    const baseSettings: Settings = {
      ...DEFAULT_SETTINGS,
      autoNotInterested: true,
      autoCategories: ['bait-phrase', 'sensational'],
    };

    const eligibleVerdict: Verdict = {
      flagged: true,
      score: 4,
      reasons: ['Bait phrase'],
      matchedRuleIds: ['gone-wrong'],
      matchedCategories: ['bait-phrase'],
      source: 'patterns',
    };

    // 1. Eligible verdict with matching category enqueues
    expect(isAutoEligible(eligibleVerdict, baseSettings)).toBe(true);

    // 2. autoNotInterested false -> nothing
    const disabledSettings: Settings = {
      ...baseSettings,
      autoNotInterested: false,
    };
    expect(isAutoEligible(eligibleVerdict, disabledSettings)).toBe(false);

    // 3. no selected category matched -> nothing
    const noMatchSettings: Settings = {
      ...baseSettings,
      autoCategories: ['ai-slop', 'emoji-spam'],
    };
    expect(isAutoEligible(eligibleVerdict, noMatchSettings)).toBe(false);

    // 4. blocklist verdict -> not eligible
    const blocklistVerdict: Verdict = {
      ...eligibleVerdict,
      source: 'blocklist',
    };
    expect(isAutoEligible(blocklistVerdict, baseSettings)).toBe(false);
  });

  // Acceptance criterion 4:
  // Fake clock: first auto action no earlier than 15 s; consecutive actions 20–60 s apart
  it('Fake clock: first auto action no earlier than 15 s; consecutive actions 20–60 s apart', async () => {
    // Inject deterministic random generator: returns 0.25 -> gap = 20s + 0.25 * 40s = 30s
    const fixedRandom = () => 0.25;
    const queue = new TrainQueue({
      clock: fakeClock,
      storage: fakeStorage,
      random: fixedRandom,
    });

    const actionExecutionTimes: number[] = [];

    const job1: TrainJob = {
      videoId: 'vid1',
      action: async () => {
        actionExecutionTimes.push(fakeClock.now());
        return 'ok';
      },
    };

    const job2: TrainJob = {
      videoId: 'vid2',
      action: async () => {
        actionExecutionTimes.push(fakeClock.now());
        return 'ok';
      },
    };

    const tickAndFlush = async (ms: number) => {
      fakeClock.tick(ms);
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }
    };

    const startTime = fakeClock.now();
    queue.enqueue(job1);
    queue.enqueue(job2);

    // After 14.999 s, no action should have run yet
    await tickAndFlush(14_999);
    expect(actionExecutionTimes.length).toBe(0);

    // At 15 s (>= 15 s after enqueue), first action runs
    await tickAndFlush(1);
    expect(actionExecutionTimes.length).toBe(1);
    expect(actionExecutionTimes[0]! - startTime).toBe(15_000);

    // Consecutive action must be 30 s later (20s - 60s gap)
    await tickAndFlush(29_999);
    expect(actionExecutionTimes.length).toBe(1);

    await tickAndFlush(1);
    expect(actionExecutionTimes.length).toBe(2);
    expect(actionExecutionTimes[1]! - actionExecutionTimes[0]!).toBe(30_000);
  });

  // Acceptance criterion 5:
  // onRevealed before the job runs cancels it; onAllowed cancels that channel's jobs; manual click cancels the pending auto job for that video
  it("onRevealed before the job runs cancels it; onAllowed cancels that channel's jobs; manual click cancels the pending auto job for that video", async () => {
    const queue = new TrainQueue({
      clock: fakeClock,
      storage: fakeStorage,
    });

    const job1Ran = vi.fn().mockResolvedValue('ok');
    const job2Ran = vi.fn().mockResolvedValue('ok');
    const job3Ran = vi.fn().mockResolvedValue('ok');

    queue.enqueue({
      videoId: 'revealVid',
      channelHandle: '@channel1',
      action: job1Ran,
    });

    queue.enqueue({
      videoId: 'allowVid',
      channelHandle: '@channelAllow',
      action: job2Ran,
    });

    queue.enqueue({
      videoId: 'manualVid',
      channelHandle: '@channelManual',
      action: job3Ran,
    });

    expect(queue.getPendingCount()).toBe(3);

    // 1. onRevealed before job runs cancels it
    queue.cancelVideo('revealVid');
    expect(queue.getPendingCount()).toBe(2);

    // 2. onAllowed cancels that channel's jobs
    queue.cancelChannel('@channelallow');
    expect(queue.getPendingCount()).toBe(1);

    // 3. manual click cancels the pending auto job for that video
    queue.cancelVideo('manualVid');
    expect(queue.getPendingCount()).toBe(0);

    // Advance clock past wait time
    fakeClock.tick(100_000);
    await Promise.resolve();

    expect(job1Ran).not.toHaveBeenCalled();
    expect(job2Ran).not.toHaveBeenCalled();
    expect(job3Ran).not.toHaveBeenCalled();
  });

  // Acceptance criterion 6:
  // 41st auto action on the same date is dropped; counter resets the next date
  it('41st auto action on the same date is dropped; counter resets the next date', async () => {
    const queue = new TrainQueue({
      clock: fakeClock,
      storage: fakeStorage,
      random: () => 0, // min gap 20s
    });

    const today = getLocalDateString(fakeClock.now());

    // Pre-populate storage with 40 daily actions
    await fakeStorage.set({
      [DAILY_ACTIONS_KEY]: {
        date: today,
        count: 40,
      },
    });

    const action41 = vi.fn().mockResolvedValue('ok');
    queue.enqueue({
      videoId: 'vid41',
      action: action41,
    });

    const tickAndFlush = async (ms: number) => {
      fakeClock.tick(ms);
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }
    };

    // Advance clock past wait
    await tickAndFlush(20_000);

    // 41st action is dropped because daily cap is 40
    expect(action41).not.toHaveBeenCalled();
    const countToday = await getDailyAutoCount(fakeStorage, today);
    expect(countToday).toBe(40);

    // Advance clock to next date (24 hours later)
    await tickAndFlush(24 * 60 * 60 * 1000);
    const tomorrow = getLocalDateString(fakeClock.now());
    expect(tomorrow).not.toBe(today);

    // Counter resets on the next date
    const countTomorrow = await getDailyAutoCount(fakeStorage, tomorrow);
    expect(countTomorrow).toBe(0);

    // New action on the next date succeeds
    const nextDayAction = vi.fn().mockResolvedValue('ok');
    queue.enqueue({
      videoId: 'vidTomorrow',
      action: nextDayAction,
    });

    await tickAndFlush(20_000);

    expect(nextDayAction).toHaveBeenCalled();
    const newCountTomorrow = await getDailyAutoCount(fakeStorage, tomorrow);
    expect(newCountTomorrow).toBe(1);
  });

  // Acceptance criterion 7:
  // Same videoId never acted on twice, including across reloads (persisted set)
  it('Same videoId never acted on twice, including across reloads (persisted set)', async () => {
    const tickAndFlush = async (ms: number) => {
      fakeClock.tick(ms);
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }
    };

    // 1. Initial queue execution: acts on vidA, succeeds and marks as acted
    const queue1 = new TrainQueue({
      clock: fakeClock,
      storage: fakeStorage,
      random: () => 0,
    });

    const actionA1 = vi.fn().mockResolvedValue('ok');
    queue1.enqueue({
      videoId: 'vidA',
      action: actionA1,
    });

    await tickAndFlush(20_000);
    expect(actionA1).toHaveBeenCalledTimes(1);
    expect(await isVideoActed('vidA', fakeStorage)).toBe(true);

    // 2. Reload: build a NEW TrainQueue on the same fakeStorage
    const queue2 = new TrainQueue({
      clock: fakeClock,
      storage: fakeStorage,
      random: () => 0,
    });

    const actionA2 = vi.fn().mockResolvedValue('ok');
    const actionB_control = vi.fn().mockResolvedValue('ok');

    // Enqueue duplicate vidA AND un-acted positive control vidB
    queue2.enqueue({
      videoId: 'vidA',
      action: actionA2,
    });
    queue2.enqueue({
      videoId: 'vidB',
      action: actionB_control,
    });

    await tickAndFlush(20_000); // vidA runs and is skipped
    await tickAndFlush(1); // vidB runs with 0 delay

    // vidA is dropped / skipped because already acted
    expect(actionA2).not.toHaveBeenCalled();
    // positive control vidB DOES run
    expect(actionB_control).toHaveBeenCalledTimes(1);

    // 3. Manual-then-auto: manual action marks id first, then auto job is skipped
    await markVideoActed('vidManual', fakeStorage);
    expect(await isVideoActed('vidManual', fakeStorage)).toBe(true);

    const actionManualAuto = vi.fn().mockResolvedValue('ok');
    const actionC_control = vi.fn().mockResolvedValue('ok');

    queue2.enqueue({
      videoId: 'vidManual',
      action: actionManualAuto,
    });
    queue2.enqueue({
      videoId: 'vidC',
      action: actionC_control,
    });

    await tickAndFlush(20_000); // vidManual runs and is skipped (gap 20s from vidB)
    await tickAndFlush(1); // vidC runs with 0 delay

    expect(actionManualAuto).not.toHaveBeenCalled();
    expect(actionC_control).toHaveBeenCalledTimes(1);

    // 4. Persisted set preserves across reloads and caps at 2000
    for (let i = 0; i < 2005; i++) {
      await markVideoActed(`v_${i}`, fakeStorage);
    }
    const stored = (await fakeStorage.get(ACTED_VIDEO_IDS_KEY))[
      ACTED_VIDEO_IDS_KEY
    ] as string[];
    expect(stored.length).toBe(2000);
    expect(stored).toContain('v_2004');
    expect(stored).not.toContain('v_0'); // Oldest dropped
  });

  it('validates job state before running (drops when disconnected or videoId changed; skips when not signed in)', async () => {
    const queue = new TrainQueue({
      clock: fakeClock,
      storage: fakeStorage,
    });

    const tickAndFlush = async (ms: number) => {
      fakeClock.tick(ms);
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }
    };

    const dropAction = vi.fn().mockResolvedValue('ok');
    queue.enqueue({
      videoId: 'dropVid',
      validate: () => 'drop',
      action: dropAction,
    });

    const skipAction = vi.fn().mockResolvedValue('ok');
    queue.enqueue({
      videoId: 'skipVid',
      validate: () => 'skip',
      action: skipAction,
    });

    const validAction = vi.fn().mockResolvedValue('ok');
    queue.enqueue({
      videoId: 'validVid',
      validate: () => 'valid',
      action: validAction,
    });

    await tickAndFlush(20_000); // dropVid runs and drops
    await tickAndFlush(20_000); // skipVid runs and skips
    await tickAndFlush(20_000); // validVid runs

    expect(dropAction).not.toHaveBeenCalled();
    expect(skipAction).not.toHaveBeenCalled();
    expect(validAction).toHaveBeenCalledTimes(1);
  });
});
