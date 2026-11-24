import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from 'wxt/utils/storage';
import { initPopup } from '../entrypoints/popup/main';
import { BUNDLED_PATTERNS } from '../src/core/bundled-patterns';
import {
  CHANNELS_KEY,
  getSettings,
  SETTINGS_KEY,
  updateSettings,
} from '../src/core/settings';

const popupHtmlPath = path.resolve(
  __dirname,
  '../entrypoints/popup/index.html',
);
const rawHtml = fs.readFileSync(popupHtmlPath, 'utf8');
const bodyMatch = rawHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
const popupBodyHtml = (bodyMatch ? bodyMatch[1] : rawHtml) ?? '';

const tick = () => new Promise((resolve) => setTimeout(resolve, 15));

describe('popup', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await storage.clear('local');
    document.body.innerHTML = popupBodyHtml;
  });

  it('renders the extension name AlgoCleanse', () => {
    const heading = document.querySelector('h1');
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toBe('AlgoCleanse');
  });

  // Acceptance Criterion: Popup renders current settings from storage (fake-browser test)
  it('Popup renders current settings from storage (fake-browser test)', async () => {
    await fakeBrowser.storage.sync.set({
      [SETTINGS_KEY]: {
        enabled: false,
        strictness: 'gentle',
        hideShorts: false,
        autoNotInterested: true,
        autoCategories: ['bait-phrase'],
        dontRecommendOnBlock: false,
        feedbackConsent: 'granted',
      },
    });
    await fakeBrowser.storage.local.set({
      [CHANNELS_KEY]: {
        blockedChannels: ['@badchannel'],
        allowedChannels: ['@goodchannel1', '@goodchannel2'],
      },
    });

    await initPopup(document.body);

    // Verify strictness
    const gentleBtn =
      document.querySelector<HTMLButtonElement>('#strictness-gentle')!;
    const balancedBtn = document.querySelector<HTMLButtonElement>(
      '#strictness-balanced',
    )!;
    const strictBtn =
      document.querySelector<HTMLButtonElement>('#strictness-strict')!;
    expect(gentleBtn.classList.contains('active')).toBe(true);
    expect(gentleBtn.getAttribute('aria-checked')).toBe('true');
    expect(balancedBtn.classList.contains('active')).toBe(false);
    expect(strictBtn.classList.contains('active')).toBe(false);

    // Verify filter clickbait toggle
    const filterToggle = document.querySelector<HTMLInputElement>(
      '#toggle-filter-clickbait',
    )!;
    expect(filterToggle.checked).toBe(false);

    // Verify remove shorts toggle
    const shortsToggle = document.querySelector<HTMLInputElement>(
      '#toggle-remove-shorts',
    )!;
    expect(shortsToggle.checked).toBe(false);

    // Verify auto-send not interested toggle
    const autoToggle = document.querySelector<HTMLInputElement>(
      '#toggle-auto-not-interested',
    )!;
    expect(autoToggle.checked).toBe(true);

    // Verify category checkboxes: bait-phrase checked, shouting unchecked
    const baitCheckbox =
      document.querySelector<HTMLInputElement>('#cat-bait-phrase')!;
    expect(baitCheckbox.checked).toBe(true);
    const shoutingCheckbox =
      document.querySelector<HTMLInputElement>('#cat-shouting')!;
    expect(shoutingCheckbox.checked).toBe(false);

    // Verify dont recommend toggle
    const dontRecommendToggle = document.querySelector<HTMLInputElement>(
      '#toggle-dont-recommend',
    )!;
    expect(dontRecommendToggle.checked).toBe(false);

    // Verify feedback toggle
    const feedbackToggle =
      document.querySelector<HTMLInputElement>('#toggle-feedback')!;
    expect(feedbackToggle.checked).toBe(true);

    // Verify link counts
    const blockedCount = document.querySelector('#blocked-count')!;
    expect(blockedCount.textContent).toBe('1');
    const allowedCount = document.querySelector('#allowed-count')!;
    expect(allowedCount.textContent).toBe('2');

    // Verify patterns rev
    const revFooter = document.querySelector('#patterns-revision')!;
    expect(revFooter.textContent).toBe(
      `Patterns rev ${BUNDLED_PATTERNS.revision}`,
    );
  });

  // Acceptance Criterion: Selecting Strict stores strictness: 'strict'; each toggle stores its value; feedback toggle stores granted/denied
  it("Selecting Strict stores strictness: 'strict'; each toggle stores its value; feedback toggle stores granted/denied", async () => {
    await initPopup(document.body);

    // 1. Selecting Strict stores strictness: 'strict'
    const strictBtn =
      document.querySelector<HTMLButtonElement>('#strictness-strict')!;
    strictBtn.click();
    await tick();
    let settings = await getSettings();
    expect(settings.strictness).toBe('strict');
    expect(strictBtn.classList.contains('active')).toBe(true);

    // 2. Filter clickbait toggle
    const filterToggle = document.querySelector<HTMLInputElement>(
      '#toggle-filter-clickbait',
    )!;
    expect(filterToggle.checked).toBe(true);
    filterToggle.checked = false;
    filterToggle.dispatchEvent(new Event('change'));
    await tick();
    settings = await getSettings();
    expect(settings.enabled).toBe(false);

    // 3. Remove Shorts toggle
    const shortsToggle = document.querySelector<HTMLInputElement>(
      '#toggle-remove-shorts',
    )!;
    expect(shortsToggle.checked).toBe(true);
    shortsToggle.checked = false;
    shortsToggle.dispatchEvent(new Event('change'));
    await tick();
    settings = await getSettings();
    expect(settings.hideShorts).toBe(false);

    // 4. Auto-send Not interested toggle
    const autoToggle = document.querySelector<HTMLInputElement>(
      '#toggle-auto-not-interested',
    )!;
    expect(autoToggle.checked).toBe(false);
    autoToggle.checked = true;
    autoToggle.dispatchEvent(new Event('change'));
    await tick();
    settings = await getSettings();
    expect(settings.autoNotInterested).toBe(true);

    // 5. Don't recommend toggle
    const dontRecommendToggle = document.querySelector<HTMLInputElement>(
      '#toggle-dont-recommend',
    )!;
    expect(dontRecommendToggle.checked).toBe(true);
    dontRecommendToggle.checked = false;
    dontRecommendToggle.dispatchEvent(new Event('change'));
    await tick();
    settings = await getSettings();
    expect(settings.dontRecommendOnBlock).toBe(false);

    // 6. Feedback toggle stores granted/denied
    const feedbackToggle =
      document.querySelector<HTMLInputElement>('#toggle-feedback')!;
    expect(feedbackToggle.checked).toBe(false); // default unset -> false
    // Toggle on -> granted
    feedbackToggle.checked = true;
    feedbackToggle.dispatchEvent(new Event('change'));
    await tick();
    settings = await getSettings();
    expect(settings.feedbackConsent).toBe('granted');

    // Toggle off -> denied
    feedbackToggle.checked = false;
    feedbackToggle.dispatchEvent(new Event('change'));
    await tick();
    settings = await getSettings();
    expect(settings.feedbackConsent).toBe('denied');
  });

  // Acceptance Criterion: One checkbox per patterns category is rendered; checking bait-phrase adds it to autoCategories, unchecking removes it
  it('One checkbox per patterns category is rendered; checking bait-phrase adds it to autoCategories, unchecking removes it', async () => {
    await initPopup(document.body);

    const categories = BUNDLED_PATTERNS.categories;
    const checkboxes =
      document.querySelectorAll<HTMLInputElement>('.category-checkbox');
    expect(checkboxes.length).toBe(categories.length);

    for (const cat of categories) {
      const cb = document.querySelector<HTMLInputElement>(`#cat-${cat.id}`);
      expect(cb).not.toBeNull();
    }

    const baitCheckbox =
      document.querySelector<HTMLInputElement>('#cat-bait-phrase')!;
    expect(baitCheckbox.checked).toBe(false);

    // Checking bait-phrase adds it to autoCategories
    baitCheckbox.checked = true;
    baitCheckbox.dispatchEvent(new Event('change'));
    await tick();
    let settings = await getSettings();
    expect(settings.autoCategories).toContain('bait-phrase');

    // Unchecking removes it
    baitCheckbox.checked = false;
    baitCheckbox.dispatchEvent(new Event('change'));
    await tick();
    settings = await getSettings();
    expect(settings.autoCategories).not.toContain('bait-phrase');
  });

  // Acceptance Criterion: Category checkboxes are disabled when autoNotInterested is false; hint shows when it's true and autoCategories is empty
  it("Category checkboxes are disabled when autoNotInterested is false; hint shows when it's true and autoCategories is empty", async () => {
    await initPopup(document.body);

    const checkboxes =
      document.querySelectorAll<HTMLInputElement>('.category-checkbox');
    expect(checkboxes.length).toBeGreaterThan(0);
    checkboxes.forEach((cb) => {
      expect(cb.disabled).toBe(true);
    });

    const hint = document.querySelector<HTMLElement>('#no-categories-hint')!;
    // When autoNotInterested is false, hint is hidden
    expect(hint.style.display).toBe('none');

    // Turn autoNotInterested on
    const autoToggle = document.querySelector<HTMLInputElement>(
      '#toggle-auto-not-interested',
    )!;
    autoToggle.checked = true;
    autoToggle.dispatchEvent(new Event('change'));
    await tick();

    // Checkboxes are now enabled
    checkboxes.forEach((cb) => {
      expect(cb.disabled).toBe(false);
    });

    // AutoCategories is still empty, so hint must now show
    expect(hint.style.display).not.toBe('none');
    expect(hint.textContent).toContain('Pick at least one filter');

    // Now check a category
    const baitCheckbox =
      document.querySelector<HTMLInputElement>('#cat-bait-phrase')!;
    baitCheckbox.checked = true;
    baitCheckbox.dispatchEvent(new Event('change'));
    await tick();

    // Hint should now be hidden
    expect(hint.style.display).toBe('none');

    // Uncheck category -> hint shows again
    baitCheckbox.checked = false;
    baitCheckbox.dispatchEvent(new Event('change'));
    await tick();
    expect(hint.style.display).not.toBe('none');
  });

  // Acceptance Criterion: Link counts match list lengths
  it('Link counts match list lengths', async () => {
    await fakeBrowser.storage.local.set({
      [CHANNELS_KEY]: {
        blockedChannels: ['@b1', '@b2', '@b3'],
        allowedChannels: ['@a1', '@a2'],
      },
    });

    await initPopup(document.body);

    const blockedLink = document.querySelector<HTMLAnchorElement>(
      '#blocked-channels-link',
    )!;
    const allowedLink = document.querySelector<HTMLAnchorElement>(
      '#allowed-channels-link',
    )!;
    const blockedCount = document.querySelector<HTMLElement>('#blocked-count')!;
    const allowedCount = document.querySelector<HTMLElement>('#allowed-count')!;

    expect(blockedCount.textContent).toBe('3');
    expect(allowedCount.textContent).toBe('2');
    expect(blockedLink.textContent).toContain('Blocked channels (3)');
    expect(allowedLink.textContent).toContain('Always-allowed channels (2)');

    // Dynamically update settings and verify counts update
    await updateSettings({
      blockedChannels: ['@b1'],
      allowedChannels: ['@a1', '@a2', '@a3', '@a4'],
    });
    await tick();

    expect(blockedCount.textContent).toBe('1');
    expect(allowedCount.textContent).toBe('4');
    expect(blockedLink.textContent).toContain('Blocked channels (1)');
    expect(allowedLink.textContent).toContain('Always-allowed channels (4)');
  });

  it('clicking channel links calls browser.runtime.openOptionsPage', async () => {
    const openOptionsSpy = vi
      .spyOn(fakeBrowser.runtime, 'openOptionsPage')
      .mockImplementation(async () => {});
    await initPopup(document.body);

    const blockedLink = document.querySelector<HTMLAnchorElement>(
      '#blocked-channels-link',
    )!;
    blockedLink.click();
    expect(openOptionsSpy).toHaveBeenCalledTimes(1);

    const allowedLink = document.querySelector<HTMLAnchorElement>(
      '#allowed-channels-link',
    )!;
    allowedLink.click();
    expect(openOptionsSpy).toHaveBeenCalledTimes(2);
  });
});
