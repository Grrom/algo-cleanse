import { initBadgeHandler } from '../src/background/badge';
import { initFeedbackHandler } from '../src/background/feedback';
import { initPatternUpdater } from '../src/background/pattern-updater';
import { initWelcomeHandler } from '../src/background/welcome';

export default defineBackground(() => {
  initPatternUpdater();
  initBadgeHandler();
  initWelcomeHandler();
  initFeedbackHandler();
});
