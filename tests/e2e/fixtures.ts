import {
  test as base,
  chromium,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pathToExtension = path.resolve(__dirname, '../../.output/chrome-mv3');
const pagesDir = path.resolve(__dirname, 'pages');

export const test = base.extend<{
  context: BrowserContext;
  page: Page;
}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ac-pw-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      headless: true,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });

    // Route requests to https://www.youtube.com/** to fulfilled HTML fixtures
    await context.route('https://www.youtube.com/**', async (route) => {
      const url = new URL(route.request().url());
      let fixtureFile = 'home.html';
      if (url.pathname.endsWith('.html')) {
        const basename = path.basename(url.pathname);
        if (fs.existsSync(path.join(pagesDir, basename))) {
          fixtureFile = basename;
        }
      }
      const filePath = path.join(pagesDir, fixtureFile);
      const content = fs.readFileSync(filePath, 'utf8');
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: content,
      });
    });

    // Abort all other network requests so no real network traffic occurs
    await context.route(
      (url) => !url.href.startsWith('https://www.youtube.com/'),
      (route) => {
        route.abort();
      },
    );

    await use(context);
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  },

  page: async ({ context }, use) => {
    const page = context.pages()[0] || (await context.newPage());
    await use(page);
  },
});

export { expect } from '@playwright/test';
