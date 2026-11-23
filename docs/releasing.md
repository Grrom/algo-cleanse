# Releasing AlgoCleanse

This document describes how to release new versions of AlgoCleanse and the one-time configuration required for store automation.

## Release Process

### 1. Bump Version

Update the version number in `package.json` to the target version (e.g. `0.1.0`):

```bash
# In package.json, update "version": "X.Y.Z"
```

Verify that linting, typechecking, and tests pass:

```bash
npm run lint
npm run typecheck
npm test
```

### 2. Commit and Tag

Commit the version bump to `main`:

```bash
git add package.json package-lock.json
git commit -m "chore: bump version to vX.Y.Z"
git push origin main
```

Create a matching git tag prefixed with `v`:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

> [!IMPORTANT]
> The tag name (without `v`) must strictly match `"version"` in `package.json`.
> The release workflow verifies this using `scripts/check-version.mjs` and aborts if there is a mismatch.

### 3. Automated Release Pipeline

Pushing tag `vX.Y.Z` automatically triggers `.github/workflows/release.yml`:

1. **Tag & Version Check**: Ensures tag `vX.Y.Z` matches `package.json` version `X.Y.Z`.
2. **Build & Package**: Runs `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run release`.
   - Produces three release packages in `.output/`:
     - Chrome MV3 zip (`algo-cleanse-X.Y.Z-chrome.zip`)
     - Firefox MV3 zip (`algo-cleanse-X.Y.Z-firefox.zip`)
     - Firefox source code zip (`algo-cleanse-X.Y.Z-sources.zip`)
   - Injects repository variable `WXT_API_BASE_URL` if set.
3. **GitHub Release**: Creates a GitHub Release for tag `vX.Y.Z` with release notes and attaches all three zips.
4. **Chrome Web Store**: Uploads the Chrome zip and publishes the extension via `chrome-webstore-upload-cli`.
5. **Firefox Add-ons (AMO)**: Signs and submits the Firefox extension and sources zip via `web-ext sign --channel=listed`.

---

## Dry Run Verification

You can test the packaging workflow manually at any time without creating a GitHub Release or publishing to stores:

1. Navigate to **Actions** > **Release** in the GitHub repository.
2. Click **Run workflow**.
3. Keep the **Dry run** option checked (`dry_run: true`).
4. Click **Run workflow**.

On dry run:

- All linting, typechecking, tests, and build steps run.
- All three zips are packaged.
- The zips are uploaded as workflow artifact `release-artifacts`.
- GitHub Release creation and store publishing steps are cleanly skipped.

---

## One-Time Setup

Before automated store publishing can succeed, the store listings must be established manually by the owners, and API credentials must be added to repository secrets.

### 1. Create Initial Store Listings Manually

Both the Chrome Web Store and Mozilla Add-ons (AMO) require the first version of an extension to be created and submitted manually through their developer dashboards:

1. Run a dry run workflow dispatch, or run `npm run release` locally to build the release packages.
2. **Chrome Web Store**:
   - Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
   - Click **Add new item** and upload `.output/algo-cleanse-X.Y.Z-chrome.zip`.
   - Complete store metadata, screenshots, descriptions, and privacy policy.
   - Note down the generated **Extension ID** from the dashboard URL or item details.
3. **Firefox Add-ons (AMO)**:
   - Go to the [Mozilla Add-ons Developer Hub](https://addons.mozilla.org/developers/).
   - Click **Submit a New Add-on**.
   - Select **On this site (listed)**.
   - Upload `.output/algo-cleanse-X.Y.Z-firefox.zip` as the extension and `.output/algo-cleanse-X.Y.Z-sources.zip` as the source code archive.
   - Complete required listing details and submit.

### 2. Generate Store API Credentials

#### Chrome Web Store API

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project with the Chrome Web Store API enabled.
3. Configure the OAuth Consent Screen and create OAuth 2.0 Credentials (Desktop application or Web application).
4. Obtain the **Client ID** and **Client Secret**.
5. Generate a **Refresh Token** with scope `https://www.googleapis.com/auth/chromewebstore` using OAuth 2.0 authorization flow.

#### Mozilla Add-ons (AMO) API

1. Sign in to the [Mozilla Add-ons Developer Hub](https://addons.mozilla.org/developers/).
2. Go to **Tools** > **Manage API Keys**.
3. Generate a new API Key (JWT Issuer) and API Secret.

### 3. Configure GitHub Repository Secrets

Add the six required secrets in GitHub under **Settings** > **Secrets and variables** > **Actions**:

| Secret Name         | Description                             | Store            |
| ------------------- | --------------------------------------- | ---------------- |
| `CWS_EXTENSION_ID`  | Chrome Web Store Extension ID           | Chrome Web Store |
| `CWS_CLIENT_ID`     | Google OAuth 2.0 Client ID              | Chrome Web Store |
| `CWS_CLIENT_SECRET` | Google OAuth 2.0 Client Secret          | Chrome Web Store |
| `CWS_REFRESH_TOKEN` | Google OAuth 2.0 Refresh Token          | Chrome Web Store |
| `AMO_JWT_ISSUER`    | Mozilla Add-ons API Key (JWT Issuer)    | Firefox Add-ons  |
| `AMO_JWT_SECRET`    | Mozilla Add-ons API Secret (JWT Secret) | Firefox Add-ons  |

### 4. Configure Repository Variables (Optional)

| Variable Name      | Description                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| `WXT_API_BASE_URL` | Base URL for remote pattern updates and feedback endpoints (e.g. `https://api.algocleanse.com`). |

---

## Graceful Skip Behavior

If any store secrets are not configured or are left empty:

- The workflow **does not fail**.
- The GitHub Release is still created with all three zips attached.
- A GitHub Actions notice is emitted for each missing store's step:
  - `Missing Chrome Web Store secrets (...); skipping Chrome Web Store upload and publish.`
  - `Missing Firefox Add-ons secrets (...); skipping Firefox Add-ons signing and publish.`
