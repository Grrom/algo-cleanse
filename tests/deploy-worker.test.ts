import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const deployWorkflowPath = path.resolve(
  rootDir,
  '.github/workflows/deploy-worker.yml',
);
const ciWorkflowPath = path.resolve(rootDir, '.github/workflows/ci.yml');
const wranglerPath = path.resolve(rootDir, 'worker/wrangler.toml');
const readmePath = path.resolve(rootDir, 'worker/README.md');
const migrationPath = path.resolve(
  rootDir,
  'worker/migrations/0001_feedback.sql',
);
const privacyDocPath = path.resolve(rootDir, 'docs/privacy.md');

describe('deploy-worker automation & worker configuration', () => {
  // Acceptance criterion: Deploy workflow runs only on `patterns/**`/`worker/**` changes on main (or manual), validates patterns first, and succeeds with a notice when secrets/variable are missing
  it('Deploy workflow runs only on patterns/**/worker/** changes on main (or manual), validates patterns first, and succeeds with a notice when secrets/variable are missing', () => {
    expect(fs.existsSync(deployWorkflowPath)).toBe(true);
    const content = fs.readFileSync(deployWorkflowPath, 'utf8');

    // Trigger on push to main with path filters
    expect(content).toContain('branches: [main]');
    expect(content).toContain("- 'patterns/**'");
    expect(content).toContain("- 'worker/**'");

    // Trigger on workflow_dispatch
    expect(content).toContain('workflow_dispatch:');

    // Validates patterns first
    const patternIndex = content.indexOf('npm run patterns:check');
    const workerTestIndex = content.indexOf('npm test');
    const deployIndex = content.indexOf('wrangler deploy');
    expect(patternIndex).toBeGreaterThan(-1);
    expect(workerTestIndex).toBeGreaterThan(patternIndex);
    expect(deployIndex).toBeGreaterThan(workerTestIndex);

    // Concurrency deploy-worker with cancel-in-progress: true
    expect(content).toContain('concurrency:');
    expect(content).toContain('group: deploy-worker');
    expect(content).toMatch(/cancel-in-progress:\s*true/);

    // Checks secrets and variable and succeeds with notice
    expect(content).toContain('CLOUDFLARE_API_TOKEN');
    expect(content).toContain('CLOUDFLARE_ACCOUNT_ID');
    expect(content).toContain('D1_DATABASE_ID');
    expect(content).toContain(
      '::notice::Missing Cloudflare secrets or variable',
    );
    expect(content).toContain(
      'wrangler d1 migrations apply algo-cleanse --remote',
    );
    expect(content).toContain('wrangler deploy');
  });

  // Worker tests also run in ci.yml on PRs
  it('Worker tests also run in ci.yml on PRs', () => {
    expect(fs.existsSync(ciWorkflowPath)).toBe(true);
    const content = fs.readFileSync(ciWorkflowPath, 'utf8');

    expect(content).toContain('working-directory: worker');
    expect(content).toContain('npm test');
  });

  // worker/wrangler.toml: worker name algo-cleanse, D1 binding DB with database_name = "algo-cleanse" and database_id filled at deploy time, rate limit binding
  it('worker/wrangler.toml has name algo-cleanse, D1 binding DB, and rate limit binding', () => {
    expect(fs.existsSync(wranglerPath)).toBe(true);
    const content = fs.readFileSync(wranglerPath, 'utf8');

    expect(content).toMatch(/name\s*=\s*"algo-cleanse"/);
    expect(content).toMatch(/binding\s*=\s*"DB"/);
    expect(content).toMatch(/database_name\s*=\s*"algo-cleanse"/);
    expect(content).toContain('D1_DATABASE_ID_PLACEHOLDER');
    expect(content).toMatch(/name\s*=\s*"RATE_LIMITER"/);
    expect(content).toMatch(/limit\s*=\s*30/);
    expect(content).toMatch(/period\s*=\s*60/);
  });

  // worker/migrations/0001_feedback.sql defines table feedback with all design columns
  it('worker/migrations/0001_feedback.sql defines table feedback with all design columns', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS feedback');
    expect(sql).toContain('id INTEGER PRIMARY KEY');
    expect(sql).toContain('received_at TEXT NOT NULL');
    expect(sql).toContain('kind TEXT NOT NULL');
    expect(sql).toContain('video_id TEXT NOT NULL');
    expect(sql).toContain('title TEXT NOT NULL');
    expect(sql).toContain('channel_handle TEXT');
    expect(sql).toContain('matched_rule_ids TEXT NOT NULL');
    expect(sql).toContain('score INTEGER NOT NULL');
    expect(sql).toContain('strictness TEXT NOT NULL');
    expect(sql).toContain('patterns_revision INTEGER NOT NULL');
    expect(sql).toContain('extension_version TEXT NOT NULL');
    expect(sql).toContain('browser TEXT NOT NULL');
  });

  // worker/README.md documents one-time setup and how to query feedback with wrangler d1 execute
  it('worker/README.md documents one-time setup and how to query feedback with wrangler d1 execute', () => {
    expect(fs.existsSync(readmePath)).toBe(true);
    const readme = fs.readFileSync(readmePath, 'utf8');

    expect(readme).toContain('CLOUDFLARE_API_TOKEN');
    expect(readme).toContain('CLOUDFLARE_ACCOUNT_ID');
    expect(readme).toContain('D1_DATABASE_ID');
    expect(readme).toContain('WXT_API_BASE_URL');
    expect(readme).toContain('wrangler d1 execute');
    expect(readme).toContain('wrangler d1 migrations apply');
  });

  // docs/privacy.md exists and is non-empty
  it('docs/privacy.md exists and is non-empty', () => {
    expect(fs.existsSync(privacyDocPath)).toBe(true);
    const doc = fs.readFileSync(privacyDocPath, 'utf8');
    expect(doc.length).toBeGreaterThan(50);
    expect(doc).toContain('Privacy Policy');
  });
});
