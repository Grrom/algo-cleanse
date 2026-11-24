import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  allowChannel,
  blockChannel,
  CHANNELS_KEY,
  getSettings,
  normalizeChannelHandle,
  removeChannel,
  SETTINGS_KEY,
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

    // Partial stored settings merged with defaults (unknown keys dropped, wrong types replaced)
    await fakeBrowser.storage.sync.set({
      [SETTINGS_KEY]: {
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

    // 1001st entry drops the oldest in blockedChannels (seed directly to local.channels)
    const thousandBlocked = Array.from(
      { length: 1000 },
      (_, i) => `@chan-${i}`,
    );
    await fakeBrowser.storage.local.set({
      [CHANNELS_KEY]: {
        blockedChannels: thousandBlocked,
        allowedChannels: [],
      },
    });

    await blockChannel('chan-1000'); // 1001st entry
    settings = await getSettings();
    expect(settings.blockedChannels).toHaveLength(1000);
    expect(settings.blockedChannels.includes('@chan-0')).toBe(false); // oldest dropped
    expect(settings.blockedChannels[0]).toBe('@chan-1');
    expect(settings.blockedChannels[settings.blockedChannels.length - 1]).toBe(
      '@chan-1000',
    );

    // 1001st entry drops the oldest in allowedChannels (seed directly to local.channels)
    const thousandAllowed = Array.from(
      { length: 1000 },
      (_, i) => `@allowed-${i}`,
    );
    await fakeBrowser.storage.local.set({
      [CHANNELS_KEY]: {
        blockedChannels: settings.blockedChannels,
        allowedChannels: thousandAllowed,
      },
    });

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

  // After blockChannel/allowChannel, the lists are in storage.local key channels, and storage.sync key settings contains no blockedChannels/allowedChannels field
  it('After blockChannel/allowChannel, the lists are in storage.local key channels, and storage.sync key settings contains no blockedChannels/allowedChannels field', async () => {
    await blockChannel('Foo');
    await allowChannel('Bar');

    const localData = await fakeBrowser.storage.local.get(CHANNELS_KEY);
    expect(localData[CHANNELS_KEY]).toEqual({
      blockedChannels: ['@foo'],
      allowedChannels: ['@bar'],
    });

    // Assert sync item was not created by lists-only changes
    const syncDataBefore = await fakeBrowser.storage.sync.get(SETTINGS_KEY);
    expect(syncDataBefore[SETTINGS_KEY]).toBeUndefined();

    // Now seed sync.settings and verify subsequent lists-only changes do not change sync.settings
    await fakeBrowser.storage.sync.set({
      [SETTINGS_KEY]: { enabled: true, strictness: 'gentle' },
    });

    await blockChannel('Baz');

    const syncDataAfter = await fakeBrowser.storage.sync.get(SETTINGS_KEY);
    const syncItemAfter = syncDataAfter[SETTINGS_KEY] as Record<
      string,
      unknown
    >;
    expect(syncItemAfter).toEqual({
      enabled: true,
      strictness: 'gentle',
    });
    expect('blockedChannels' in syncItemAfter).toBe(false);
    expect('allowedChannels' in syncItemAfter).toBe(false);

    const localDataAfter = (await fakeBrowser.storage.local.get(
      CHANNELS_KEY,
    )) as {
      [CHANNELS_KEY]: { blockedChannels: string[]; allowedChannels: string[] };
    };
    expect(localDataAfter[CHANNELS_KEY]).toEqual({
      blockedChannels: ['@foo', '@baz'],
      allowedChannels: ['@bar'],
    });
  });

  // With 1000 handles in each list, updateSettings({ enabled: false }) succeeds and the JSON of the sync.settings item plus its key is under 8192 bytes
  it('With 1000 handles in each list, updateSettings({ enabled: false }) succeeds and the JSON of the sync.settings item plus its key is under 8192 bytes', async () => {
    const thousandBlocked = Array.from(
      { length: 1000 },
      (_, i) => `@block-${i}`,
    );
    const thousandAllowed = Array.from(
      { length: 1000 },
      (_, i) => `@allow-${i}`,
    );

    await fakeBrowser.storage.local.set({
      [CHANNELS_KEY]: {
        blockedChannels: thousandBlocked,
        allowedChannels: thousandAllowed,
      },
    });

    // updateSettings({ enabled: false }) succeeds
    const updated = await updateSettings({ enabled: false });
    expect(updated.enabled).toBe(false);
    expect(updated.blockedChannels).toHaveLength(1000);
    expect(updated.allowedChannels).toHaveLength(1000);

    const syncData = await fakeBrowser.storage.sync.get(SETTINGS_KEY);
    const syncItem = syncData[SETTINGS_KEY] as Record<string, unknown>;
    expect(syncItem).toBeDefined();
    expect('blockedChannels' in syncItem).toBe(false);
    expect('allowedChannels' in syncItem).toBe(false);

    const encodedSize = new TextEncoder().encode(
      SETTINGS_KEY + JSON.stringify(syncItem),
    ).length;
    expect(encodedSize).toBeLessThan(8192);

    // Verify local storage lists remain intact
    const localData = (await fakeBrowser.storage.local.get(CHANNELS_KEY)) as {
      [CHANNELS_KEY]: { blockedChannels: string[]; allowedChannels: string[] };
    };
    expect(localData[CHANNELS_KEY].blockedChannels).toHaveLength(1000);
    expect(localData[CHANNELS_KEY].allowedChannels).toHaveLength(1000);
  });

  // watchSettings fires when local.channels changes (e.g. after blockChannel) and does not fire for a change to an unrelated local key
  it('watchSettings fires when local.channels changes (e.g. after blockChannel) and does not fire for a change to an unrelated local key', async () => {
    const received: Settings[] = [];
    const unsubscribe = watchSettings((s) => {
      received.push(s);
    });

    await blockChannel('x');
    expect(received).toHaveLength(1);
    expect(received[0]?.blockedChannels).toEqual(['@x']);

    // Unrelated local key change must not fire the callback
    await fakeBrowser.storage.local.set({ other: 1 });
    expect(received).toHaveLength(1);

    // Unrelated sync key change must not fire the callback
    await fakeBrowser.storage.sync.set({ unrelated: 'value' });
    expect(received).toHaveLength(1);

    unsubscribe();
  });

  // List fields present in the sync.settings item are ignored by getSettings
  it('List fields present in the sync.settings item are ignored by getSettings', async () => {
    await fakeBrowser.storage.sync.set({
      [SETTINGS_KEY]: {
        enabled: false,
        blockedChannels: ['@stale'],
        allowedChannels: ['@stale2'],
      },
    });

    const settings = await getSettings();
    expect(settings.enabled).toBe(false);
    expect(settings.blockedChannels).toEqual([]);
    expect(settings.allowedChannels).toEqual([]);
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
