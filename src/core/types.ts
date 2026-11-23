export type Strictness = 'gentle' | 'balanced' | 'strict';

export interface VideoInfo {
  videoId: string;
  title: string | null;
  channelHandle: string | null;
  channelName: string | null;
  durationText: string | null;
  isShort: boolean;
}

export interface Settings {
  enabled: boolean;
  strictness: Strictness;
  hideShorts: boolean;
  autoNotInterested: boolean;
  autoCategories: string[];
  dontRecommendOnBlock: boolean;
  feedbackConsent: 'unset' | 'granted' | 'denied';
  blockedChannels: string[];
  allowedChannels: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  strictness: 'balanced',
  hideShorts: true,
  autoNotInterested: false,
  autoCategories: [],
  dontRecommendOnBlock: true,
  feedbackConsent: 'unset',
  blockedChannels: [],
  allowedChannels: [],
};

export type {
  Category,
  ChannelRule,
  EmojiCountRule,
  PatternCategory,
  PatternRule,
  Patterns,
  PunctuationRunRule,
  RegexRule,
  Rule,
  StrictnessThresholds,
  Thresholds,
} from './patterns-schema';
