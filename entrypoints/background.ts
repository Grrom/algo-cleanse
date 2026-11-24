import { initBadgeHandler } from '../src/background/badge';
import { initPatternUpdater } from '../src/background/pattern-updater';

export default defineBackground(() => {
  initPatternUpdater();
  initBadgeHandler();
});
