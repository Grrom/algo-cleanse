import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const privacyDocPath = path.resolve(__dirname, '../docs/privacy.md');

describe('Privacy policy documentation', () => {
  // Acceptance criterion: docs/privacy.md lists every feedback payload field, states opt-in, and describes the Tell-YouTube features and that blocks are never sent
  it('docs/privacy.md lists every feedback payload field, states opt-in, and describes the Tell-YouTube features and that blocks are never sent', () => {
    expect(fs.existsSync(privacyDocPath)).toBe(true);
    const content = fs.readFileSync(privacyDocPath, 'utf8');

    // States opt-in
    expect(content.toLowerCase()).toContain('opt-in');

    // Lists every feedback payload field
    const expectedFields = [
      'kind',
      'videoId',
      'title',
      'channelHandle',
      'matchedRuleIds',
      'score',
      'strictness',
      'patternsRevision',
      'extensionVersion',
      'browser',
    ];
    for (const field of expectedFields) {
      expect(content).toContain(field);
    }

    // Describes Tell-YouTube features
    expect(content).toContain('Not interested');
    expect(
      content.includes('Don’t recommend channel') ||
        content.includes("Don't recommend channel"),
    ).toBe(true);

    // Describes that channel blocks are never sent
    expect(content.toLowerCase()).toContain('never sent');
    expect(content.toLowerCase()).toContain('block');
  });
});
