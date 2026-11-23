import { initPatternUpdater } from '../src/background/pattern-updater';

export default defineBackground(() => {
  initPatternUpdater();
});
