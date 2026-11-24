import type { Verdict } from '../../core/engine';
import type { VideoInfo } from '../../core/types';

export type CollapsedListener = (
  tile: Element,
  video: VideoInfo,
  verdict: Verdict,
) => void;

export type RevealedListener = (tile: Element, video: VideoInfo) => void;

export type AllowedListener = (handle: string) => void;

export type BlockedListener = (handle: string, tile: Element) => void;

export interface EventBusFunction<
  Listener extends (...args: never[]) => void,
  Args extends unknown[],
> {
  (listener: Listener): () => void;
  (...args: Args): void;
  addListener(listener: Listener): () => void;
  removeListener(listener: Listener): void;
  subscribe(listener: Listener): () => void;
  emit(...args: Args): void;
  clear(): void;
}

const allBuses: { clear(): void }[] = [];

function createEventBus<
  Listener extends (...args: never[]) => void,
  Args extends unknown[],
>(): EventBusFunction<Listener, Args> {
  const listeners = new Set<Listener>();

  const bus = ((...args: unknown[]) => {
    if (args.length === 1 && typeof args[0] === 'function') {
      const listener = args[0] as Listener;
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
    const typedArgs = args as unknown as Args;
    for (const listener of Array.from(listeners)) {
      try {
        (listener as unknown as (...args: unknown[]) => void)(...typedArgs);
      } catch (err) {
        console.error('Error in event listener:', err);
      }
    }
  }) as EventBusFunction<Listener, Args>;

  bus.addListener = (listener: Listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  bus.removeListener = (listener: Listener) => {
    listeners.delete(listener);
  };

  bus.subscribe = bus.addListener;

  bus.emit = (...args: Args) => {
    for (const listener of Array.from(listeners)) {
      try {
        (listener as unknown as (...args: unknown[]) => void)(...args);
      } catch (err) {
        console.error('Error in event listener:', err);
      }
    }
  };

  bus.clear = () => {
    listeners.clear();
  };

  allBuses.push(bus);
  return bus;
}

/**
 * Event bus for tile collapse events.
 * Fires once per collapsed tile+videoId with the verdict.
 */
export const onCollapsed: EventBusFunction<
  CollapsedListener,
  [tile: Element, video: VideoInfo, verdict: Verdict]
> = createEventBus();

/**
 * Event bus for tile reveal events (Show anyway).
 */
export const onRevealed: EventBusFunction<
  RevealedListener,
  [tile: Element, video: VideoInfo]
> = createEventBus();

/**
 * Event bus for channel allow events (Always allow channel).
 */
export const onAllowed: EventBusFunction<AllowedListener, [handle: string]> =
  createEventBus();

/**
 * Event bus for channel block events (Block channel).
 */
export const onBlocked: EventBusFunction<
  BlockedListener,
  [handle: string, tile: Element]
> = createEventBus();

export function emitCollapsed(
  tile: Element,
  video: VideoInfo,
  verdict: Verdict,
): void {
  onCollapsed.emit(tile, video, verdict);
}

export function emitRevealed(tile: Element, video: VideoInfo): void {
  onRevealed.emit(tile, video);
}

export function emitAllowed(handle: string): void {
  onAllowed.emit(handle);
}

export function emitBlocked(handle: string, tile: Element): void {
  onBlocked.emit(handle, tile);
}

/**
 * Resets all listeners on all event buses.
 */
export function clearEventListeners(): void {
  for (const bus of allBuses) {
    bus.clear();
  }
}

/**
 * Unified events object.
 */
export const events = {
  onCollapsed,
  onRevealed,
  onAllowed,
  onBlocked,
  emitCollapsed,
  emitRevealed,
  emitAllowed,
  emitBlocked,
  clear: clearEventListeners,
};
