import { initShorts } from '../src/platforms/youtube/shorts';

export default defineContentScript({
  matches: ['*://www.youtube.com/*'],
  main() {
    initShorts();
  },
});
