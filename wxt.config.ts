import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifestVersion: 3,
  manifest: {
    name: 'AlgoCleanse',
    description:
      'Cleanse YouTube recommendations, collapse clickbait, and remove Shorts.',
    permissions: ['storage', 'alarms'],
    icons: {
      16: '/icons/icon-16.png',
      32: '/icons/icon-32.png',
      48: '/icons/icon-48.png',
      128: '/icons/icon-128.png',
    },
    browser_specific_settings: {
      gecko: {
        id: 'algo-cleanse@grrom',
        strict_min_version: '142.0',
        data_collection_permissions: {
          required: ['none'],
          optional: ['technicalAndInteraction'],
        },
      },
    },
  },
  zip: {
    excludeSources: ['**/coverage/**', '**/.icarus/**'],
  },
});
