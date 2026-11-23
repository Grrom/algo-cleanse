import rawPatterns from '../../patterns/patterns.json';
import { parsePatterns, type Patterns } from './patterns-schema';

const parsed = parsePatterns(rawPatterns);
if (!parsed) {
  throw new Error('Bundled patterns failed schema validation');
}

export const BUNDLED_PATTERNS: Patterns = parsed;
export default BUNDLED_PATTERNS;
