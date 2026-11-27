# algo-cleanse

fyp algorithm cleanser for social media

AlgoCleanse is a Chrome + Firefox (Manifest V3) extension that cleanses your recommendation algorithm on YouTube.

## Features

- **Collapse Clickbait**: Collapses clickbait and addictive videos into a small card showing what was filtered and why.
- **Remove Shorts**: Hides Shorts sections and redirects Shorts to standard video watch pages.
- **Block & Allow Channels**: Allows users to block or always-allow channels.
- **Train Recommendations**: Helps train your account recommendations by dispatching YouTube's native "Not interested" and "Don't recommend channel" signals.

## Getting Started

### Prerequisites

- Node.js 22+
- npm

### Installation

```bash
npm install
```

### Development

```bash
# Run Chrome extension in development mode
npm run dev

# Run Firefox extension in development mode
npm run dev:firefox
```

### Building

```bash
# Build Chrome MV3 extension (.output/chrome-mv3)
npm run build

# Build Firefox MV3 extension (.output/firefox-mv3)
npm run build:firefox

# Create zip packages (.output/)
npm run zip
npm run zip:firefox
```

## Patterns

Clickbait detection patterns and categories are maintained in `patterns/patterns.json`. For detailed instructions on adding rules, revision bumping requirements, and remote update behavior, see [docs/patterns.md](docs/patterns.md).

## Loading Unpacked Extension

### Google Chrome / Chromium

1. Run `npm run build`.
2. Open Chrome and navigate to `chrome://extensions`.
3. Toggle **Developer mode** on (top-right).
4. Click **Load unpacked** and select the `.output/chrome-mv3` directory.

### Mozilla Firefox

1. Run `npm run build:firefox`.
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...**.
4. Select `.output/firefox-mv3/manifest.json`.

## Testing & Quality Checks

```bash
# Run unit tests
npm test

# Run unit tests with coverage
npm run test:coverage

# Run TypeScript type check
npm run typecheck

# Run linter and formatting checks
npm run lint

# Check patterns schema
npm run patterns:check

# Check patterns revision bump
npm run patterns:revision-check -- <base> <head>

# Format code
npm run format
```
