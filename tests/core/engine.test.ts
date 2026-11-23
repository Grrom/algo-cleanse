import { describe, expect, it } from 'vitest';
import fixturesJson from '../../patterns/fixtures.json';
import { BUNDLED_PATTERNS } from '../../src/core/bundled-patterns';
import { evaluate, isAutoEligible, type Verdict } from '../../src/core/engine';
import type { Patterns } from '../../src/core/patterns-schema';
import {
  DEFAULT_SETTINGS,
  type Settings,
  type VideoInfo,
} from '../../src/core/types';

function createVideo(partial: Partial<VideoInfo> = {}): VideoInfo {
  return {
    videoId: 'test-vid-1',
    title: 'Sample Video Title',
    channelHandle: '@samplechannel',
    channelName: 'Sample Channel',
    durationText: '10:00',
    isShort: false,
    ...partial,
  };
}

describe('Detection engine: evaluate & isAutoEligible', () => {
  // Acceptance criterion: Every flagged fixture title is flagged at balanced with bundled patterns; every clean title is not (table-driven test)
  describe('Every flagged fixture title is flagged at balanced with bundled patterns; every clean title is not (table-driven test)', () => {
    describe.each(fixturesJson.flagged)(
      'flagged fixture title: "%s"',
      (title) => {
        it(`should flag "${title}" at balanced strictness`, () => {
          const video = createVideo({
            title,
            channelHandle: '@regularcreator',
          });
          const verdict = evaluate(video, BUNDLED_PATTERNS, {
            ...DEFAULT_SETTINGS,
            strictness: 'balanced',
          });

          expect(verdict.flagged).toBe(true);
          expect(verdict.source).toBe('patterns');
          expect(verdict.score).toBeGreaterThanOrEqual(
            BUNDLED_PATTERNS.thresholds.balanced,
          );
          expect(verdict.reasons.length).toBeGreaterThan(0);
          expect(verdict.matchedRuleIds.length).toBeGreaterThan(0);
          expect(verdict.matchedCategories.length).toBeGreaterThan(0);
        });
      },
    );

    describe.each(fixturesJson.clean)('clean fixture title: "%s"', (title) => {
      it(`should NOT flag "${title}" at balanced strictness`, () => {
        const video = createVideo({ title, channelHandle: '@regularcreator' });
        const verdict = evaluate(video, BUNDLED_PATTERNS, {
          ...DEFAULT_SETTINGS,
          strictness: 'balanced',
        });

        expect(verdict.flagged).toBe(false);
        expect(verdict.source).toBe('none');
        expect(verdict.score).toBeLessThan(
          BUNDLED_PATTERNS.thresholds.balanced,
        );
      });
    });
  });

  // Acceptance criterion: With a hand-built patterns object, a title scoring exactly the balanced threshold is flagged at balanced and strict, not at gentle
  it('With a hand-built patterns object, a title scoring exactly the balanced threshold is flagged at balanced and strict, not at gentle', () => {
    const handBuiltPatterns: Patterns = {
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
        { id: 'cat-test', label: 'Test Category', description: 'Testing' },
      ],
      rules: [
        {
          id: 'rule-weight-3',
          category: 'cat-test',
          type: 'regex',
          pattern: '\\bexact-balanced-score\\b',
          flags: 'i',
          weight: 3,
          label: 'Exact balanced match',
        },
      ],
    };

    const video = createVideo({
      title: 'This has exact-balanced-score inside',
    });

    // Balanced threshold is 3: score is 3, 3 >= 3 -> flagged
    const balancedVerdict = evaluate(video, handBuiltPatterns, {
      ...DEFAULT_SETTINGS,
      strictness: 'balanced',
    });
    expect(balancedVerdict.score).toBe(3);
    expect(balancedVerdict.flagged).toBe(true);
    expect(balancedVerdict.source).toBe('patterns');

    // Strict threshold is 2: score is 3, 3 >= 2 -> flagged
    const strictVerdict = evaluate(video, handBuiltPatterns, {
      ...DEFAULT_SETTINGS,
      strictness: 'strict',
    });
    expect(strictVerdict.score).toBe(3);
    expect(strictVerdict.flagged).toBe(true);
    expect(strictVerdict.source).toBe('patterns');

    // Gentle threshold is 5: score is 3, 3 < 5 -> not flagged
    const gentleVerdict = evaluate(video, handBuiltPatterns, {
      ...DEFAULT_SETTINGS,
      strictness: 'gentle',
    });
    expect(gentleVerdict.score).toBe(3);
    expect(gentleVerdict.flagged).toBe(false);
    expect(gentleVerdict.source).toBe('none');
  });

  // Acceptance criterion: Allowlisted handle never flagged; blocklisted handle always flagged with reason "You blocked this channel" and source blocklist; case-insensitive
  describe('Allowlisted handle never flagged; blocklisted handle always flagged with reason "You blocked this channel" and source blocklist; case-insensitive', () => {
    it('allowlisted handle is never flagged even if title matches high-scoring clickbait patterns (case-insensitive)', () => {
      const video = createVideo({
        title: "You Won't Believe What Happened Next! (Gone Wrong)",
        channelHandle: '@TrustedChannel',
      });
      const settings: Settings = {
        ...DEFAULT_SETTINGS,
        allowedChannels: ['@trustedchannel'],
      };

      const verdict = evaluate(video, BUNDLED_PATTERNS, settings);
      expect(verdict.flagged).toBe(false);
      expect(verdict.source).toBe('allowlist');
      expect(verdict.score).toBe(0);
      expect(verdict.reasons).toEqual([]);
      expect(verdict.matchedRuleIds).toEqual([]);
      expect(verdict.matchedCategories).toEqual([]);
    });

    it('allowlisted handle matches without leading @ in settings or video', () => {
      const video = createVideo({
        title: "You Won't Believe What Happened Next! (Gone Wrong)",
        channelHandle: 'TrustedChannel',
      });
      const settings: Settings = {
        ...DEFAULT_SETTINGS,
        allowedChannels: ['@trustedchannel'],
      };

      const verdict = evaluate(video, BUNDLED_PATTERNS, settings);
      expect(verdict.flagged).toBe(false);
      expect(verdict.source).toBe('allowlist');
    });

    it('blocklisted handle is always flagged with reason "You blocked this channel" and source blocklist (case-insensitive)', () => {
      const video = createVideo({
        title: 'How CPU Caches Work: L1, L2, and L3 Explained', // clean title
        channelHandle: '@BlockedChannel',
      });
      const settings: Settings = {
        ...DEFAULT_SETTINGS,
        blockedChannels: ['@blockedchannel'],
      };

      const verdict = evaluate(video, BUNDLED_PATTERNS, settings);
      expect(verdict.flagged).toBe(true);
      expect(verdict.source).toBe('blocklist');
      expect(verdict.score).toBe(0);
      expect(verdict.reasons).toEqual(['You blocked this channel']);
      expect(verdict.matchedRuleIds).toEqual([]);
      expect(verdict.matchedCategories).toEqual([]);
    });

    it('allowlist takes precedence over blocklist if a channel handle is in both', () => {
      const video = createVideo({
        title: 'Some Video Title',
        channelHandle: '@conflictedcreator',
      });
      const settings: Settings = {
        ...DEFAULT_SETTINGS,
        allowedChannels: ['@conflictedcreator'],
        blockedChannels: ['@conflictedcreator'],
      };

      const verdict = evaluate(video, BUNDLED_PATTERNS, settings);
      expect(verdict.flagged).toBe(false);
      expect(verdict.source).toBe('allowlist');
    });
  });

  // Acceptance criterion: enabled: false -> not flagged
  describe('enabled: false -> not flagged', () => {
    it('returns not flagged with source none when enabled is false', () => {
      const video = createVideo({
        title: "You Won't Believe What Happened Next! (Gone Wrong)",
        channelHandle: '@blockedchannel',
      });
      const settings: Settings = {
        ...DEFAULT_SETTINGS,
        enabled: false,
        blockedChannels: ['@blockedchannel'],
      };

      const verdict = evaluate(video, BUNDLED_PATTERNS, settings);
      expect(verdict.flagged).toBe(false);
      expect(verdict.source).toBe('none');
      expect(verdict.score).toBe(0);
      expect(verdict.reasons).toEqual([]);
      expect(verdict.matchedRuleIds).toEqual([]);
      expect(verdict.matchedCategories).toEqual([]);
    });
  });

  // Acceptance criterion: capsRatio doesn't trigger below minLetters
  describe("capsRatio doesn't trigger below minLetters", () => {
    const capsPatterns: Patterns = {
      schemaVersion: 1,
      revision: 1,
      version: '2026.11.23',
      minEngineVersion: 1,
      thresholds: {
        gentle: 5,
        balanced: 2,
        strict: 1,
      },
      categories: [{ id: 'shouting', label: 'Shouting', description: 'Caps' }],
      rules: [
        {
          id: 'caps-rule',
          category: 'shouting',
          type: 'capsRatio',
          min: 0.6,
          minLetters: 10,
          weight: 2,
          label: 'ALL CAPS title',
        },
      ],
    };

    it('does not trigger when letters count is below minLetters (even at 100% caps)', () => {
      // 9 letters, all caps
      const video = createVideo({ title: 'ABCDEFGHI' });
      const verdict = evaluate(video, capsPatterns, DEFAULT_SETTINGS);

      expect(verdict.flagged).toBe(false);
      expect(verdict.score).toBe(0);
      expect(verdict.matchedRuleIds).toEqual([]);
    });

    it('triggers when letters count is equal to minLetters and caps ratio meets min', () => {
      // 10 letters, all caps
      const video = createVideo({ title: 'ABCDEFGHIJ' });
      const verdict = evaluate(video, capsPatterns, DEFAULT_SETTINGS);

      expect(verdict.flagged).toBe(true);
      expect(verdict.score).toBe(2);
      expect(verdict.matchedRuleIds).toEqual(['caps-rule']);
    });

    it('does not trigger on short uppercase titles (e.g. 5 letters)', () => {
      const video = createVideo({ title: 'HELLO' });
      const verdict = evaluate(video, capsPatterns, DEFAULT_SETTINGS);

      expect(verdict.flagged).toBe(false);
      expect(verdict.score).toBe(0);
    });
  });

  // Acceptance criterion: reasons and matchedCategories have no duplicates and follow rule order
  it('reasons and matchedCategories have no duplicates and follow rule order', () => {
    const multiPatterns: Patterns = {
      schemaVersion: 1,
      revision: 1,
      version: '2026.11.23',
      minEngineVersion: 1,
      thresholds: {
        gentle: 10,
        balanced: 2,
        strict: 1,
      },
      categories: [
        { id: 'cat-alpha', label: 'Alpha Category', description: 'Alpha' },
        { id: 'cat-beta', label: 'Beta Category', description: 'Beta' },
      ],
      rules: [
        {
          id: 'rule-1',
          category: 'cat-alpha',
          type: 'regex',
          pattern: 'one',
          flags: 'i',
          weight: 1,
          label: 'First Reason',
        },
        {
          id: 'rule-2',
          category: 'cat-beta',
          type: 'regex',
          pattern: 'two',
          flags: 'i',
          weight: 1,
          label: 'Second Reason',
        },
        {
          id: 'rule-3',
          category: 'cat-alpha',
          type: 'regex',
          pattern: 'three',
          flags: 'i',
          weight: 1,
          label: 'First Reason', // duplicate label of rule-1, duplicate category cat-alpha
        },
        {
          id: 'rule-4',
          category: 'cat-beta',
          type: 'regex',
          pattern: 'four',
          flags: 'i',
          weight: 1,
          label: 'Third Reason', // duplicate category cat-beta, distinct label
        },
      ],
    };

    const video = createVideo({ title: 'one two three four' });
    const verdict = evaluate(video, multiPatterns, DEFAULT_SETTINGS);

    expect(verdict.flagged).toBe(true);
    expect(verdict.score).toBe(4);
    expect(verdict.matchedRuleIds).toEqual([
      'rule-1',
      'rule-2',
      'rule-3',
      'rule-4',
    ]);
    // De-duplicated and preserves order: First Reason, Second Reason, Third Reason
    expect(verdict.reasons).toEqual([
      'First Reason',
      'Second Reason',
      'Third Reason',
    ]);
    // De-duplicated and preserves order: cat-alpha, cat-beta
    expect(verdict.matchedCategories).toEqual(['cat-alpha', 'cat-beta']);
  });

  // Acceptance criterion: isAutoEligible: true when auto on and a matched category is selected; false when auto off, when no selected category matched, when not flagged, and for source blocklist (tests for each)
  describe('isAutoEligible: true when auto on and a matched category is selected; false when auto off, when no selected category matched, when not flagged, and for source blocklist (tests for each)', () => {
    it('returns true when auto on and a matched category is selected', () => {
      const verdict: Verdict = {
        flagged: true,
        score: 3,
        reasons: ['Bait phrase'],
        matchedRuleIds: ['gone-wrong'],
        matchedCategories: ['bait-phrase'],
        source: 'patterns',
      };
      const settings: Settings = {
        ...DEFAULT_SETTINGS,
        autoNotInterested: true,
        autoCategories: ['bait-phrase', 'sensational'],
      };

      expect(isAutoEligible(verdict, settings)).toBe(true);
    });

    it('returns false when auto off', () => {
      const verdict: Verdict = {
        flagged: true,
        score: 3,
        reasons: ['Bait phrase'],
        matchedRuleIds: ['gone-wrong'],
        matchedCategories: ['bait-phrase'],
        source: 'patterns',
      };
      const settings: Settings = {
        ...DEFAULT_SETTINGS,
        autoNotInterested: false,
        autoCategories: ['bait-phrase'],
      };

      expect(isAutoEligible(verdict, settings)).toBe(false);
    });

    it('returns false when no selected category matched', () => {
      const verdict: Verdict = {
        flagged: true,
        score: 3,
        reasons: ['Bait phrase'],
        matchedRuleIds: ['gone-wrong'],
        matchedCategories: ['bait-phrase'],
        source: 'patterns',
      };
      const settings: Settings = {
        ...DEFAULT_SETTINGS,
        autoNotInterested: true,
        autoCategories: ['shouting', 'ai-slop'],
      };

      expect(isAutoEligible(verdict, settings)).toBe(false);
    });

    it('returns false when not flagged', () => {
      const verdict: Verdict = {
        flagged: false,
        score: 1,
        reasons: ['Sensational word'],
        matchedRuleIds: ['sensational-insane'],
        matchedCategories: ['sensational'],
        source: 'none',
      };
      const settings: Settings = {
        ...DEFAULT_SETTINGS,
        autoNotInterested: true,
        autoCategories: ['sensational'],
      };

      expect(isAutoEligible(verdict, settings)).toBe(false);
    });

    it('returns false for source blocklist', () => {
      const verdict: Verdict = {
        flagged: true,
        score: 0,
        reasons: ['You blocked this channel'],
        matchedRuleIds: [],
        matchedCategories: ['bait-phrase'], // even if matchedCategories has items somehow
        source: 'blocklist',
      };
      const settings: Settings = {
        ...DEFAULT_SETTINGS,
        autoNotInterested: true,
        autoCategories: ['bait-phrase'],
      };

      expect(isAutoEligible(verdict, settings)).toBe(false);
    });
  });

  // Acceptance criterion: Null title and handle -> not flagged, no throw
  it('Null title and handle -> not flagged, no throw', () => {
    const video = createVideo({
      title: null,
      channelHandle: null,
    });

    expect(() =>
      evaluate(video, BUNDLED_PATTERNS, DEFAULT_SETTINGS),
    ).not.toThrow();

    const verdict = evaluate(video, BUNDLED_PATTERNS, DEFAULT_SETTINGS);
    expect(verdict.flagged).toBe(false);
    expect(verdict.source).toBe('none');
    expect(verdict.score).toBe(0);
    expect(verdict.reasons).toEqual([]);
    expect(verdict.matchedRuleIds).toEqual([]);
    expect(verdict.matchedCategories).toEqual([]);
  });

  describe('Additional rule matching checks', () => {
    it('regex caching: compiles once per patterns object and caches by rule id', () => {
      const patternObj: Patterns = {
        schemaVersion: 1,
        revision: 1,
        version: '2026.11.23',
        minEngineVersion: 1,
        thresholds: { gentle: 5, balanced: 3, strict: 2 },
        categories: [{ id: 'cat', label: 'Cat', description: 'Desc' }],
        rules: [
          {
            id: 'cached-rule',
            category: 'cat',
            type: 'regex',
            pattern: 'secret',
            flags: 'i',
            weight: 3,
            label: 'Cached regex',
          },
        ],
      };

      const video1 = createVideo({ title: 'Top secret information' });
      const verdict1 = evaluate(video1, patternObj, DEFAULT_SETTINGS);
      expect(verdict1.flagged).toBe(true);

      const video2 = createVideo({ title: 'Another secret revelation' });
      const verdict2 = evaluate(video2, patternObj, DEFAULT_SETTINGS);
      expect(verdict2.flagged).toBe(true);
    });

    it('matches channel rule case-insensitively with handles in pattern rule', () => {
      const channelPatterns: Patterns = {
        schemaVersion: 1,
        revision: 1,
        version: '2026.11.23',
        minEngineVersion: 1,
        thresholds: { gentle: 5, balanced: 3, strict: 2 },
        categories: [{ id: 'ai-slop', label: 'AI', description: 'AI' }],
        rules: [
          {
            id: 'slop-rule',
            category: 'ai-slop',
            type: 'channel',
            handles: ['@BadBotChannel'],
            weight: 3,
            label: 'Known AI Channel',
          },
        ],
      };

      const video = createVideo({
        title: 'Normal Title',
        channelHandle: '@badbotchannel',
      });
      const verdict = evaluate(video, channelPatterns, DEFAULT_SETTINGS);

      expect(verdict.flagged).toBe(true);
      expect(verdict.source).toBe('patterns');
      expect(verdict.matchedRuleIds).toEqual(['slop-rule']);
    });

    it('matches punctuationRun rule for runs of ! and ?', () => {
      const punctPatterns: Patterns = {
        schemaVersion: 1,
        revision: 1,
        version: '2026.11.23',
        minEngineVersion: 1,
        thresholds: { gentle: 5, balanced: 1, strict: 1 },
        categories: [{ id: 'shout', label: 'Shout', description: 'Shout' }],
        rules: [
          {
            id: 'punct-3',
            category: 'shout',
            type: 'punctuationRun',
            min: 3,
            weight: 1,
            label: 'Run of 3 !/?',
          },
        ],
      };

      expect(
        evaluate(
          createVideo({ title: 'What!?!' }),
          punctPatterns,
          DEFAULT_SETTINGS,
        ).flagged,
      ).toBe(true);
      expect(
        evaluate(
          createVideo({ title: 'Really??' }),
          punctPatterns,
          DEFAULT_SETTINGS,
        ).flagged,
      ).toBe(false);
      expect(
        evaluate(
          createVideo({ title: 'No punctuation' }),
          punctPatterns,
          DEFAULT_SETTINGS,
        ).flagged,
      ).toBe(false);
    });

    it('matches emojiCount rule with unicode Extended_Pictographic property', () => {
      const emojiPatterns: Patterns = {
        schemaVersion: 1,
        revision: 1,
        version: '2026.11.23',
        minEngineVersion: 1,
        thresholds: { gentle: 5, balanced: 1, strict: 1 },
        categories: [{ id: 'spam', label: 'Spam', description: 'Spam' }],
        rules: [
          {
            id: 'emoji-3',
            category: 'spam',
            type: 'emojiCount',
            min: 3,
            weight: 1,
            label: '3 emojis',
          },
        ],
      };

      expect(
        evaluate(
          createVideo({ title: 'Test 🚀🔥🎉' }),
          emojiPatterns,
          DEFAULT_SETTINGS,
        ).flagged,
      ).toBe(true);
      expect(
        evaluate(
          createVideo({ title: 'Test 🚀🔥' }),
          emojiPatterns,
          DEFAULT_SETTINGS,
        ).flagged,
      ).toBe(false);
    });

    it('handles invalid regex syntax gracefully without throwing', () => {
      const invalidRegexPatterns: Patterns = {
        schemaVersion: 1,
        revision: 1,
        version: '2026.11.23',
        minEngineVersion: 1,
        thresholds: { gentle: 5, balanced: 1, strict: 1 },
        categories: [{ id: 'cat', label: 'Cat', description: 'Desc' }],
        rules: [
          {
            id: 'bad-regex',
            category: 'cat',
            type: 'regex',
            pattern: '[unclosed-bracket',
            weight: 1,
            label: 'Bad regex',
          },
        ],
      };

      const verdict = evaluate(
        createVideo({ title: 'some title' }),
        invalidRegexPatterns,
        DEFAULT_SETTINGS,
      );
      expect(verdict.flagged).toBe(false);
      expect(verdict.matchedRuleIds).toEqual([]);
    });

    it('handles unknown rule types gracefully without throwing', () => {
      const unknownRulePatterns = {
        schemaVersion: 1,
        revision: 1,
        version: '2026.11.23',
        minEngineVersion: 1,
        thresholds: { gentle: 5, balanced: 1, strict: 1 },
        categories: [{ id: 'cat', label: 'Cat', description: 'Desc' }],
        rules: [
          {
            id: 'future-type',
            category: 'cat',
            type: 'ai-classifier' as unknown as 'regex',
            weight: 5,
            label: 'Future classifier',
          },
        ],
      } as unknown as Patterns;

      const verdict = evaluate(
        createVideo({ title: 'some title' }),
        unknownRulePatterns,
        DEFAULT_SETTINGS,
      );
      expect(verdict.flagged).toBe(false);
      expect(verdict.matchedRuleIds).toEqual([]);
    });

    it('handles missing or partial thresholds with fallback to 3', () => {
      const missingThresholdsPatterns = {
        schemaVersion: 1,
        revision: 1,
        version: '2026.11.23',
        minEngineVersion: 1,
        thresholds: {} as unknown as Patterns['thresholds'],
        categories: [{ id: 'cat', label: 'Cat', description: 'Desc' }],
        rules: [
          {
            id: 'r1',
            category: 'cat',
            type: 'regex',
            pattern: 'hit',
            flags: 'i',
            weight: 3,
            label: 'Hit',
          },
        ],
      } as unknown as Patterns;

      const verdict = evaluate(
        createVideo({ title: 'hit' }),
        missingThresholdsPatterns,
        { ...DEFAULT_SETTINGS, strictness: 'gentle' },
      );
      // Fallback threshold 3: score is 3, 3 >= 3 -> flagged
      expect(verdict.flagged).toBe(true);
    });

    it('handles non-array autoCategories in isAutoEligible gracefully', () => {
      const verdict: Verdict = {
        flagged: true,
        score: 3,
        reasons: ['Reason'],
        matchedRuleIds: ['r1'],
        matchedCategories: ['bait-phrase'],
        source: 'patterns',
      };
      const settings = {
        ...DEFAULT_SETTINGS,
        autoNotInterested: true,
        autoCategories: null as unknown as string[],
      };

      expect(isAutoEligible(verdict, settings)).toBe(false);
    });

    it('handles empty handles and non-string items in handle lists', () => {
      const video = createVideo({ channelHandle: '@' });
      const settings: Settings = {
        ...DEFAULT_SETTINGS,
        allowedChannels: [
          '@',
          null as unknown as string,
          123 as unknown as string,
          '',
        ],
      };
      const verdict = evaluate(video, BUNDLED_PATTERNS, settings);
      expect(verdict.source).not.toBe('allowlist');
    });

    it('punctuationRun with min <= 0 returns false', () => {
      const punctZeroPatterns: Patterns = {
        schemaVersion: 1,
        revision: 1,
        version: '2026.11.23',
        minEngineVersion: 1,
        thresholds: { gentle: 5, balanced: 1, strict: 1 },
        categories: [{ id: 'cat', label: 'Cat', description: 'Desc' }],
        rules: [
          {
            id: 'zero-punct',
            category: 'cat',
            type: 'punctuationRun',
            min: 0,
            weight: 1,
            label: 'Zero min punct',
          },
        ],
      };
      const verdict = evaluate(
        createVideo({ title: 'No punct here' }),
        punctZeroPatterns,
        DEFAULT_SETTINGS,
      );
      expect(verdict.flagged).toBe(false);
    });
  });
});
