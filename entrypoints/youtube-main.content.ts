/**
 * MAIN world content script for AlgoCleanse.
 * Inspects YouTube Polymer / Innertube renderer data to identify menu item indices
 * without relying on localized English label text.
 */

interface FeedbackEndpointData {
  feedbackToken?: string;
}

interface ServiceItemData {
  icon?: { iconType?: string };
  serviceEndpoint?: { feedbackEndpoint?: FeedbackEndpointData };
  text?: { runs?: { text?: string }[] };
}

interface MenuItemData {
  menuServiceItemRenderer?: ServiceItemData;
  icon?: { iconType?: string };
  serviceEndpoint?: { feedbackEndpoint?: FeedbackEndpointData };
  text?: { runs?: { text?: string }[] };
}

function findMenuDataFromElement(
  el: Element | null | undefined,
): MenuItemData[] | null {
  if (!el) return null;
  const anyEl = el as unknown as Record<string, unknown>;

  const contentRenderer = anyEl.data as
    | {
        content?: {
          videoRenderer?: {
            menu?: { menuRenderer?: { items?: MenuItemData[] } };
          };
        };
        menu?: { menuRenderer?: { items?: MenuItemData[] } };
        items?: MenuItemData[];
      }
    | undefined;

  if (contentRenderer?.content?.videoRenderer?.menu?.menuRenderer?.items) {
    return contentRenderer.content.videoRenderer.menu.menuRenderer.items;
  }
  if (contentRenderer?.menu?.menuRenderer?.items) {
    return contentRenderer.menu.menuRenderer.items;
  }
  if (contentRenderer?.items) {
    return contentRenderer.items;
  }

  const dataHost = anyEl.__data as
    | {
        data?: {
          content?: {
            videoRenderer?: {
              menu?: { menuRenderer?: { items?: MenuItemData[] } };
            };
          };
        };
        menu?: { menuRenderer?: { items?: MenuItemData[] } };
        items?: MenuItemData[];
      }
    | undefined;

  if (dataHost?.data?.content?.videoRenderer?.menu?.menuRenderer?.items) {
    return dataHost.data.content.videoRenderer.menu.menuRenderer.items;
  }
  if (dataHost?.menu?.menuRenderer?.items) {
    return dataHost.menu.menuRenderer.items;
  }
  if (dataHost?.items) {
    return dataHost.items;
  }

  return null;
}

function classifyMenuItem(
  itemData: MenuItemData | undefined,
): 'not-interested' | 'dont-recommend' | null {
  if (!itemData) return null;
  const serviceItem = itemData.menuServiceItemRenderer ?? itemData;
  const iconType: string = serviceItem?.icon?.iconType ?? '';
  const token: string =
    serviceItem?.serviceEndpoint?.feedbackEndpoint?.feedbackToken ?? '';

  if (
    iconType === 'NOT_INTERESTED' ||
    iconType.includes('NOT_INTERESTED') ||
    token.includes('not_interested')
  ) {
    return 'not-interested';
  }

  if (
    iconType === 'REMOVE' ||
    iconType === 'DONT_RECOMMEND' ||
    iconType === 'CHANNEL_OFF' ||
    iconType === 'REMOVE_CHANNEL' ||
    iconType === 'BLOCK' ||
    iconType.includes('DONT_RECOMMEND') ||
    token.includes('dont_recommend') ||
    token.includes('channel')
  ) {
    return 'dont-recommend';
  }

  return null;
}

export function tagMenuElements(root: Document | Element = document): void {
  const items = root.querySelectorAll(
    'ytd-menu-service-item-renderer, ytd-menu-navigation-item-renderer, tp-yt-paper-item, yt-list-item-view-model',
  );

  items.forEach((item, index) => {
    const anyItem = item as unknown as Record<string, unknown>;
    const itemData = (anyItem.data ?? anyItem.__data) as
      MenuItemData | undefined;
    const classified = classifyMenuItem(itemData);
    if (classified) {
      item.setAttribute('data-ac-item-type', classified);
      item.setAttribute('data-ac-item-index', String(index));
    }
  });
}

export default defineContentScript({
  matches: ['*://www.youtube.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    window.addEventListener('ac-resolve-menu', (event: Event) => {
      const customEvent = event as CustomEvent<{ tile?: Element }>;
      const tile = customEvent.detail?.tile;
      const menuItems = findMenuDataFromElement(tile);

      if (Array.isArray(menuItems)) {
        let notInterestedIndex = -1;
        let dontRecommendIndex = -1;

        menuItems.forEach((mItem, idx) => {
          const type = classifyMenuItem(mItem);
          if (type === 'not-interested' && notInterestedIndex === -1) {
            notInterestedIndex = idx;
          }
          if (type === 'dont-recommend' && dontRecommendIndex === -1) {
            dontRecommendIndex = idx;
          }
        });

        if (tile) {
          tile.setAttribute(
            'data-ac-menu-indices',
            JSON.stringify({ notInterestedIndex, dontRecommendIndex }),
          );
        }
      }

      tagMenuElements(document);
    });

    document.addEventListener(
      'click',
      (e) => {
        const target = e.target as Element | null;
        if (
          target?.closest?.(
            'ytd-menu-renderer, .yt-lockup-view-model-wiz__menu, yt-icon-button',
          )
        ) {
          setTimeout(() => tagMenuElements(document), 50);
        }
      },
      true,
    );
  },
});
