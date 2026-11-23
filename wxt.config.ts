import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifestVersion: 3,
  manifest: {
    name: 'AlgoCleanse',
    description:
      'Cleanse YouTube recommendations, collapse clickbait, and remove Shorts.',
    permissions: ['storage', 'alarms'],
    browser_specific_settings: {
      gecko: {
        id: 'algo-cleanse@grrom',
        strict_min_version: '121.0',
      },
    },
  },
  zip: {
    excludeSources: ['**/coverage/**', '**/.icarus/**'],
  },
});
