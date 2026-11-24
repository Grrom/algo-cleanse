import { browser } from 'wxt/browser';

/**
 * Handles browser.runtime.onInstalled event.
 * Opens the welcome onboarding page on install only (not on update).
 */
export function handleWelcomeInstalled(details?: { reason?: string }): void {
  if (details?.reason === 'install') {
    const b =
      typeof browser !== 'undefined'
        ? browser
        : (globalThis as unknown as { browser?: typeof browser }).browser;
    if (b?.tabs?.create && b?.runtime?.getURL) {
      void b.tabs.create({
        url: b.runtime.getURL('/welcome.html'),
      });
    }
  }
}

export function initWelcomeHandler(): void {
  const b =
    typeof browser !== 'undefined'
      ? browser
      : (globalThis as unknown as { browser?: typeof browser }).browser;
  b?.runtime?.onInstalled?.addListener?.(handleWelcomeInstalled);
}
