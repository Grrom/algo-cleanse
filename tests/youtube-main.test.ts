import { describe, expect, it } from 'vitest';

(globalThis as Record<string, unknown>).defineContentScript = (def: unknown) =>
  def;

describe('entrypoints/youtube-main.content', () => {
  it('configures MAIN world content script for youtube.com', async () => {
    const mod = await import('../entrypoints/youtube-main.content');
    const contentScript = mod.default;

    expect(contentScript.world).toBe('MAIN');
    expect(contentScript.matches).toContain('*://www.youtube.com/*');
    expect(contentScript.runAt).toBe('document_start');
  });

  it('tags menu elements based on renderer data', async () => {
    const { tagMenuElements } =
      await import('../entrypoints/youtube-main.content');

    document.body.innerHTML = `
      <tp-yt-iron-dropdown opened>
        <ytd-menu-popup-renderer opened id="container">
          <ytd-menu-service-item-renderer id="item1">
            <span>Pas intéressé</span>
          </ytd-menu-service-item-renderer>
          <ytd-menu-service-item-renderer id="item2">
            <span>Ne pas recommander la chaîne</span>
          </ytd-menu-service-item-renderer>
        </ytd-menu-popup-renderer>
      </tp-yt-iron-dropdown>
    `;

    const item1 = document.getElementById('item1') as unknown as Record<
      string,
      unknown
    >;
    const item2 = document.getElementById('item2') as unknown as Record<
      string,
      unknown
    >;

    item1.data = {
      menuServiceItemRenderer: {
        icon: { iconType: 'NOT_INTERESTED' },
        serviceEndpoint: { feedbackEndpoint: { feedbackToken: 'token1' } },
      },
    };

    item2.data = {
      menuServiceItemRenderer: {
        icon: { iconType: 'REMOVE' },
        serviceEndpoint: { feedbackEndpoint: { feedbackToken: 'token2' } },
      },
    };

    tagMenuElements(document);

    const el1 = document.getElementById('item1');
    const el2 = document.getElementById('item2');

    expect(el1?.getAttribute('data-ac-item-type')).toBe('not-interested');
    expect(el2?.getAttribute('data-ac-item-type')).toBe('dont-recommend');
  });

  it('unwraps mixed renderer keys and compares feedback tokens before iconType', async () => {
    const { classifyMenuItem, doPopupItemsMatchTile, unwrapMenuItemData } =
      await import('../entrypoints/youtube-main.content');

    // 1. unwrapMenuItemData handles different renderer keys
    const navItem = {
      menuNavigationItemRenderer: {
        icon: { iconType: 'NOT_INTERESTED' },
        serviceEndpoint: { feedbackEndpoint: { feedbackToken: 'token_nav' } },
      },
    };
    const downloadItem = {
      menuServiceItemDownloadRenderer: {
        icon: { iconType: 'REMOVE' },
      },
    };

    expect(unwrapMenuItemData(navItem)).toEqual(navItem.menuNavigationItemRenderer);
    expect(unwrapMenuItemData(downloadItem)).toEqual(
      downloadItem.menuServiceItemDownloadRenderer,
    );

    // 2. classifyMenuItem classifies unwrapped renderers
    expect(classifyMenuItem(navItem)).toBe('not-interested');
    expect(classifyMenuItem(downloadItem)).toBe('dont-recommend');

    // 3. doPopupItemsMatchTile compares feedback tokens
    const elA = document.createElement('div') as unknown as {
      data?: unknown;
    } & HTMLDivElement;
    elA.data = {
      menuServiceItemRenderer: {
        icon: { iconType: 'NOT_INTERESTED' },
        serviceEndpoint: { feedbackEndpoint: { feedbackToken: 'token_A' } },
      },
    };
    const matchingTileItem = {
      menuServiceItemRenderer: {
        icon: { iconType: 'NOT_INTERESTED' },
        serviceEndpoint: { feedbackEndpoint: { feedbackToken: 'token_A' } },
      },
    };
    const mismatchedTokenTileItem = {
      menuServiceItemRenderer: {
        icon: { iconType: 'NOT_INTERESTED' },
        serviceEndpoint: { feedbackEndpoint: { feedbackToken: 'token_B' } },
      },
    };

    expect(doPopupItemsMatchTile([elA], [matchingTileItem])).toBe(true);
    expect(doPopupItemsMatchTile([elA], [mismatchedTokenTileItem])).toBe(false);

    // 4. doPopupItemsMatchTile falls back to iconType when no token
    const elNoToken = document.createElement('div') as unknown as {
      data?: unknown;
    } & HTMLDivElement;
    elNoToken.data = {
      menuNavigationItemRenderer: {
        icon: { iconType: 'SHARE' },
      },
    };
    const tileNoToken = {
      menuServiceItemRenderer: {
        icon: { iconType: 'SHARE' },
      },
    };
    expect(doPopupItemsMatchTile([elNoToken], [tileNoToken])).toBe(true);
  });
});
