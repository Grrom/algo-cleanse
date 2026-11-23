import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  compareVersion,
  getPackageVersion,
  main,
  stripTagPrefix,
} from '../scripts/check-version.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.resolve(__dirname, '../scripts/check-version.mjs');
const pkgPath = path.resolve(__dirname, '../package.json');
const currentVersion = getPackageVersion(pkgPath);

describe('scripts/check-version.mjs', () => {
  // scripts/check-version.mjs fails when tag and package.json version differ and passes when equal (unit test)
  it('scripts/check-version.mjs fails when tag and package.json version differ and passes when equal (unit test)', () => {
    // 1. Direct execution via CLI passing tag as argument
    const matchingTag = `v${currentVersion}`;
    const mismatchingTag = 'v99.99.99';

    // Passing tag matching package.json exits with code 0
    const passResult = spawnSync(process.execPath, [scriptPath, matchingTag], {
      encoding: 'utf8',
    });
    expect(passResult.status).toBe(0);
    expect(passResult.stdout).toContain('Version check passed');
    expect(passResult.stdout).toContain(currentVersion);

    // Mismatching tag exits with non-zero code (1)
    const failResult = spawnSync(
      process.execPath,
      [scriptPath, mismatchingTag],
      {
        encoding: 'utf8',
      },
    );
    expect(failResult.status).toBe(1);
    expect(failResult.stderr).toContain('Version check failed');
    expect(failResult.stderr).toContain('does not match package.json version');

    // 2. Testing main function directly with arguments
    expect(main([matchingTag], {}, pkgPath)).toBe(0);
    expect(main([mismatchingTag], {}, pkgPath)).toBe(1);

    // 3. Testing compareVersion directly
    const validMatch = compareVersion(matchingTag, currentVersion);
    expect(validMatch.matches).toBe(true);
    expect(validMatch.tagVersion).toBe(currentVersion);

    const invalidMatch = compareVersion(mismatchingTag, currentVersion);
    expect(invalidMatch.matches).toBe(false);
    expect(invalidMatch.error).toBeDefined();
  });

  it('handles tags with or without leading "v" and with "refs/tags/" prefix', () => {
    // Tag without 'v'
    expect(stripTagPrefix(currentVersion)).toBe(currentVersion);
    expect(compareVersion(currentVersion, currentVersion).matches).toBe(true);

    const noVResult = spawnSync(
      process.execPath,
      [scriptPath, currentVersion],
      {
        encoding: 'utf8',
      },
    );
    expect(noVResult.status).toBe(0);
    expect(noVResult.stdout).toContain('Version check passed');

    // Tag with refs/tags/
    const refTag = `refs/tags/v${currentVersion}`;
    expect(stripTagPrefix(refTag)).toBe(currentVersion);
    expect(compareVersion(refTag, currentVersion).matches).toBe(true);

    const refResult = spawnSync(process.execPath, [scriptPath, refTag], {
      encoding: 'utf8',
    });
    expect(refResult.status).toBe(0);
    expect(refResult.stdout).toContain('Version check passed');
  });

  it('reads tag from environment variables GITHUB_REF_NAME, TAG, or GITHUB_REF', () => {
    const matchingTag = `v${currentVersion}`;
    const baseEnv = {
      ...process.env,
      TAG: '',
      GITHUB_REF_NAME: '',
      GITHUB_REF: '',
    };

    // Test GITHUB_REF_NAME
    const envRefNameResult = spawnSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      env: { ...baseEnv, GITHUB_REF_NAME: matchingTag },
    });
    expect(envRefNameResult.status).toBe(0);
    expect(envRefNameResult.stdout).toContain('Version check passed');

    // Test TAG
    const envTagResult = spawnSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      env: { ...baseEnv, TAG: matchingTag },
    });
    expect(envTagResult.status).toBe(0);
    expect(envTagResult.stdout).toContain('Version check passed');

    // Test GITHUB_REF
    const envRefResult = spawnSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      env: { ...baseEnv, GITHUB_REF: `refs/tags/${matchingTag}` },
    });
    expect(envRefResult.status).toBe(0);
    expect(envRefResult.stdout).toContain('Version check passed');
  });

  it('fails when no tag is supplied', () => {
    const noTagResult = spawnSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        TAG: '',
        GITHUB_REF_NAME: '',
        GITHUB_REF: '',
      },
    });
    expect(noTagResult.status).toBe(1);
    expect(noTagResult.stderr).toContain('Error: Tag must be provided');
  });

  it('fails when tag contains only "v" or is invalid', () => {
    const invalidResult = spawnSync(process.execPath, [scriptPath, 'v'], {
      encoding: 'utf8',
    });
    expect(invalidResult.status).toBe(1);
    expect(invalidResult.stderr).toContain('Version check failed');
  });
});
