import { z } from 'zod';

export const categorySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
});

export const thresholdsSchema = z.object({
  gentle: z.number(),
  balanced: z.number(),
  strict: z.number(),
});

function isValidRegexFlags(flags: string | undefined): boolean {
  if (flags === undefined || flags === '') return true;
  return flags === 'i' || flags === 'u' || flags === 'iu' || flags === 'ui';
}

function isValidCompiledRegex(
  pattern: string,
  flags: string | undefined,
): boolean {
  if (flags !== undefined && !isValidRegexFlags(flags)) return false;
  try {
    new RegExp(pattern, flags);
    return true;
  } catch {
    return false;
  }
}

export const regexRuleSchema = z.object({
  id: z.string().min(1),
  category: z.string().min(1),
  type: z.literal('regex'),
  pattern: z.string().min(1).max(200),
  flags: z.string().optional(),
  weight: z.number(),
  label: z.string().min(1),
});

export const capsRatioRuleSchema = z.object({
  id: z.string().min(1),
  category: z.string().min(1),
  type: z.literal('capsRatio'),
  min: z.number(),
  minLetters: z.number().optional(),
  weight: z.number(),
  label: z.string().min(1),
});

export const emojiCountRuleSchema = z.object({
  id: z.string().min(1),
  category: z.string().min(1),
  type: z.literal('emojiCount'),
  min: z.number(),
  weight: z.number(),
  label: z.string().min(1),
});

export const punctuationRunRuleSchema = z.object({
  id: z.string().min(1),
  category: z.string().min(1),
  type: z.literal('punctuationRun'),
  min: z.number(),
  weight: z.number(),
  label: z.string().min(1),
});

export const channelRuleSchema = z.object({
  id: z.string().min(1),
  category: z.string().min(1),
  type: z.literal('channel'),
  handles: z.array(z.string()),
  weight: z.number(),
  label: z.string().min(1),
});

const baseRuleSchema = z.discriminatedUnion('type', [
  regexRuleSchema,
  capsRatioRuleSchema,
  emojiCountRuleSchema,
  punctuationRunRuleSchema,
  channelRuleSchema,
]);

export const ruleSchema = baseRuleSchema.superRefine((rule, ctx) => {
  if (rule.type === 'regex') {
    if (rule.pattern.length > 200) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Regex pattern must not exceed 200 characters',
        path: ['pattern'],
      });
    }
    if (rule.flags !== undefined && !isValidRegexFlags(rule.flags)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Regex flags must be a subset of "iu"',
        path: ['flags'],
      });
    }
    if (!isValidCompiledRegex(rule.pattern, rule.flags)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid regular expression syntax',
        path: ['pattern'],
      });
    }
  }
});

export const patternsSchema = z
  .object({
    schemaVersion: z.number().int().positive(),
    revision: z.number().int().positive(),
    version: z.string().min(1),
    minEngineVersion: z.number().int().positive(),
    thresholds: thresholdsSchema,
    categories: z.array(categorySchema),
    rules: z.array(ruleSchema),
  })
  .superRefine((data, ctx) => {
    const categoryIds = new Set<string>();
    for (let i = 0; i < data.categories.length; i++) {
      const cat = data.categories[i]!;
      if (categoryIds.has(cat.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate category id: "${cat.id}"`,
          path: ['categories', i, 'id'],
        });
      }
      categoryIds.add(cat.id);
    }

    const ruleIds = new Set<string>();
    for (let i = 0; i < data.rules.length; i++) {
      const rule = data.rules[i]!;
      if (ruleIds.has(rule.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate rule id: "${rule.id}"`,
          path: ['rules', i, 'id'],
        });
      }
      ruleIds.add(rule.id);

      if (!categoryIds.has(rule.category)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Rule "${rule.id}" references unknown category "${rule.category}"`,
          path: ['rules', i, 'category'],
        });
      }
    }
  });

export type Category = z.infer<typeof categorySchema>;
export type PatternCategory = Category;

export type Thresholds = z.infer<typeof thresholdsSchema>;
export type StrictnessThresholds = Thresholds;

export type RegexRule = z.infer<typeof regexRuleSchema>;
export type CapsRatioRule = z.infer<typeof capsRatioRuleSchema>;
export type EmojiCountRule = z.infer<typeof emojiCountRuleSchema>;
export type PunctuationRunRule = z.infer<typeof punctuationRunRuleSchema>;
export type ChannelRule = z.infer<typeof channelRuleSchema>;

export type Rule = z.infer<typeof ruleSchema>;
export type PatternRule = Rule;

export type Patterns = z.infer<typeof patternsSchema>;

export function parsePatterns(json: unknown): Patterns | null {
  try {
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      return null;
    }
    const result = patternsSchema.safeParse(json);
    if (!result.success) {
      return null;
    }
    return result.data;
  } catch {
    return null;
  }
}
