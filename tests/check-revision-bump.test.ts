import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkRevisionBump,
  checkRevisionBumpFiles,
  isDeepEqual,
} from '../scripts/check-revision-bump';
import { categorySchema, ruleSchema } from '../src/core/patterns-schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const ciWorkflowPath = path.resolve(rootDir, '.github/workflows/ci.yml');
const docsPatternsPath = path.resolve(rootDir, 'docs/patterns.md');
const readmePath = path.resolve(rootDir, 'README.md');
const agentsPath = path.resolve(rootDir, 'AGENTS.md');

describe('checkRevisionBump & scripts/check-revision-bump.ts', () => {
  const baseSample = {
    schemaVersion: 1,
    revision: 1,
    version: '2026.11.23',
    minEngineVersion: 1,
    thresholds: {
      gentle: 5,
      balanced: 3,
      strict: 2,
    },
    categories: [
      { id: 'cat-1', label: 'Category 1', description: 'Desc 1' },
      { id: 'cat-2', label: 'Category 2', description: 'Desc 2' },
    ],
    rules: [
      {
        id: 'rule-1',
        category: 'cat-1',
        type: 'capsRatio',
        min: 0.6,
        minLetters: 12,
        weight: 2,
        label: 'ALL CAPS',
      },
    ],
  };

  // Acceptance criterion: checkRevisionBump returns ok for identical content with reordered whitespace, for changed content with a higher revision, and for a null base
  it('checkRevisionBump returns ok for identical content with reordered whitespace, for changed content with a higher revision, and for a null base', () => {
    // 1. Null base (first version)
    const nullBaseResult = checkRevisionBump(null, baseSample);
    expect(nullBaseResult.ok).toBe(true);
    expect(nullBaseResult.message).toContain('initial revision');

    // 2. Identical content with reordered whitespace and keys
    const reorderedWhitespace = JSON.parse(
      JSON.stringify(baseSample, null, 4) + '\n\n',
    );
    const identicalResult = checkRevisionBump(baseSample, reorderedWhitespace);
    expect(identicalResult.ok).toBe(true);
    expect(identicalResult.message).toContain('semantically identical');

    // Reordered keys in an object
    const reorderedKeys = {
      rules: baseSample.rules,
      thresholds: baseSample.thresholds,
      categories: baseSample.categories,
      minEngineVersion: baseSample.minEngineVersion,
      version: baseSample.version,
      revision: baseSample.revision,
      schemaVersion: baseSample.schemaVersion,
    };
    const keysResult = checkRevisionBump(baseSample, reorderedKeys);
    expect(keysResult.ok).toBe(true);

    // 3. Changed content with a higher revision
    const higherRevisionHead = {
      ...baseSample,
      revision: 2,
      rules: [
        ...baseSample.rules,
        {
          id: 'rule-2',
          category: 'cat-2',
          type: 'punctuationRun',
          min: 3,
          weight: 1,
          label: 'Excessive punctuation',
        },
      ],
    };
    const higherRevResult = checkRevisionBump(baseSample, higherRevisionHead);
    expect(higherRevResult.ok).toBe(true);
    expect(higherRevResult.message).toContain('increased from 1 to 2');
  });

  // Acceptance criterion: checkRevisionBump returns not ok with the message above for changed content with equal revision and with lower revision
  it('checkRevisionBump returns not ok with the message above for changed content with equal revision and with lower revision', () => {
    const changedWithEqualRev = {
      ...baseSample,
      revision: 1,
      rules: [
        ...baseSample.rules,
        {
          id: 'rule-2',
          category: 'cat-2',
          type: 'punctuationRun',
          min: 3,
          weight: 1,
          label: 'Excessive punctuation',
        },
      ],
    };

    // Equal revision
    const equalRevResult = checkRevisionBump(baseSample, changedWithEqualRev);
    expect(equalRevResult.ok).toBe(false);
    expect(equalRevResult.message).toBe(
      'patterns.json changed but revision was not increased (base 1, head 1)',
    );

    // Lower revision
    const baseWithHigherRev = {
      ...baseSample,
      revision: 2,
    };
    const changedWithLowerRev = {
      ...baseSample,
      revision: 1,
      rules: [
        ...baseSample.rules,
        {
          id: 'rule-2',
          category: 'cat-2',
          type: 'punctuationRun',
          min: 3,
          weight: 1,
          label: 'Excessive punctuation',
        },
      ],
    };

    const lowerRevResult = checkRevisionBump(
      baseWithHigherRev,
      changedWithLowerRev,
    );
    expect(lowerRevResult.ok).toBe(false);
    expect(lowerRevResult.message).toBe(
      'patterns.json changed but revision was not increased (base 2, head 1)',
    );
  });

  it('isDeepEqual correctly compares primitives, arrays, and objects', () => {
    expect(isDeepEqual(1, 1)).toBe(true);
    expect(isDeepEqual(1, 2)).toBe(false);
    expect(isDeepEqual('a', 'a')).toBe(true);
    expect(isDeepEqual('a', 'b')).toBe(false);
    expect(isDeepEqual(null, null)).toBe(true);
    expect(isDeepEqual(null, undefined)).toBe(false);
    expect(isDeepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(isDeepEqual([1, 2, 3], [1, 2])).toBe(false);
    expect(isDeepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(isDeepEqual({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
  });

  it('checkRevisionBumpFiles handles non-existent base, identical files, bumped revision, and unbumped revision', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'patterns-revision-test-'),
    );
    try {
      const baseFile = path.join(tempDir, 'base.json');
      const headFile = path.join(tempDir, 'head.json');
      const missingBase = path.join(tempDir, 'missing.json');

      fs.writeFileSync(baseFile, JSON.stringify(baseSample, null, 2));

      // Missing base -> ok
      const missingBaseRes = checkRevisionBumpFiles(missingBase, baseFile);
      expect(missingBaseRes.ok).toBe(true);

      // Identical files -> ok
      fs.writeFileSync(headFile, JSON.stringify(baseSample, null, 4));
      const identicalRes = checkRevisionBumpFiles(baseFile, headFile);
      expect(identicalRes.ok).toBe(true);

      // Changed with bumped revision -> ok
      const bumpedData = {
        ...baseSample,
        revision: 2,
        rules: [
          ...baseSample.rules,
          { id: 'r2', category: 'cat-1', label: 'R2' },
        ],
      };
      fs.writeFileSync(headFile, JSON.stringify(bumpedData));
      const bumpedRes = checkRevisionBumpFiles(baseFile, headFile);
      expect(bumpedRes.ok).toBe(true);

      // Changed with same revision -> not ok
      const unbumpedData = {
        ...baseSample,
        revision: 1,
        rules: [
          ...baseSample.rules,
          { id: 'r2', category: 'cat-1', label: 'R2' },
        ],
      };
      fs.writeFileSync(headFile, JSON.stringify(unbumpedData));
      const unbumpedRes = checkRevisionBumpFiles(baseFile, headFile);
      expect(unbumpedRes.ok).toBe(false);
      expect(unbumpedRes.message).toBe(
        'patterns.json changed but revision was not increased (base 1, head 1)',
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('CLI npm run patterns:revision-check -- <base> <head> exits with correct codes and output', () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'patterns-cli-test-'),
    );
    try {
      const baseFile = path.join(tempDir, 'base.json');
      const headFile = path.join(tempDir, 'head.json');
      const missingFile = path.join(tempDir, 'does-not-exist.json');

      fs.writeFileSync(baseFile, JSON.stringify(baseSample, null, 2));

      // 1. Missing base file exits 0
      const missingBaseRun = spawnSync(
        'npm',
        ['run', 'patterns:revision-check', '--', missingFile, baseFile],
        { cwd: rootDir, encoding: 'utf-8' },
      );
      expect(missingBaseRun.status).toBe(0);

      // 2. Identical files exit 0
      fs.writeFileSync(headFile, JSON.stringify(baseSample, null, 4));
      const identicalRun = spawnSync(
        'npm',
        ['run', 'patterns:revision-check', '--', baseFile, headFile],
        { cwd: rootDir, encoding: 'utf-8' },
      );
      expect(identicalRun.status).toBe(0);

      // 3. Changed with revision bumped exits 0
      const bumpedData = {
        ...baseSample,
        revision: 2,
        rules: [
          ...baseSample.rules,
          { id: 'new', category: 'cat-1', label: 'new' },
        ],
      };
      fs.writeFileSync(headFile, JSON.stringify(bumpedData));
      const bumpedRun = spawnSync(
        'npm',
        ['run', 'patterns:revision-check', '--', baseFile, headFile],
        { cwd: rootDir, encoding: 'utf-8' },
      );
      expect(bumpedRun.status).toBe(0);

      // 4. Changed with revision unbumped exits 1 with expected message
      const unbumpedData = {
        ...baseSample,
        revision: 1,
        rules: [
          ...baseSample.rules,
          { id: 'new', category: 'cat-1', label: 'new' },
        ],
      };
      fs.writeFileSync(headFile, JSON.stringify(unbumpedData));
      const unbumpedRun = spawnSync(
        'npm',
        ['run', 'patterns:revision-check', '--', baseFile, headFile],
        { cwd: rootDir, encoding: 'utf-8' },
      );
      expect(unbumpedRun.status).toBe(1);
      const combinedOutput = unbumpedRun.stdout + unbumpedRun.stderr;
      expect(combinedOutput).toContain(
        'patterns.json changed but revision was not increased (base 1, head 1)',
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // Acceptance criterion: CI runs the check on pull requests and fails when patterns.json changes without a revision increase
  it('CI runs the check on pull requests and fails when patterns.json changes without a revision increase', () => {
    expect(fs.existsSync(ciWorkflowPath)).toBe(true);
    const content = fs.readFileSync(ciWorkflowPath, 'utf8');

    // fetch-depth: 0 on checkout so base ref can be inspected
    expect(content).toContain('fetch-depth: 0');

    // Step runs on pull_request only
    expect(content).toContain("if: github.event_name == 'pull_request'");

    // Step writes base patterns from git show origin/${{ github.base_ref }}:patterns/patterns.json
    expect(content).toContain(
      'git show origin/${{ github.base_ref }}:patterns/patterns.json > /tmp/base-patterns.json',
    );

    // Step executes npm run patterns:revision-check
    expect(content).toContain(
      'npm run patterns:revision-check -- /tmp/base-patterns.json patterns/patterns.json',
    );
  });

  // Acceptance criterion: docs/patterns.md exists and is linked from README and AGENTS.md; AGENTS.md has the new rule
  it('docs/patterns.md exists and is linked from README and AGENTS.md; AGENTS.md has the new rule', () => {
    // 1. docs/patterns.md exists and covers all required topics
    expect(fs.existsSync(docsPatternsPath)).toBe(true);
    const doc = fs.readFileSync(docsPatternsPath, 'utf8');

    // How patterns reach users
    expect(doc).toContain('bundled');
    expect(doc).toContain('Worker');
    expect(doc).toContain('12 hours');
    expect(doc).toMatch(/higher\s*revision\s*wins/i);

    // How to add a rule or category
    expect(doc).toContain('categories');
    expect(doc).toContain('rules');

    // Always bump revision by 1
    expect(doc).toMatch(/always bump [`*]*revision[`*]* by 1/i);

    // minEngineVersion & ENGINE_VERSION
    expect(doc).toContain('minEngineVersion');
    expect(doc).toContain('ENGINE_VERSION');

    // Remote updates config
    expect(doc).toContain('CLOUDFLARE_API_TOKEN');
    expect(doc).toContain('WXT_API_BASE_URL');

    // Doc-test: verify that example category and rule snippets parse with their respective schemas
    const categoryBlockMatch = doc.match(
      /### Adding a Category[\s\S]*?```json\n([\s\S]*?)\n```/,
    );
    expect(categoryBlockMatch).not.toBeNull();
    const exampleCategory = JSON.parse(categoryBlockMatch![1]!);
    expect(categorySchema.safeParse(exampleCategory).success).toBe(true);

    const ruleBlockMatch = doc.match(
      /### Adding a Rule[\s\S]*?```json\n([\s\S]*?)\n```/,
    );
    expect(ruleBlockMatch).not.toBeNull();
    const exampleRule = JSON.parse(ruleBlockMatch![1]!);
    expect(ruleSchema.safeParse(exampleRule).success).toBe(true);

    // Verify all supported schema types and required fields are documented
    expect(doc).toContain('`regex`');
    expect(doc).toContain('`capsRatio`');
    expect(doc).toContain('`emojiCount`');
    expect(doc).toContain('`punctuationRun`');
    expect(doc).toContain('`channel`');
    expect(doc).toContain('handles');

    // Verify local instructions include creating /tmp/base-patterns.json
    expect(doc).toContain(
      'git fetch origin main && git show origin/main:patterns/patterns.json > /tmp/base-patterns.json',
    );

    // 2. Linked from README.md
    expect(fs.existsSync(readmePath)).toBe(true);
    const readme = fs.readFileSync(readmePath, 'utf8');
    expect(readme).toContain('docs/patterns.md');
    expect(readme).toContain('npm run patterns:revision-check');

    // 3. Linked from AGENTS.md and contains the rule
    expect(fs.existsSync(agentsPath)).toBe(true);
    const agents = fs.readFileSync(agentsPath, 'utf8');
    expect(agents).toContain('docs/patterns.md');
    expect(agents).toContain('npm run patterns:revision-check');
    expect(agents).toContain(
      'Any change to `patterns/patterns.json` must increase `revision`',
    );
  });
});
