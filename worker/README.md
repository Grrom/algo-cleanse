# AlgoCleanse Cloudflare Worker

A lightweight Cloudflare Worker backend for the AlgoCleanse extension.

It serves:

- `GET /patterns.json`: The latest maintained detection patterns file (`patterns/patterns.json`), cached for 5 minutes with CORS enabled.
- `POST /feedback`: Opt-in anonymous feedback endpoint storing reports in Cloudflare D1.
- `GET /privacy`: Static HTML rendering of `docs/privacy.md`.

## One-Time Owner Setup

Follow these steps to configure your Cloudflare account and GitHub repository for automated deployment:

1. **Create D1 Database:**

   ```bash
   npx wrangler d1 create algo-cleanse
   ```

   Note the `database_id` returned in the command output.

2. **Add GitHub Repository Secrets:**
   In your GitHub repository settings under **Settings > Secrets and variables > Actions > Secrets**:
   - `CLOUDFLARE_API_TOKEN`: Cloudflare API token with permissions:
     - `Account > Workers Scripts > Edit`
     - `Account > D1 > Edit`
   - `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare Account ID (found on the Cloudflare dashboard overview).

3. **Add GitHub Repository Variable:**
   Under **Settings > Secrets and variables > Actions > Variables**:
   - `D1_DATABASE_ID`: The UUID of the `algo-cleanse` D1 database created in step 1.

4. **Set Extension API URL (After First Deploy):**
   Once the worker deploys successfully to `https://algo-cleanse.<your-subdomain>.workers.dev`:
   - Add GitHub repository variable `WXT_API_BASE_URL` with your Worker URL.

## Database Migrations

Database migrations live in `worker/migrations/`.

- **Apply migrations locally:**

  ```bash
  npx wrangler d1 migrations apply algo-cleanse --local
  ```

- **Apply migrations to remote D1 database:**
  ```bash
  npx wrangler d1 migrations apply algo-cleanse --remote
  ```

## Querying Feedback with `wrangler d1 execute`

You can query the feedback table directly using the Wrangler CLI.

### Query Recent Feedback (Remote)

```bash
npx wrangler d1 execute algo-cleanse --remote --command="SELECT id, received_at, kind, video_id, title, channel_handle, score, strictness, browser FROM feedback ORDER BY id DESC LIMIT 20;"
```

### Query Feedback Counts by Kind

```bash
npx wrangler d1 execute algo-cleanse --remote --command="SELECT kind, count(*) AS total FROM feedback GROUP BY kind;"
```

### Query Feedback by Matched Rule

```bash
npx wrangler d1 execute algo-cleanse --remote --command="SELECT id, video_id, title, matched_rule_ids, score FROM feedback WHERE matched_rule_ids LIKE '%gone-wrong%' LIMIT 20;"
```

### Query Local Development Database

```bash
npx wrangler d1 execute algo-cleanse --local --command="SELECT * FROM feedback;"
```

## Local Development & Testing

- **Run tests:**
  ```bash
  npm test
  ```
- **Run local development server:**
  ```bash
  npx wrangler dev
  ```
