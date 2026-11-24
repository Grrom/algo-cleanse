import { expect, test } from './fixtures';

test.describe('AlgoCleanse E2E smoke tests', () => {
  // Acceptance criterion 1: Clickbait tile shows [data-ac-card] with at least one reason chip; clean tile has no card
  test('1. Clickbait tile shows [data-ac-card] with at least one reason chip; clean tile has no card', async ({
    page,
  }) => {
    await page.goto('https://www.youtube.com/');

    const clickbaitTile = page.locator('#clickbait-tile');
    const cleanTile = page.locator('#clean-tile');

    // Clickbait tile should be collapsed with [data-ac-card] and at least one reason chip
    await expect(clickbaitTile.locator('[data-ac-card]')).toBeVisible();
    const chipsCount = await clickbaitTile.locator('[data-ac-chip]').count();
    expect(chipsCount).toBeGreaterThan(0);

    // Clean tile should have no card
    await expect(cleanTile.locator('[data-ac-card]')).toHaveCount(0);
  });

  // Acceptance criterion 2: Clicking [data-ac-action=show] removes the card and shows the original tile
  test('2. Clicking [data-ac-action=show] removes the card and shows the original tile', async ({
    page,
  }) => {
    await page.goto('https://www.youtube.com/');

    const clickbaitTile = page.locator('#clickbait-tile');
    await expect(clickbaitTile.locator('[data-ac-card]')).toBeVisible();

    // Click "Show anyway" button
    const showBtn = clickbaitTile.locator('[data-ac-action=show]');
    await showBtn.click();

    // Card should be removed and original tile displayed
    await expect(clickbaitTile.locator('[data-ac-card]')).toHaveCount(0);
    await expect(clickbaitTile).not.toHaveClass(/ac-collapsed/);
    await expect(clickbaitTile.locator('#video-title')).toBeVisible();
  });

  // Acceptance criterion 3: Shorts shelf is not visible with default settings
  test('3. Shorts shelf is not visible with default settings', async ({
    page,
  }) => {
    await page.goto('https://www.youtube.com/');

    const shortsShelf = page.locator(
      '#shorts-shelf, ytd-rich-shelf-renderer[is-shorts]',
    );
    await expect(shortsShelf).not.toBeVisible();
  });

  // Acceptance criterion 4: Tiles appended after load (simulate infinite scroll with page.evaluate) get processed
  test('4. Tiles appended after load (simulate infinite scroll with page.evaluate) get processed', async ({
    page,
  }) => {
    await page.goto('https://www.youtube.com/');

    // Initial clickbait tile should already be processed
    await expect(page.locator('#clickbait-tile [data-ac-card]')).toBeVisible();

    // Simulate infinite scroll appending a new clickbait tile
    await page.evaluate(() => {
      const contents = document.getElementById('contents');
      if (!contents) return;

      const newTile = document.createElement('ytd-rich-item-renderer');
      newTile.className = 'style-scope ytd-rich-grid-row';
      newTile.id = 'infinite-clickbait-tile';
      newTile.innerHTML = `
        <div id="content">
          <ytd-rich-grid-media>
            <div id="thumbnail">
              <a id="thumbnail" class="yt-simple-endpoint inline-block style-scope ytd-thumbnail" href="/watch?v=infinite001">
                <span class="ytd-thumbnail-overlay-time-status-renderer">11:11</span>
              </a>
            </div>
            <div id="details">
              <div id="meta">
                <h3 class="style-scope ytd-rich-grid-media">
                  <a id="video-title-link" class="yt-simple-endpoint style-scope ytd-rich-grid-media" title="SHOCKING DISCOVERY (GONE WRONG) 😱😱😱!!!" href="/watch?v=infinite001">
                    <yt-formatted-string id="video-title">SHOCKING DISCOVERY (GONE WRONG) 😱😱😱!!!</yt-formatted-string>
                  </a>
                </h3>
                <div id="channel-info">
                  <ytd-channel-name id="channel-name">
                    <div id="container"><div id="text-container">
                      <yt-formatted-string id="text" title="Infinite Vlogs">
                        <a class="yt-simple-endpoint style-scope yt-formatted-string" href="/@InfiniteVlogs">Infinite Vlogs</a>
                      </yt-formatted-string>
                    </div></div>
                  </ytd-channel-name>
                </div>
              </div>
            </div>
          </ytd-rich-grid-media>
        </div>
      `;
      contents.appendChild(newTile);
    });

    const infiniteTile = page.locator('#infinite-clickbait-tile');
    await expect(infiniteTile.locator('[data-ac-card]')).toBeVisible();
    const chipsCount = await infiniteTile.locator('[data-ac-chip]').count();
    expect(chipsCount).toBeGreaterThan(0);
  });

  // Acceptance criterion 5: Hovering the clean tile and clicking [data-ac-action=block] collapses it with reason "You blocked this channel"
  test('5. Hovering the clean tile and clicking [data-ac-action=block] collapses it with reason "You blocked this channel"', async ({
    page,
  }) => {
    await page.goto('https://www.youtube.com/');

    const cleanTile = page.locator('#clean-tile');
    await expect(cleanTile.locator('[data-ac-card]')).toHaveCount(0);

    // Hover over clean tile to show block button
    await cleanTile.hover();
    const blockBtn = cleanTile.locator('[data-ac-action=block]');
    await expect(blockBtn).toBeVisible();

    // Click block button
    await blockBtn.click();

    // Clean tile should now be collapsed with "You blocked this channel" reason
    await expect(cleanTile.locator('[data-ac-card]')).toBeVisible();
    await expect(cleanTile.locator('[data-ac-chip]')).toContainText(
      'You blocked this channel',
    );
  });
});
