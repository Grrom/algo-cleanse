import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from 'wxt/utils/storage';
import { initWelcome } from '../entrypoints/welcome/main';
import {
  handleWelcomeInstalled,
  initWelcomeHandler,
} from '../src/background/welcome';
import { getSettings } from '../src/core/settings';

const welcomeHtmlPath = path.resolve(
  __dirname,
  '../entrypoints/welcome/index.html',
);
const rawHtml = fs.readFileSync(welcomeHtmlPath, 'utf8');
const bodyMatch = rawHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
const welcomeBodyHtml = (bodyMatch ? bodyMatch[1] : rawHtml) ?? '';

const tick = () => new Promise((resolve) => setTimeout(resolve, 15));

describe('welcome onboarding & consent', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await storage.clear('sync');
    await storage.clear('local');
    document.body.innerHTML = welcomeBodyHtml;
    vi.restoreAllMocks();
  });

  // Acceptance criterion: Welcome page opens on install, not on update
  it('Welcome page opens on install, not on update', async () => {
    const tabsCreateSpy = vi.spyOn(fakeBrowser.tabs, 'create');

    // 1. Reason 'install' opens welcome.html
    handleWelcomeInstalled({ reason: 'install' });
    expect(tabsCreateSpy).toHaveBeenCalledTimes(1);
    expect(tabsCreateSpy).toHaveBeenCalledWith({
      url: expect.stringContaining('/welcome.html'),
    });

    // 2. Reason 'update' does not open welcome.html
    tabsCreateSpy.mockClear();
    handleWelcomeInstalled({ reason: 'update' });
    expect(tabsCreateSpy).not.toHaveBeenCalled();

    // 3. Test runtime event trigger via initWelcomeHandler
    initWelcomeHandler();
    tabsCreateSpy.mockClear();
    await fakeBrowser.runtime.onInstalled.trigger({
      reason: 'update',
      previousVersion: '0.0.9',
    });
    expect(tabsCreateSpy).not.toHaveBeenCalled();

    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install' });
    expect(tabsCreateSpy).toHaveBeenCalledTimes(1);
    expect(tabsCreateSpy).toHaveBeenCalledWith({
      url: expect.stringContaining('/welcome.html'),
    });
  });

  // Acceptance criterion: Yes stores granted, No stores denied
  it('Yes stores granted, No stores denied', async () => {
    await initWelcome(document.body);

    const yesBtn =
      document.querySelector<HTMLButtonElement>('#btn-consent-yes');
    const noBtn = document.querySelector<HTMLButtonElement>('#btn-consent-no');
    expect(yesBtn).not.toBeNull();
    expect(noBtn).not.toBeNull();

    // 1. Clicking Yes stores 'granted'
    yesBtn!.click();
    await tick();

    let settings = await getSettings();
    expect(settings.feedbackConsent).toBe('granted');
    expect(yesBtn!.classList.contains('selected')).toBe(true);

    // 2. Clicking No stores 'denied'
    noBtn!.click();
    await tick();

    settings = await getSettings();
    expect(settings.feedbackConsent).toBe('denied');
    expect(noBtn!.classList.contains('selected')).toBe(true);
    expect(yesBtn!.classList.contains('selected')).toBe(false);
  });

  it('closing without choosing leaves consent unset', async () => {
    await initWelcome(document.body);

    // Without clicking either button, feedbackConsent remains 'unset'
    const settings = await getSettings();
    expect(settings.feedbackConsent).toBe('unset');
  });

  it('lists exactly the required feedback payload items and privacy protections', () => {
    const htmlText = (document.body.textContent ?? '').replace(/\s+/g, ' ');
    expect(htmlText).toContain('Wrongly filtered?');
    expect(htmlText).toContain('Clickbait?');
    expect(htmlText).toContain('the video’s ID, title and channel handle');
    expect(htmlText).toContain('which rules matched and your strictness');
    expect(htmlText).toContain('extension and patterns version');
    expect(htmlText).toContain(
      'No account, no browsing history, no IP stored. Channels you block are never sent.',
    );
  });
});
