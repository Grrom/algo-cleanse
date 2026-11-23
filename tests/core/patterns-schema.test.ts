import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import bundledPatterns, {
  BUNDLED_PATTERNS,
} from '../../src/core/bundled-patterns';
import { ENGINE_VERSION } from '../../src/core/engine-version';
import {
  parsePatterns,
  type Patterns,
  type Rule,
} from '../../src/core/patterns-schema';
import patternsJson from '../../patterns/patterns.json';
import fixturesJson from '../../patterns/fixtures.json';
import { checkPatternsFile } from '../../scripts/check-patterns';

describe('patterns-schema & engine-version', () => {
  it('export const ENGINE_VERSION = 1 in src/core/engine-version.ts', () => {
    expect(ENGINE_VERSION).toBe(1);
  });

  // Acceptance criterion: parsePatterns returns a typed object for patterns/patterns.json
  it('parsePatterns returns a typed object for patterns/patterns.json', () => {
    const result = parsePatterns(patternsJson);
    expect(result).not.toBeNull();
    expect(result?.schemaVersion).toBe(1);
    expect(result?.revision).toBeGreaterThanOrEqual(1);
    expect(result?.version).toBe('2026.11.23');
    expect(result?.minEngineVersion).toBe(1);
    expect(result?.thresholds).toEqual({
      gentle: 5,
      balanced: 3,
      strict: 2,
    });
    expect(Array.isArray(result?.categories)).toBe(true);
    expect(Array.isArray(result?.rules)).toBe(true);
  });

  // Acceptance criterion: parsePatterns returns null (no throw) for: non-object input
  it('parsePatterns returns null (no throw) for: non-object input', () => {
    expect(parsePatterns(null)).toBeNull();
    expect(parsePatterns(undefined)).toBeNull();
    expect(parsePatterns(123)).toBeNull();
    expect(parsePatterns('not an object')).toBeNull();
    expect(parsePatterns(true)).toBeNull();
    expect(parsePatterns(false)).toBeNull();
    expect(parsePatterns([1, 2, 3])).toBeNull();
  });

  // Acceptance criterion: parsePatterns returns null (no throw) for: missing revision
  it('parsePatterns returns null (no throw) for: missing revision', () => {
    const invalid: Record<string, unknown> = { ...patternsJson };
    delete invalid.revision;
    expect(parsePatterns(invalid)).toBeNull();
  });

  // Acceptance criterion: parsePatterns returns null (no throw) for: unknown rule type
  it('parsePatterns returns null (no throw) for: unknown rule type', () => {
    const invalid = {
      ...patternsJson,
      rules: [
        ...patternsJson.rules,
        {
          id: 'test-unknown',
          category: 'bait-phrase',
          type: 'some-unknown-rule-type',
          weight: 1,
          label: 'Unknown rule',
        },
      ],
    };
    expect(parsePatterns(invalid)).toBeNull();
  });

  // Acceptance criterion: parsePatterns returns null (no throw) for: duplicate rule ids
  it('parsePatterns returns null (no throw) for: duplicate rule ids', () => {
    const firstRule = patternsJson.rules[0]!;
    const duplicateRule = {
      ...patternsJson.rules[1]!,
      id: firstRule.id,
    };
    const invalid = {
      ...patternsJson,
      rules: [firstRule, duplicateRule, ...patternsJson.rules.slice(2)],
    };
    expect(parsePatterns(invalid)).toBeNull();
  });

  // Acceptance criterion: parsePatterns returns null (no throw) for: duplicate category ids
  it('parsePatterns returns null (no throw) for: duplicate category ids', () => {
    const firstCat = patternsJson.categories[0]!;
    const duplicateCat = {
      id: firstCat.id,
      label: 'Duplicate Category',
      description: 'Duplicate',
    };
    const invalid = {
      ...patternsJson,
      categories: [...patternsJson.categories, duplicateCat],
    };
    expect(parsePatterns(invalid)).toBeNull();
  });

  // Acceptance criterion: parsePatterns returns null (no throw) for: rule with an undefined category
  it('parsePatterns returns null (no throw) for: rule with an undefined category', () => {
    const invalid = {
      ...patternsJson,
      rules: [
        ...patternsJson.rules,
        {
          id: 'rule-with-undefined-cat',
          category: 'non-existent-category',
          type: 'regex',
          pattern: 'test',
          weight: 1,
          label: 'Test rule',
        },
      ],
    };
    expect(parsePatterns(invalid)).toBeNull();
  });

  // Acceptance criterion: parsePatterns returns null (no throw) for: uncompilable regex
  it('parsePatterns returns null (no throw) for: uncompilable regex', () => {
    const invalid = {
      ...patternsJson,
      rules: [
        {
          id: 'invalid-regex-rule',
          category: 'bait-phrase',
          type: 'regex',
          pattern: '[unclosed-character-class',
          flags: 'i',
          weight: 1,
          label: 'Invalid regex',
        },
      ],
    };
    expect(parsePatterns(invalid)).toBeNull();
  });

  // Acceptance criterion: parsePatterns returns null (no throw) for: regex over 200 chars
  it('parsePatterns returns null (no throw) for: regex over 200 chars', () => {
    const longPattern = 'a'.repeat(201);
    const invalid = {
      ...patternsJson,
      rules: [
        {
          id: 'long-regex-rule',
          category: 'bait-phrase',
          type: 'regex',
          pattern: longPattern,
          flags: 'i',
          weight: 1,
          label: 'Long regex',
        },
      ],
    };
    expect(parsePatterns(invalid)).toBeNull();
  });

  // Acceptance criterion: parsePatterns returns null (no throw) for: flag g
  it('parsePatterns returns null (no throw) for: flag g', () => {
    const invalid = {
      ...patternsJson,
      rules: [
        {
          id: 'flag-g-rule',
          category: 'bait-phrase',
          type: 'regex',
          pattern: 'test',
          flags: 'g',
          weight: 1,
          label: 'Flag g rule',
        },
      ],
    };
    expect(parsePatterns(invalid)).toBeNull();

    const invalidMultiple = {
      ...patternsJson,
      rules: [
        {
          id: 'flag-gi-rule',
          category: 'bait-phrase',
          type: 'regex',
          pattern: 'test',
          flags: 'gi',
          weight: 1,
          label: 'Flag gi rule',
        },
      ],
    };
    expect(parsePatterns(invalidMultiple)).toBeNull();
  });

  // Acceptance criterion: The five categories above exist; >= 20 rules, each with non-empty id, label, valid category; fixtures have >= 15 flagged and >= 15 clean titles
  it('The five categories above exist; >= 20 rules, each with non-empty id, label, valid category; fixtures have >= 15 flagged and >= 15 clean titles', () => {
    const parsed = parsePatterns(patternsJson) as Patterns;
    expect(parsed).not.toBeNull();

    const expectedCategories = [
      'bait-phrase',
      'shouting',
      'emoji-spam',
      'sensational',
      'ai-slop',
    ];
    const categoryIds = parsed.categories.map((c) => c.id);
    for (const expCat of expectedCategories) {
      expect(categoryIds).toContain(expCat);
    }

    // >= 20 rules overall
    expect(parsed.rules.length).toBeGreaterThanOrEqual(20);

    // Each rule has non-empty id, label, valid category
    for (const rawRule of parsed.rules) {
      const rule: Rule = rawRule;
      expect(rule.id).toBeTruthy();
      expect(typeof rule.id).toBe('string');
      expect(rule.id.trim().length).toBeGreaterThan(0);

      expect(rule.label).toBeTruthy();
      expect(typeof rule.label).toBe('string');
      expect(rule.label.trim().length).toBeGreaterThan(0);

      expect(categoryIds).toContain(rule.category);
      expect(typeof rule.weight).toBe('number');
    }

    // Verify fixtures
    expect(Array.isArray(fixturesJson.flagged)).toBe(true);
    expect(fixturesJson.flagged.length).toBeGreaterThanOrEqual(15);
    for (const title of fixturesJson.flagged) {
      expect(typeof title).toBe('string');
      expect(title.trim().length).toBeGreaterThan(0);
    }

    expect(Array.isArray(fixturesJson.clean)).toBe(true);
    expect(fixturesJson.clean.length).toBeGreaterThanOrEqual(15);
    for (const title of fixturesJson.clean) {
      expect(typeof title).toBe('string');
      expect(title.trim().length).toBeGreaterThan(0);
    }
  });

  // Acceptance criterion: No eval or new Function anywhere
  it('No eval or new Function anywhere', () => {
    const scanDirs = ['src', 'patterns', 'entrypoints', 'scripts'];
    const forbiddenPatterns = [/\beval\s*\(/, /new\s+Function\s*\(/];

    function scanDirectory(dirPath: string): void {
      if (!fs.existsSync(dirPath)) return;
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          scanDirectory(fullPath);
        } else if (
          entry.isFile() &&
          /\.(ts|js|mjs|cjs|json)$/.test(entry.name)
        ) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          for (const pattern of forbiddenPatterns) {
            expect(
              pattern.test(content),
              `Forbidden pattern ${pattern} found in ${fullPath}`,
            ).toBe(false);
          }
        }
      }
    }

    for (const dir of scanDirs) {
      scanDirectory(path.resolve(process.cwd(), dir));
    }
  });

  // Acceptance criterion: src/core/bundled-patterns.ts imports patterns/patterns.json at build time as the fallback set
  it('src/core/bundled-patterns.ts imports patterns/patterns.json at build time as the fallback set', () => {
    expect(BUNDLED_PATTERNS).toBeDefined();
    expect(BUNDLED_PATTERNS).toEqual(bundledPatterns);
    expect(BUNDLED_PATTERNS.revision).toBe(patternsJson.revision);
    expect(BUNDLED_PATTERNS.rules.length).toBe(patternsJson.rules.length);
    expect(BUNDLED_PATTERNS.categories.length).toBe(
      patternsJson.categories.length,
    );
  });

  // Acceptance criterion: npm run patterns:check runs in CI, fails on an invalid file and passes on the committed one
  it('npm run patterns:check fails on an invalid file and passes on the committed one', () => {
    const committedFilePath = path.resolve(
      process.cwd(),
      'patterns/patterns.json',
    );
    expect(checkPatternsFile(committedFilePath)).toBe(true);

    const tempInvalidPath = path.join(
      os.tmpdir(),
      `invalid-patterns-${Date.now()}.json`,
    );
    try {
      fs.writeFileSync(
        tempInvalidPath,
        JSON.stringify({ schemaVersion: 1, rules: [] }), // missing required fields like revision, thresholds, categories
      );
      expect(checkPatternsFile(tempInvalidPath)).toBe(false);

      // Also test with completely broken json
      fs.writeFileSync(tempInvalidPath, 'not json at all {{{');
      expect(checkPatternsFile(tempInvalidPath)).toBe(false);
    } finally {
      if (fs.existsSync(tempInvalidPath)) {
        fs.unlinkSync(tempInvalidPath);
      }
    }
  });
});
