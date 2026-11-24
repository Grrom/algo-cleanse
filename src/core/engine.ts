import type { Patterns, RegexRule, Rule } from './patterns-schema';
import type { Settings, VideoInfo } from './types';

export type VerdictSource =
  'allowlist' | 'blocklist' | 'patterns' | 'none' | 'user_reported';

export interface Verdict {
  flagged: boolean;
  score: number;
  reasons: string[];
  matchedRuleIds: string[];
  matchedCategories: string[];
  source: VerdictSource;
}

const patternRegexCache = new WeakMap<Patterns, Map<string, RegExp>>();
const punctRegexCache = new Map<number, RegExp>();

function normalizeHandle(handle: string): string {
  const trimmed = handle.trim().toLowerCase();
  if (trimmed === '' || trimmed === '@') return '';
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
}

function isHandleInList(
  handle: string | null | undefined,
  list: string[] | undefined,
): boolean {
  if (!handle) return false;
  const normHandle = normalizeHandle(handle);
  if (!normHandle) return false;
  if (!Array.isArray(list)) return false;
  return list.some((item) => {
    if (typeof item !== 'string') return false;
    const normItem = normalizeHandle(item);
    return normItem !== '' && normItem === normHandle;
  });
}

function getCompiledRegex(patterns: Patterns, rule: RegexRule): RegExp | null {
  let cache = patternRegexCache.get(patterns);
  if (!cache) {
    cache = new Map<string, RegExp>();
    patternRegexCache.set(patterns, cache);
  }
  let re = cache.get(rule.id);
  if (!re) {
    try {
      re = new RegExp(rule.pattern, rule.flags);
      cache.set(rule.id, re);
    } catch {
      return null;
    }
  }
  return re;
}

function getPunctuationRegex(min: number): RegExp {
  let re = punctRegexCache.get(min);
  if (!re) {
    re = new RegExp(`[!\\?]{${min},}`);
    punctRegexCache.set(min, re);
  }
  return re;
}

function matchesRule(
  rule: Rule,
  video: VideoInfo,
  patterns: Patterns,
): boolean {
  switch (rule.type) {
    case 'regex': {
      if (!video.title) return false;
      const re = getCompiledRegex(patterns, rule);
      if (!re) return false;
      re.lastIndex = 0;
      return re.test(video.title);
    }
    case 'capsRatio': {
      if (!video.title) return false;
      const letters = video.title.match(/\p{L}/gu);
      const letterCount = letters ? letters.length : 0;
      const minLetters = rule.minLetters ?? 0;
      if (letterCount < minLetters || letterCount === 0) {
        return false;
      }
      const upper = video.title.match(/\p{Lu}/gu);
      const upperCount = upper ? upper.length : 0;
      return upperCount / letterCount >= rule.min;
    }
    case 'emojiCount': {
      if (!video.title) return false;
      const emojis = video.title.match(/\p{Extended_Pictographic}/gu);
      const count = emojis ? emojis.length : 0;
      return count >= rule.min;
    }
    case 'punctuationRun': {
      if (!video.title) return false;
      if (rule.min <= 0) return false;
      const min = Math.floor(rule.min);
      const re = getPunctuationRegex(min);
      re.lastIndex = 0;
      return re.test(video.title);
    }
    case 'channel': {
      if (!video.channelHandle) return false;
      return isHandleInList(video.channelHandle, rule.handles);
    }
    default:
      return false;
  }
}

export function evaluate(
  video: VideoInfo,
  patterns: Patterns,
  settings: Settings,
): Verdict {
  // 1. settings.enabled === false -> not flagged, source none
  if (!settings.enabled) {
    return {
      flagged: false,
      score: 0,
      reasons: [],
      matchedRuleIds: [],
      matchedCategories: [],
      source: 'none',
    };
  }

  // 2. Channel handle (case-insensitive) in allowedChannels -> not flagged, source allowlist
  if (
    video.channelHandle &&
    isHandleInList(video.channelHandle, settings.allowedChannels)
  ) {
    return {
      flagged: false,
      score: 0,
      reasons: [],
      matchedRuleIds: [],
      matchedCategories: [],
      source: 'allowlist',
    };
  }

  // 3. Handle in blockedChannels -> flagged, reasons ["You blocked this channel"], matchedCategories: [], source blocklist
  if (
    video.channelHandle &&
    isHandleInList(video.channelHandle, settings.blockedChannels)
  ) {
    return {
      flagged: true,
      score: 0,
      reasons: ['You blocked this channel'],
      matchedRuleIds: [],
      matchedCategories: [],
      source: 'blocklist',
    };
  }

  // 4. Otherwise sum weight of matching rules; flagged when score >= patterns.thresholds[settings.strictness];
  // reasons = de-duplicated rule labels in rule order; matchedCategories = de-duplicated categories of matched rules in rule order;
  // source patterns if flagged else none.
  let score = 0;
  const matchedRules: Rule[] = [];

  const rules = Array.isArray(patterns?.rules) ? patterns.rules : [];
  for (const rule of rules) {
    if (matchesRule(rule, video, patterns)) {
      matchedRules.push(rule);
      score += rule.weight;
    }
  }

  const threshold =
    patterns?.thresholds?.[settings.strictness] ??
    patterns?.thresholds?.balanced ??
    3;
  const flagged = score >= threshold;
  const source: VerdictSource = flagged ? 'patterns' : 'none';

  const reasons: string[] = [];
  const seenReasons = new Set<string>();
  for (const rule of matchedRules) {
    if (!seenReasons.has(rule.label)) {
      seenReasons.add(rule.label);
      reasons.push(rule.label);
    }
  }

  const matchedCategories: string[] = [];
  const seenCategories = new Set<string>();
  for (const rule of matchedRules) {
    if (!seenCategories.has(rule.category)) {
      seenCategories.add(rule.category);
      matchedCategories.push(rule.category);
    }
  }

  return {
    flagged,
    score,
    reasons,
    matchedRuleIds: matchedRules.map((r) => r.id),
    matchedCategories,
    source,
  };
}

export function isAutoEligible(verdict: Verdict, settings: Settings): boolean {
  if (!settings.autoNotInterested) return false;
  if (!verdict.flagged) return false;
  if (verdict.source !== 'patterns') return false;
  const autoCategories = Array.isArray(settings.autoCategories)
    ? settings.autoCategories
    : [];
  return verdict.matchedCategories.some((c) => autoCategories.includes(c));
}
