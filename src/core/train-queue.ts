import { browser } from 'wxt/browser';
import { normalizeChannelHandle } from './settings';

export const ACTED_VIDEO_IDS_KEY = 'actedVideoIds';
export const DONT_RECOMMEND_HANDLES_KEY = 'dontRecommendHandles';
export const DAILY_ACTIONS_KEY = 'autoTrainDailyActions';
export const MAX_ACTED_VIDEOS = 2000;
export const DAILY_AUTO_CAP = 40;
export const MIN_WAIT_AFTER_ENQUEUE_MS = 15_000;
export const MIN_GAP_MS = 20_000;
export const MAX_GAP_MS = 60_000;

export interface Clock {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

export const defaultClock: Clock = {
  now: () => Date.now(),
  setTimeout: (cb, ms) => setTimeout(cb, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export interface StorageAreaLike {
  get(
    keys: string | string[] | Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

function getBrowserStorage(): StorageAreaLike {
  const g = globalThis as unknown as { browser?: typeof browser };
  const b = g.browser ?? browser;
  return b.storage.local as unknown as StorageAreaLike;
}

export function getLocalDateString(now: number = Date.now()): string {
  const d = new Date(now);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Checks if a videoId has already been acted on (manual or auto).
 */
export async function isVideoActed(
  videoId: string,
  storage?: StorageAreaLike,
): Promise<boolean> {
  const s = storage ?? getBrowserStorage();
  const res = await s.get(ACTED_VIDEO_IDS_KEY);
  const list = res?.[ACTED_VIDEO_IDS_KEY];
  if (!Array.isArray(list)) return false;
  return list.includes(videoId);
}

/**
 * Marks a videoId as acted on, maintaining a persisted set of last 2000 ids.
 */
export async function markVideoActed(
  videoId: string,
  storage?: StorageAreaLike,
): Promise<void> {
  const s = storage ?? getBrowserStorage();
  const res = await s.get(ACTED_VIDEO_IDS_KEY);
  const currentList: string[] = Array.isArray(res?.[ACTED_VIDEO_IDS_KEY])
    ? (res[ACTED_VIDEO_IDS_KEY] as string[])
    : [];

  const filtered = currentList.filter((id) => id !== videoId);
  filtered.push(videoId);
  const capped = filtered.slice(-MAX_ACTED_VIDEOS);
  await s.set({ [ACTED_VIDEO_IDS_KEY]: capped });
}

/**
 * Checks if a channel handle has already received "Don't recommend channel".
 */
export async function isHandleDontRecommended(
  handle: string,
  storage?: StorageAreaLike,
): Promise<boolean> {
  const s = storage ?? getBrowserStorage();
  const norm = normalizeChannelHandle(handle);
  const res = await s.get(DONT_RECOMMEND_HANDLES_KEY);
  const list = res?.[DONT_RECOMMEND_HANDLES_KEY];
  if (!Array.isArray(list)) return false;
  return list.includes(norm);
}

/**
 * Marks a channel handle as having received "Don't recommend channel".
 */
export async function markHandleDontRecommended(
  handle: string,
  storage?: StorageAreaLike,
): Promise<void> {
  const s = storage ?? getBrowserStorage();
  const norm = normalizeChannelHandle(handle);
  const res = await s.get(DONT_RECOMMEND_HANDLES_KEY);
  const currentList: string[] = Array.isArray(res?.[DONT_RECOMMEND_HANDLES_KEY])
    ? (res[DONT_RECOMMEND_HANDLES_KEY] as string[])
    : [];

  if (!currentList.includes(norm)) {
    currentList.push(norm);
    const capped = currentList.slice(-MAX_ACTED_VIDEOS);
    await s.set({ [DONT_RECOMMEND_HANDLES_KEY]: capped });
  }
}

/**
 * Gets the current daily auto action count for a local date string.
 */
export async function getDailyAutoCount(
  storage?: StorageAreaLike,
  dateStr?: string,
): Promise<number> {
  const s = storage ?? getBrowserStorage();
  const today = dateStr ?? getLocalDateString();
  const res = await s.get(DAILY_ACTIONS_KEY);
  const record = res?.[DAILY_ACTIONS_KEY] as
    { date?: string; count?: number } | undefined;
  if (record && record.date === today && typeof record.count === 'number') {
    return record.count;
  }
  return 0;
}

/**
 * Increments the daily auto action count for a local date string and returns the new count.
 */
export async function incrementDailyAutoCount(
  storage?: StorageAreaLike,
  dateStr?: string,
): Promise<number> {
  const s = storage ?? getBrowserStorage();
  const today = dateStr ?? getLocalDateString();
  const current = await getDailyAutoCount(s, today);
  const newCount = current + 1;
  await s.set({
    [DAILY_ACTIONS_KEY]: {
      date: today,
      count: newCount,
    },
  });
  return newCount;
}

export type TrainJobValidationResult = 'valid' | 'drop' | 'skip';

export interface TrainJob {
  videoId: string;
  channelHandle?: string | null;
  validate?: () => TrainJobValidationResult | Promise<TrainJobValidationResult>;
  action: () => Promise<'ok' | 'unavailable' | 'failed'>;
}

interface QueuedJob {
  job: TrainJob;
  enqueuedAt: number;
}

export interface TrainQueueOptions {
  clock?: Clock;
  random?: () => number;
  storage?: StorageAreaLike;
  dailyCap?: number;
  minWaitMs?: number;
  minGapMs?: number;
  maxGapMs?: number;
}

export class TrainQueue {
  private clock: Clock;
  private random: () => number;
  private storage: StorageAreaLike;
  private dailyCap: number;
  private minWaitMs: number;
  private minGapMs: number;
  private maxGapMs: number;

  private pendingJobs: QueuedJob[] = [];
  private activeTimer: unknown = null;
  private isProcessing = false;
  private inFlightVideoId: string | null = null;
  private lastActionFinishedAt = 0;
  private currentGap = 0;

  constructor(options?: TrainQueueOptions) {
    this.clock = options?.clock ?? defaultClock;
    this.random = options?.random ?? Math.random;
    this.storage = options?.storage ?? getBrowserStorage();
    this.dailyCap = options?.dailyCap ?? DAILY_AUTO_CAP;
    this.minWaitMs = options?.minWaitMs ?? MIN_WAIT_AFTER_ENQUEUE_MS;
    this.minGapMs = options?.minGapMs ?? MIN_GAP_MS;
    this.maxGapMs = options?.maxGapMs ?? MAX_GAP_MS;
    this.currentGap = this.calculateGap();
  }

  public isVideoInFlight(videoId: string): boolean {
    return this.inFlightVideoId === videoId;
  }

  private calculateGap(): number {
    return Math.floor(
      this.minGapMs + this.random() * (this.maxGapMs - this.minGapMs),
    );
  }

  /**
   * Enqueues a train job.
   */
  public enqueue(job: TrainJob): void {
    if (this.pendingJobs.some((q) => q.job.videoId === job.videoId)) {
      return;
    }
    const enqueuedAt = this.clock.now();
    this.pendingJobs.push({ job, enqueuedAt });
    this.scheduleNext();
  }

  /**
   * Cancels any pending job for a given videoId.
   */
  public cancelVideo(videoId: string): void {
    const prevLen = this.pendingJobs.length;
    this.pendingJobs = this.pendingJobs.filter(
      (q) => q.job.videoId !== videoId,
    );
    if (this.pendingJobs.length !== prevLen) {
      this.scheduleNext();
    }
  }

  /**
   * Cancels any pending jobs for a channel handle.
   */
  public cancelChannel(channelHandle: string): void {
    const norm = normalizeChannelHandle(channelHandle);
    const prevLen = this.pendingJobs.length;
    this.pendingJobs = this.pendingJobs.filter((q) => {
      if (!q.job.channelHandle) return true;
      return normalizeChannelHandle(q.job.channelHandle) !== norm;
    });
    if (this.pendingJobs.length !== prevLen) {
      this.scheduleNext();
    }
  }

  /**
   * Returns the count of pending jobs in queue.
   */
  public getPendingCount(): number {
    return this.pendingJobs.length;
  }

  /**
   * Clears the queue and cancels any pending timers.
   */
  public clear(): void {
    if (this.activeTimer !== null) {
      this.clock.clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }
    this.pendingJobs = [];
    this.inFlightVideoId = null;
    this.isProcessing = false;
  }

  private scheduleNext(): void {
    if (this.isProcessing) {
      return;
    }

    if (this.activeTimer !== null) {
      this.clock.clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }

    if (this.pendingJobs.length === 0) {
      return;
    }

    const next = this.pendingJobs[0];
    if (!next) {
      return;
    }
    const now = this.clock.now();
    const earliestForJob = next.enqueuedAt + this.minWaitMs;
    const earliestForGap =
      this.lastActionFinishedAt > 0
        ? this.lastActionFinishedAt + this.currentGap
        : 0;

    const targetTime = Math.max(earliestForJob, earliestForGap);
    const delay = Math.max(0, targetTime - now);

    this.activeTimer = this.clock.setTimeout(() => {
      this.activeTimer = null;
      void this.processNext();
    }, delay);
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing || this.pendingJobs.length === 0) {
      return;
    }

    this.isProcessing = true;
    const queued = this.pendingJobs.shift()!;
    const { job } = queued;
    this.inFlightVideoId = job.videoId;

    try {
      // 1. Check if video was already acted on
      const alreadyActed = await isVideoActed(job.videoId, this.storage);
      if (alreadyActed) {
        return;
      }

      // 2. Check daily cap
      const today = getLocalDateString(this.clock.now());
      const dailyCount = await getDailyAutoCount(this.storage, today);
      if (dailyCount >= this.dailyCap) {
        // Daily cap exceeded -> drop job
        return;
      }

      // 3. Check validator (e.g. tile still in DOM, videoId not changed, signed in)
      if (job.validate) {
        const validation = await job.validate();
        if (validation === 'drop' || validation === 'skip') {
          return;
        }
      }

      // 4. Run the action
      const result = await job.action();
      this.lastActionFinishedAt = this.clock.now();
      this.currentGap = this.calculateGap();

      if (result === 'ok') {
        await markVideoActed(job.videoId, this.storage);
        await incrementDailyAutoCount(this.storage, today);
      }
    } finally {
      this.inFlightVideoId = null;
      this.isProcessing = false;
      this.scheduleNext();
    }
  }
}
