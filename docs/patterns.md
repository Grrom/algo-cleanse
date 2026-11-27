# Pattern Updates & Maintainer Guide

AlgoCleanse uses rule patterns defined in `patterns/patterns.json` to detect clickbait, sensationalism, and unwanted content in YouTube feeds.

This document describes how patterns reach client extensions, how to add or update rules, and the requirements for version bumping and remote updates.

## How Patterns Reach Users

Patterns reach users through two mechanisms:

1. **Built-in Bundled Copy:**
   - At extension build time, `patterns/patterns.json` is imported into the bundle via `src/core/bundled-patterns.ts` and validated against the Zod schema in `src/core/patterns-schema.ts`.
   - The bundled copy provides immediate, out-of-the-box filtering upon installation without waiting for network requests.

2. **Cloudflare Worker Remote Distribution:**
   - The Cloudflare Worker (`worker/src/index.ts`) serves the latest `patterns/patterns.json` from `main`.
   - Changes merged into `main` that touch `patterns/**` automatically trigger `.github/workflows/deploy-worker.yml` to deploy the updated file to the Worker.

3. **Background Updater & Version Selection:**
   - Installed extensions periodically poll the Worker for updates (`src/background/pattern-updater.ts`):
     - On initial install.
     - On browser startup.
     - Periodically every 12 hours via the `patterns-refresh` alarm.
   - The extension fetches `${WXT_API_BASE_URL}/patterns.json`.
   - **Higher revision wins:** The updater verifies that the downloaded file is valid, matches the engine requirement (`minEngineVersion <= ENGINE_VERSION`), and has a `revision` strictly greater than the current copy (`src/core/active-patterns.ts`).
   - If accepted, the updated patterns are saved to `storage.local.remotePatterns` and broadcast to open YouTube tabs via `watchPatterns()`.

> [!IMPORTANT]
> The extension **only** accepts remote pattern updates if the remote `revision` is strictly greater than the copy currently in use.

## Revision Bumping Rules

Whenever you make any change to `patterns/patterns.json`:

- **Always bump `revision` by 1:**
  If a pull request modifies `patterns/patterns.json` without incrementing `revision`, the Worker will deploy the new patterns on merge, but **no installed extension will ever apply them**.
- **Update `version`:**
  Set `version` to the date of modification formatted as `YYYY.MM.DD` (e.g. `"2026.11.27"`).
- **CI Revision Guard:**
  GitHub Actions (`.github/workflows/ci.yml`) runs `npm run patterns:revision-check` on every pull request. If `patterns/patterns.json` is modified without increasing `revision`, the CI build will fail.

## Engine Version Compatibility (`minEngineVersion`)

- `src/core/engine-version.ts` defines `ENGINE_VERSION` (an integer, e.g. `1`).
- `patterns/patterns.json` defines `minEngineVersion`.
- **Bump `minEngineVersion` only together with an `ENGINE_VERSION` change:**
  If you introduce a brand-new rule type or schema change that requires new evaluation logic in `src/core/engine.ts`, bump both `minEngineVersion` in `patterns/patterns.json` and `ENGINE_VERSION` in `src/core/engine-version.ts`.
- **Why this matters:**
  If a remote pattern file has `minEngineVersion > ENGINE_VERSION`, older installed extension versions will reject the update and continue using their valid local copy without crashing.

## How to Add a Rule or Category

`patterns/patterns.json` contains two primary arrays: `categories` and `rules`.

### Adding a Category

Categories group rules together and allow users to toggle detection rules or auto-"Not interested" actions per category in the extension options:

```json
{
  "id": "new-category",
  "label": "Human Readable Label",
  "description": "Short explanation of what this category targets."
}
```

### Adding a Rule

Rules define criteria evaluated against video titles and metadata:

```json
{
  "id": "rule-identifier",
  "category": "new-category",
  "type": "titleRegex",
  "pattern": "\\b(sample|pattern)\\b",
  "flags": "i",
  "weight": 2,
  "label": "Matched sample pattern"
}
```

Common rule types supported by `src/core/engine.ts`:

- `titleRegex`: Evaluates a regular expression against the video title.
- `capsRatio`: Measures the ratio of uppercase letters in titles with a minimum length.
- `punctRun`: Detects repeated punctuation marks (e.g. `!!!`, `???`).
- `emojiCount`: Detects titles containing too many emoji characters.
- `channelId`: Matches specific channel IDs (e.g. known AI content channels).

### Validating Changes Locally

Before opening a pull request, run:

```bash
# Validate patterns against the Zod schema
npm run patterns:check

# Check revision bump against the base branch
npm run patterns:revision-check -- /tmp/base-patterns.json patterns/patterns.json

# Run unit tests
npm test
```

## Remote Updates & Environment Configuration

For remote updates to operate end-to-end:

1. **Cloudflare Worker Secrets:**
   The repository must have the following secrets and variables configured for `.github/workflows/deploy-worker.yml`:
   - `CLOUDFLARE_API_TOKEN` (secret)
   - `CLOUDFLARE_ACCOUNT_ID` (secret)
   - `D1_DATABASE_ID` (repository variable)

2. **Release Build Configuration:**
   Release builds (`.github/workflows/release.yml`) must have `WXT_API_BASE_URL` defined at build time (e.g. `https://algo-cleanse.workers.dev`). If `WXT_API_BASE_URL` is empty, extensions will rely entirely on their bundled patterns and will not poll for remote updates.
