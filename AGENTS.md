# Agent Guidelines & Repository Architecture

## Layout

- `entrypoints/`: Extension entrypoints (`content.ts`, `youtube-main.content.ts`, `background.ts`, `popup/`, `options/`, `welcome/`).
- `src/core/`: Platform-independent logic with no site DOM dependencies (`types.ts`, `settings.ts`, `patterns-schema.ts`, `engine.ts`, `engine-version.ts`, `bundled-patterns.ts`, `active-patterns.ts`, `train-queue.ts`).
- `src/platforms/youtube/`: All YouTube-specific DOM code (`selectors.ts`, `extract.ts`, `scanner.ts`, `collapse.ts`, `shorts.ts`, `events.ts`, `native-feedback.ts`).
- `patterns/`: Separately maintained patterns and test fixtures (`patterns.json`, `fixtures.json`). See [docs/patterns.md](docs/patterns.md).
- `worker/`: Cloudflare Worker code (serving patterns, feedback ingestion, privacy page).
- `tests/`: Automated test suite including unit tests, saved YouTube HTML fixtures (`tests/fixtures/youtube/`), and Playwright e2e tests (`tests/e2e/`).

## Commands

- `npm run dev`: Start WXT dev server for Chrome MV3.
- `npm run dev:firefox`: Start WXT dev server for Firefox MV3.
- `npm run build`: Build extension for Chrome MV3 (`.output/chrome-mv3`).
- `npm run build:firefox`: Build extension for Firefox MV3 (`.output/firefox-mv3`).
- `npm run zip`: Package Chrome extension zip into `.output/`.
- `npm run zip:firefox`: Package Firefox extension zip and sources zip into `.output/`.
- `npm run release`: Package Chrome extension zip, Firefox extension zip, and Firefox sources zip into `.output/`.
- `npm run lint`: Run ESLint and Prettier checks.
- `npm run format`: Format files using Prettier.
- `npm run typecheck`: Run TypeScript compiler check without emitting files (`tsc --noEmit`).
- `npm run patterns:check`: Run pattern schema validation.
- `npm run patterns:revision-check`: Compare base and head patterns to verify revision bump.
- `npm test`: Run Vitest unit tests.
- `npm run test:coverage`: Run Vitest unit tests with code coverage report.
- `npm run test:e2e`: Run Playwright end-to-end smoke tests against routed fixtures (builds Chrome MV3 first).

## Rules

1. **Selectors**: All YouTube selectors live in `src/platforms/youtube/selectors.ts`.
2. **DOM isolation**: `src/core/` must not touch any site's DOM.
3. **Patterns are data**: Patterns are data and must never be evaluated as code (no `eval`/`new Function`).
4. **Channel blocks privacy**: A user's own channel blocks are personal preference and must never be sent to the backend.
5. **Unit test coverage**: Every behavior change needs a Vitest test.
6. **E2E tests**: UI flows on YouTube pages also get a Playwright e2e test once `tests/e2e/` exists. Run with `npm run test:e2e`. Tests load the built Chrome MV3 extension into a persistent Chromium context with routed HTML fixtures from `tests/e2e/pages/` and must never make real network requests to youtube.com. Add a new e2e test whenever introducing or modifying YouTube DOM interactions, card collapse/reveal states, action buttons, or feed changes.
7. **Pattern revision**: Any change to `patterns/patterns.json` must increase `revision`. See [docs/patterns.md](docs/patterns.md).
