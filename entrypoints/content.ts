import '../src/platforms/youtube/collapse.css';
import { initContent } from '../src/platforms/youtube/content-main';
import { initShorts } from '../src/platforms/youtube/shorts';

export default defineContentScript({
  matches: ['*://www.youtube.com/*'],
  async main() {
    initShorts();
    await initContent();
  },
});
