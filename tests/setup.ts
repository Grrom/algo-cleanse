import { fakeBrowser } from 'wxt/testing/fake-browser';

const target = globalThis as unknown as {
  browser: typeof fakeBrowser;
  chrome: typeof fakeBrowser;
};
target.browser = fakeBrowser;
target.chrome = fakeBrowser;
