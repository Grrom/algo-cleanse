import { storage } from 'wxt/utils/storage';
import { BUNDLED_PATTERNS } from './bundled-patterns';
import { ENGINE_VERSION } from './engine-version';
import { parsePatterns, type Patterns } from './patterns-schema';

export interface RemotePatternsRecord {
  patterns: Patterns;
  fetchedAt: string;
}

export function getValidRemotePatterns(record: unknown): Patterns | null {
  if (!record || typeof record !== 'object') {
    return null;
  }
  const raw = (record as Record<string, unknown>).patterns;
  if (!raw) {
    return null;
  }
  const parsed = parsePatterns(raw);
  if (!parsed) {
    return null;
  }
  if (parsed.minEngineVersion > ENGINE_VERSION) {
    return null;
  }
  return parsed;
}

export async function loadPatterns(): Promise<Patterns> {
  try {
    const record = await storage.getItem<RemotePatternsRecord | null>(
      'local:remotePatterns',
    );
    const validRemote = getValidRemotePatterns(record);
    if (validRemote && validRemote.revision > BUNDLED_PATTERNS.revision) {
      return validRemote;
    }
    return BUNDLED_PATTERNS;
  } catch {
    return BUNDLED_PATTERNS;
  }
}

export function watchPatterns(cb: (patterns: Patterns) => void): () => void {
  try {
    return storage.watch<RemotePatternsRecord | null>(
      'local:remotePatterns',
      async () => {
        const patterns = await loadPatterns();
        cb(patterns);
      },
    );
  } catch {
    return () => {};
  }
}

export function getActiveCategoryIds(patterns: Patterns): Set<string> {
  return new Set(patterns.categories.map((c) => c.id));
}

export function filterActiveCategories(
  patterns: Patterns,
  autoCategories: string[],
): string[] {
  const activeIds = getActiveCategoryIds(patterns);
  return autoCategories.filter((id) => activeIds.has(id));
}
