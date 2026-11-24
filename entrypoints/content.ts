import '../src/platforms/youtube/collapse.css';
import { initContent } from '../src/platforms/youtube/content-main';

export default defineContentScript({
  matches: ['*://www.youtube.com/*'],
  async main() {
    await initContent();
  },
});
