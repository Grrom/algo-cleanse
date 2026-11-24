import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

describe('E2E configuration and workflow', () => {
  it('package.json defines test:e2e script building Chrome MV3 first', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'),
    );
    expect(pkg.scripts?.['test:e2e']).toBeDefined();
    expect(pkg.scripts?.['test:e2e']).toContain('build');
    expect(pkg.scripts?.['test:e2e']).toContain('playwright');
  });

  it('playwright.config.ts configures testDir, trace, and html report', () => {
    const configPath = path.join(rootDir, 'playwright.config.ts');
    expect(fs.existsSync(configPath)).toBe(true);
    const content = fs.readFileSync(configPath, 'utf8');
    expect(content).toContain('tests/e2e');
    expect(content).toContain('retain-on-failure');
    expect(content).toContain('playwright-report');
  });

  it('ci.yml defines e2e job with concurrency, playwright install, and failure artifact upload', () => {
    const ciPath = path.join(rootDir, '.github/workflows/ci.yml');
    expect(fs.existsSync(ciPath)).toBe(true);
    const content = fs.readFileSync(ciPath, 'utf8');
    expect(content).toContain('e2e:');
    expect(content).toContain('ubuntu-latest');
    expect(content).toContain('npx playwright install --with-deps chromium');
    expect(content).toContain('npm run test:e2e');
    expect(content).toContain('playwright-report');
    expect(content).toContain('test-results');
    expect(content).toContain('if: failure()');
    expect(content).toContain('concurrency:');
    expect(content).toContain('cancel-in-progress: true');
  });

  it('AGENTS.md documents test:e2e command and rule on when to add e2e tests', () => {
    const agentsPath = path.join(rootDir, 'AGENTS.md');
    expect(fs.existsSync(agentsPath)).toBe(true);
    const content = fs.readFileSync(agentsPath, 'utf8');
    expect(content).toContain('npm run test:e2e');
    expect(content).toContain('persistent Chromium context');
    expect(content).toContain('tests/e2e/pages/');
  });

  it('HTML fixture home.html exists and contains clickbait tile, clean tile, and shorts shelf', () => {
    const fixturePath = path.join(rootDir, 'tests/e2e/pages/home.html');
    expect(fs.existsSync(fixturePath)).toBe(true);
    const content = fs.readFileSync(fixturePath, 'utf8');
    expect(content).toContain('clickbait');
    expect(content).toContain('clean');
    expect(content).toContain('is-shorts');
  });
});
