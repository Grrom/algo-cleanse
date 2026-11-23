import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  allowChannel,
  blockChannel,
  getSettings,
  normalizeChannelHandle,
  removeChannel,
  setAutoCategory,
  updateSettings,
  watchSettings,
} from '../../src/core/settings';
import { DEFAULT_SETTINGS, type Settings } from '../../src/core/types';

(globalThis as unknown as { browser: typeof fakeBrowser }).browser =
  fakeBrowser;

describe('Settings storage with defaults and change subscription', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  // Empty storage -> DEFAULT_SETTINGS; partial stored settings merged with defaults
  it('Empty storage -> DEFAULT_SETTINGS; partial stored settings merged with defaults', async () => {
    // Empty storage returns DEFAULT_SETTINGS
    const emptySettings = await getSettings();
    expect(emptySettings).toEqual(DEFAULT_SETTINGS);
    expect(emptySettings).not.toBe(DEFAULT_SETTINGS);
    expect(emptySettings.autoCategories).toEqual([]);
    expect(emptySettings.blockedChannels).toEqual([]);
    expect(emptySettings.allowedChannels).toEqual([]);

    // Mutating returned arrays does not mutate DEFAULT_SETTINGS
    emptySettings.blockedChannels.push('@test');
    expect(DEFAULT_SETTINGS.blockedChannels).toEqual([]);

    // Partial stored settings merged with defaults (unknown keys dropped)
    await fakeBrowser.storage.sync.set({
      settings: {
        enabled: false,
        strictness: 'strict',
        unknownKey: 'drop-me',
        extraField: 12345,
      },
    });

    const mergedSettings = await getSettings();
    expect(mergedSettings.enabled).toBe(false);
    expect(mergedSettings.strictness).toBe('strict');
    expect(mergedSettings.hideShorts).toBe(true);
    expect(mergedSettings.autoNotInterested).toBe(false);
    expect(mergedSettings.autoCategories).toEqual([]);
    expect(mergedSettings.dontRecommendOnBlock).toBe(true);
    expect(mergedSettings.feedbackConsent).toBe('unset');
    expect(mergedSettings.blockedChannels).toEqual([]);
    expect(mergedSettings.allowedChannels).toEqual([]);

    // Unknown keys must be dropped
    expect('unknownKey' in mergedSettings).toBe(false);
    expect('extraField' in mergedSettings).toBe(false);
    expect(
      (mergedSettings as unknown as Record<string, unknown>).unknownKey,
    ).toBeUndefined();
  });

  // blockChannel('Foo') stores @foo; then allowChannel('@FOO') moves it to allow list and out of block list
  it("blockChannel('Foo') stores @foo; then allowChannel('@FOO') moves it to allow list and out of block list", async () => {
    await blockChannel('Foo');

    let settings = await getSettings();
    expect(settings.blockedChannels).toEqual(['@foo']);
    expect(settings.allowedChannels).toEqual([]);

    await allowChannel('@FOO');

    settings = await getSettings();
    expect(settings.allowedChannels).toEqual(['@foo']);
    expect(settings.blockedChannels).toEqual([]);
  });

  // Duplicate add keeps one entry; 1001st entry drops the oldest
  it('Duplicate add keeps one entry; 1001st entry drops the oldest', async () => {
    // Duplicate add in blockChannel
    await blockChannel('Duplicate');
    await blockChannel('@duplicate');
    await blockChannel('@DUPLICATE');

    let settings = await getSettings();
    expect(settings.blockedChannels).toEqual(['@duplicate']);

    // Duplicate add in allowChannel
    await allowChannel('AllowedDup');
    await allowChannel('@alloweddup');

    settings = await getSettings();
    expect(settings.allowedChannels).toEqual(['@alloweddup']);

    // 1001st entry drops the oldest in blockedChannels
    const thousandBlocked = Array.from(
      { length: 1000 },
      (_, i) => `@chan-${i}`,
    );
    await updateSettings({ blockedChannels: thousandBlocked });

    await blockChannel('chan-1000'); // 1001st entry
    settings = await getSettings();
    expect(settings.blockedChannels).toHaveLength(1000);
    expect(settings.blockedChannels.includes('@chan-0')).toBe(false); // oldest dropped
    expect(settings.blockedChannels[0]).toBe('@chan-1');
    expect(settings.blockedChannels[settings.blockedChannels.length - 1]).toBe(
      '@chan-1000',
    );

    // 1001st entry drops the oldest in allowedChannels
    const thousandAllowed = Array.from(
      { length: 1000 },
      (_, i) => `@allowed-${i}`,
    );
    await updateSettings({ allowedChannels: thousandAllowed });

    await allowChannel('allowed-1000'); // 1001st entry
    settings = await getSettings();
    expect(settings.allowedChannels).toHaveLength(1000);
    expect(settings.allowedChannels.includes('@allowed-0')).toBe(false); // oldest dropped
    expect(settings.allowedChannels[0]).toBe('@allowed-1');
    expect(settings.allowedChannels[settings.allowedChannels.length - 1]).toBe(
      '@allowed-1000',
    );
  });

  // setAutoCategory('bait-phrase', true) twice stores it once; false removes it
  it("setAutoCategory('bait-phrase', true) twice stores it once; false removes it", async () => {
    await setAutoCategory('bait-phrase', true);
    let settings = await getSettings();
    expect(settings.autoCategories).toEqual(['bait-phrase']);

    // Calling twice stores it once
    await setAutoCategory('bait-phrase', true);
    settings = await getSettings();
    expect(settings.autoCategories).toEqual(['bait-phrase']);

    // Adding another category
    await setAutoCategory('emoji-spam', true);
    settings = await getSettings();
    expect(settings.autoCategories).toEqual(['bait-phrase', 'emoji-spam']);

    // false removes it
    await setAutoCategory('bait-phrase', false);
    settings = await getSettings();
    expect(settings.autoCategories).toEqual(['emoji-spam']);

    await setAutoCategory('emoji-spam', false);
    settings = await getSettings();
    expect(settings.autoCategories).toEqual([]);
  });

  // watchSettings fires after updateSettings, stops after unsubscribe
  it('watchSettings fires after updateSettings, stops after unsubscribe', async () => {
    const received: Settings[] = [];
    const unsubscribe = watchSettings((newSettings) => {
      received.push(newSettings);
    });

    await updateSettings({ enabled: false, strictness: 'strict' });
    expect(received).toHaveLength(1);
    expect(received[0]?.enabled).toBe(false);
    expect(received[0]?.strictness).toBe('strict');

    unsubscribe();

    await updateSettings({ enabled: true });
    expect(received).toHaveLength(1); // Callback was not called after unsubscribe
  });

  // removeChannel removes handle from both block and allow lists
  it('removeChannel removes handle from both block and allow lists', async () => {
    await blockChannel('ToRemoveBlocked');
    await allowChannel('ToRemoveAllowed');

    let settings = await getSettings();
    expect(settings.blockedChannels).toEqual(['@toremoveblocked']);
    expect(settings.allowedChannels).toEqual(['@toremoveallowed']);

    await removeChannel('@toremoveblocked');
    settings = await getSettings();
    expect(settings.blockedChannels).toEqual([]);

    await removeChannel('ToRemoveAllowed');
    settings = await getSettings();
    expect(settings.allowedChannels).toEqual([]);
  });

  // normalizeChannelHandle normalizes handles correctly
  it('normalizes handles to lowercase with leading @', () => {
    expect(normalizeChannelHandle('Foo')).toBe('@foo');
    expect(normalizeChannelHandle('@FOO')).toBe('@foo');
    expect(normalizeChannelHandle('@@Foo')).toBe('@foo');
    expect(normalizeChannelHandle('  @Bar  ')).toBe('@bar');
    expect(normalizeChannelHandle('baz')).toBe('@baz');
  });
});
