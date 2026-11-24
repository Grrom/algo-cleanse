import { getSettings, updateSettings } from '../../src/core/settings';

export async function initWelcome(root: HTMLElement = document.body) {
  const yesBtn = root.querySelector<HTMLButtonElement>('#btn-consent-yes');
  const noBtn = root.querySelector<HTMLButtonElement>('#btn-consent-no');
  const statusEl = root.querySelector<HTMLElement>('#consent-status');

  const settings = await getSettings();
  updateUI(settings.feedbackConsent);

  function updateUI(consent: 'unset' | 'granted' | 'denied') {
    if (!statusEl) return;
    if (consent === 'granted') {
      statusEl.textContent = 'Feedback enabled. Thank you!';
      statusEl.style.display = 'block';
      yesBtn?.classList.add('selected');
      noBtn?.classList.remove('selected');
    } else if (consent === 'denied') {
      statusEl.textContent = 'Preference saved: no feedback will be sent.';
      statusEl.style.display = 'block';
      noBtn?.classList.add('selected');
      yesBtn?.classList.remove('selected');
    } else {
      statusEl.style.display = 'none';
      yesBtn?.classList.remove('selected');
      noBtn?.classList.remove('selected');
    }
  }

  yesBtn?.addEventListener('click', async () => {
    await updateSettings({ feedbackConsent: 'granted' });
    updateUI('granted');
  });

  noBtn?.addEventListener('click', async () => {
    await updateSettings({ feedbackConsent: 'denied' });
    updateUI('denied');
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      void initWelcome();
    });
  } else {
    void initWelcome();
  }
}
