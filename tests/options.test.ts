import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { storage } from 'wxt/utils/storage';
import { initOptions } from '../entrypoints/options/main';
import { CHANNELS_KEY, getSettings } from '../src/core/settings';

const optionsHtmlPath = path.resolve(
  __dirname,
  '../entrypoints/options/index.html',
);
const rawHtml = fs.readFileSync(optionsHtmlPath, 'utf8');
const bodyMatch = rawHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
const optionsBodyHtml = (bodyMatch ? bodyMatch[1] : rawHtml) ?? '';

const tick = () => new Promise((resolve) => setTimeout(resolve, 15));

describe('options', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await storage.clear('local');
    document.body.innerHTML = optionsBodyHtml;
  });

  // Acceptance Criterion: Options page lists handles; removing updates storage; adding Foo stores @foo
  it('Options page lists handles; removing updates storage; adding Foo stores @foo', async () => {
    // 1. Seed storage with handles
    await fakeBrowser.storage.local.set({
      [CHANNELS_KEY]: {
        blockedChannels: ['@blocked1', '@blocked2'],
        allowedChannels: ['@allowed1'],
      },
    });

    await initOptions(document.body);

    // Verify handles are listed
    const blockedItems = document.querySelectorAll(
      '#blocked-channels-list .channel-item',
    );
    expect(blockedItems.length).toBe(2);
    expect(
      document.querySelector('#blocked-channels-list')?.textContent,
    ).toContain('@blocked1');
    expect(
      document.querySelector('#blocked-channels-list')?.textContent,
    ).toContain('@blocked2');

    const allowedItems = document.querySelectorAll(
      '#allowed-channels-list .channel-item',
    );
    expect(allowedItems.length).toBe(1);
    expect(
      document.querySelector('#allowed-channels-list')?.textContent,
    ).toContain('@allowed1');

    // 2. Removing updates storage
    const removeBtn = document.querySelector<HTMLButtonElement>(
      '#blocked-channels-list .remove-btn[data-handle="@blocked1"]',
    )!;
    expect(removeBtn).not.toBeNull();
    removeBtn.click();
    await tick();

    let settings = await getSettings();
    expect(settings.blockedChannels).toEqual(['@blocked2']);
    expect(
      document.querySelector('#blocked-channels-list')?.textContent,
    ).not.toContain('@blocked1');

    // 3. Adding Foo stores @foo
    const input = document.querySelector<HTMLInputElement>(
      '#add-handle-input, #handle-input',
    )!;
    expect(input).not.toBeNull();
    input.value = 'Foo';

    const form = document.querySelector<HTMLFormElement>('#add-channel-form')!;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await tick();

    settings = await getSettings();
    expect(settings.blockedChannels).toContain('@foo');
    expect(
      document.querySelector('#blocked-channels-list')?.textContent,
    ).toContain('@foo');
  });

  it('allows adding to allowed channels list', async () => {
    await initOptions(document.body);

    const input = document.querySelector<HTMLInputElement>(
      '#add-handle-input, #handle-input',
    )!;
    input.value = 'Bar';

    const typeSelect =
      document.querySelector<HTMLSelectElement>('#channel-type')!;
    typeSelect.value = 'allowed';

    const form = document.querySelector<HTMLFormElement>('#add-channel-form')!;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await tick();

    const settings = await getSettings();
    expect(settings.allowedChannels).toContain('@bar');
    expect(
      document.querySelector('#allowed-channels-list')?.textContent,
    ).toContain('@bar');
  });
});
