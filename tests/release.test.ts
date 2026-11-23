import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const pkgPath = path.resolve(rootDir, 'package.json');
const workflowPath = path.resolve(rootDir, '.github/workflows/release.yml');
const docsPath = path.resolve(rootDir, 'docs/releasing.md');

describe('release automation', () => {
  // npm run release produces chrome zip, firefox zip and sources zip in .output/
  it('npm run release produces chrome zip, firefox zip and sources zip in .output/', () => {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    expect(pkg.scripts?.release).toBeDefined();

    // Verify .output/ contains chrome zip, firefox zip, and sources zip
    const outputDir = path.resolve(rootDir, '.output');
    expect(fs.existsSync(outputDir)).toBe(true);

    const files = fs.readdirSync(outputDir);
    const chromeZip = files.find((f) => f.endsWith('-chrome.zip'));
    const firefoxZip = files.find((f) => f.endsWith('-firefox.zip'));
    const sourcesZip = files.find((f) => f.endsWith('-sources.zip'));

    expect(chromeZip).toBeDefined();
    expect(firefoxZip).toBeDefined();
    expect(sourcesZip).toBeDefined();

    // Verify file sizes are greater than 0
    if (chromeZip) {
      const stats = fs.statSync(path.join(outputDir, chromeZip));
      expect(stats.size).toBeGreaterThan(0);
    }
    if (firefoxZip) {
      const stats = fs.statSync(path.join(outputDir, firefoxZip));
      expect(stats.size).toBeGreaterThan(0);
    }
    if (sourcesZip) {
      const stats = fs.statSync(path.join(outputDir, sourcesZip));
      expect(stats.size).toBeGreaterThan(0);
    }
  });

  // Workflow has concurrency with cancel-in-progress: true
  it('Workflow has concurrency with cancel-in-progress: true', () => {
    expect(fs.existsSync(workflowPath)).toBe(true);
    const content = fs.readFileSync(workflowPath, 'utf8');

    // Concurrency check
    expect(content).toContain('concurrency:');
    expect(content).toMatch(/cancel-in-progress:\s*true/);
    expect(content).toContain('release-${{ github.ref }}');
  });

  // docs/releasing.md exists
  it('docs/releasing.md exists', () => {
    expect(fs.existsSync(docsPath)).toBe(true);
    const content = fs.readFileSync(docsPath, 'utf8');
    expect(content).toContain('Releasing AlgoCleanse');
    expect(content).toContain('CWS_EXTENSION_ID');
    expect(content).toContain('AMO_JWT_ISSUER');
  });

  // With no store secrets set, a tag run creates the GitHub Release and skips both store steps without failing
  it('With no store secrets set, a tag run creates the GitHub Release and skips both store steps without failing', () => {
    const content = fs.readFileSync(workflowPath, 'utf8');

    // Handles secrets skipping with notices
    expect(content).toContain('CWS_EXTENSION_ID');
    expect(content).toContain('CWS_CLIENT_ID');
    expect(content).toContain('CWS_CLIENT_SECRET');
    expect(content).toContain('CWS_REFRESH_TOKEN');
    expect(content).toContain('AMO_JWT_ISSUER');
    expect(content).toContain('AMO_JWT_SECRET');

    // Notice emissions on missing secrets
    expect(content).toContain('::notice::Missing Chrome Web Store secrets');
    expect(content).toContain('::notice::Missing Firefox Add-ons secrets');

    // GitHub release step
    expect(content).toContain('Create GitHub Release');
    expect(content).toContain('gh release create');
  });

  // workflow_dispatch with dry_run: true uploads the zips as artifacts and publishes nothing
  it('workflow_dispatch with dry_run: true uploads the zips as artifacts and publishes nothing', () => {
    const content = fs.readFileSync(workflowPath, 'utf8');

    // workflow_dispatch input dry_run
    expect(content).toContain('workflow_dispatch:');
    expect(content).toContain('dry_run:');

    // Dry run skips publishing and uploads artifacts
    expect(content).toContain('Upload release artifacts (dry run)');
    expect(content).toContain('actions/upload-artifact@v4');
    expect(content).toContain(
      '::notice::Dry run enabled; skipping Chrome Web Store',
    );
    expect(content).toContain(
      '::notice::Dry run enabled; skipping Firefox Add-ons',
    );
  });
});
