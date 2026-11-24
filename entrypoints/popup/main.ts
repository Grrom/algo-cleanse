import { browser } from 'wxt/browser';
import { loadPatterns } from '../../src/core/active-patterns';
import { BUNDLED_PATTERNS } from '../../src/core/bundled-patterns';
import type { Patterns } from '../../src/core/patterns-schema';
import {
  getSettings,
  setAutoCategory,
  updateSettings,
  watchSettings,
} from '../../src/core/settings';
import type { Settings, Strictness } from '../../src/core/types';

const getBrowser = (): typeof browser => {
  const g = globalThis as unknown as { browser?: typeof browser };
  return g.browser ?? browser;
};

export interface PopupController {
  unsubscribe: () => void;
  getSettings: () => Settings;
  getPatterns: () => Patterns;
}

export async function initPopup(
  root: HTMLElement = document.body,
): Promise<PopupController> {
  // Load active patterns or fallback to bundled
  let patterns: Patterns;
  try {
    patterns = await loadPatterns();
  } catch {
    patterns = BUNDLED_PATTERNS;
  }
  if (!patterns || !Array.isArray(patterns.categories)) {
    patterns = BUNDLED_PATTERNS;
  }

  // Load current settings
  let settings = await getSettings();

  // Elements
  const strictnessGentle =
    root.querySelector<HTMLButtonElement>('#strictness-gentle');
  const strictnessBalanced = root.querySelector<HTMLButtonElement>(
    '#strictness-balanced',
  );
  const strictnessStrict =
    root.querySelector<HTMLButtonElement>('#strictness-strict');

  const filterClickbaitToggle = root.querySelector<HTMLInputElement>(
    '#toggle-filter-clickbait',
  );
  const removeShortsToggle = root.querySelector<HTMLInputElement>(
    '#toggle-remove-shorts',
  );
  const autoNotInterestedToggle = root.querySelector<HTMLInputElement>(
    '#toggle-auto-not-interested',
  );
  const dontRecommendToggle = root.querySelector<HTMLInputElement>(
    '#toggle-dont-recommend',
  );
  const feedbackToggle =
    root.querySelector<HTMLInputElement>('#toggle-feedback');

  const categoriesContainer = root.querySelector<HTMLElement>(
    '#categories-container',
  );
  const noCategoriesHint = root.querySelector<HTMLElement>(
    '#no-categories-hint',
  );

  const blockedLink = root.querySelector<HTMLAnchorElement>(
    '#blocked-channels-link',
  );
  const allowedLink = root.querySelector<HTMLAnchorElement>(
    '#allowed-channels-link',
  );
  const manageHistoryLink = root.querySelector<HTMLAnchorElement>(
    '#manage-history-link',
  );

  const blockedCount = root.querySelector<HTMLElement>('#blocked-count');
  const allowedCount = root.querySelector<HTMLElement>('#allowed-count');
  const revisionFooter = root.querySelector<HTMLElement>('#patterns-revision');

  if (revisionFooter) {
    revisionFooter.textContent = `Patterns rev ${patterns.revision}`;
  }

  function renderCategories(currentSettings: Settings) {
    if (!categoriesContainer) return;
    categoriesContainer.innerHTML = '';

    for (const cat of patterns.categories) {
      const item = document.createElement('label');
      item.className = 'category-item';
      item.htmlFor = `cat-${cat.id}`;
      if (!currentSettings.autoNotInterested) {
        item.classList.add('disabled');
      }

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'category-checkbox';
      input.id = `cat-${cat.id}`;
      input.dataset.categoryId = cat.id;
      input.dataset.category = cat.id;
      input.value = cat.id;
      input.checked = currentSettings.autoCategories.includes(cat.id);
      input.disabled = !currentSettings.autoNotInterested;

      input.addEventListener('change', async () => {
        const updated = await setAutoCategory(cat.id, input.checked);
        updateUI(updated);
      });

      const info = document.createElement('div');
      info.className = 'category-info';

      const label = document.createElement('span');
      label.className = 'category-label';
      label.textContent = cat.label;
      info.appendChild(label);

      if (cat.description) {
        const desc = document.createElement('span');
        desc.className = 'category-desc';
        desc.textContent = cat.description;
        info.appendChild(desc);
      }

      item.appendChild(input);
      item.appendChild(info);
      categoriesContainer.appendChild(item);
    }
  }

  function updateStrictnessUI(strictness: Strictness) {
    const buttons: Array<{ el: HTMLButtonElement | null; val: Strictness }> = [
      { el: strictnessGentle, val: 'gentle' },
      { el: strictnessBalanced, val: 'balanced' },
      { el: strictnessStrict, val: 'strict' },
    ];
    for (const { el, val } of buttons) {
      if (!el) continue;
      const isActive = strictness === val;
      el.classList.toggle('active', isActive);
      el.setAttribute('aria-checked', isActive ? 'true' : 'false');
    }
  }

  function updateUI(s: Settings) {
    settings = s;

    // Strictness
    updateStrictnessUI(s.strictness);

    // Filters toggles
    if (filterClickbaitToggle) filterClickbaitToggle.checked = s.enabled;
    if (removeShortsToggle) removeShortsToggle.checked = s.hideShorts;
    if (autoNotInterestedToggle)
      autoNotInterestedToggle.checked = s.autoNotInterested;
    if (dontRecommendToggle)
      dontRecommendToggle.checked = s.dontRecommendOnBlock;
    if (feedbackToggle)
      feedbackToggle.checked = s.feedbackConsent === 'granted';

    // Categories checkboxes disabled state & checked state
    if (categoriesContainer) {
      const checkboxes =
        categoriesContainer.querySelectorAll<HTMLInputElement>(
          '.category-checkbox',
        );
      checkboxes.forEach((cb) => {
        const catId = cb.dataset.categoryId;
        if (catId) {
          cb.checked = s.autoCategories.includes(catId);
        }
        cb.disabled = !s.autoNotInterested;
        cb.closest('.category-item')?.classList.toggle(
          'disabled',
          !s.autoNotInterested,
        );
      });
    }

    // Hint: when autoNotInterested is true and autoCategories is empty, show hint
    if (noCategoriesHint) {
      if (s.autoNotInterested && s.autoCategories.length === 0) {
        noCategoriesHint.style.display = 'block';
      } else {
        noCategoriesHint.style.display = 'none';
      }
    }

    // Channel link counts
    if (blockedCount) {
      blockedCount.textContent = String(s.blockedChannels.length);
    }
    if (allowedCount) {
      allowedCount.textContent = String(s.allowedChannels.length);
    }
  }

  // Strictness clicks
  const setupStrictness = (btn: HTMLButtonElement | null, val: Strictness) => {
    btn?.addEventListener('click', async () => {
      const updated = await updateSettings({ strictness: val });
      updateUI(updated);
    });
  };
  setupStrictness(strictnessGentle, 'gentle');
  setupStrictness(strictnessBalanced, 'balanced');
  setupStrictness(strictnessStrict, 'strict');

  // Toggle listeners
  filterClickbaitToggle?.addEventListener('change', async () => {
    const updated = await updateSettings({
      enabled: filterClickbaitToggle.checked,
    });
    updateUI(updated);
  });

  removeShortsToggle?.addEventListener('change', async () => {
    const updated = await updateSettings({
      hideShorts: removeShortsToggle.checked,
    });
    updateUI(updated);
  });

  autoNotInterestedToggle?.addEventListener('change', async () => {
    const updated = await updateSettings({
      autoNotInterested: autoNotInterestedToggle.checked,
    });
    updateUI(updated);
  });

  dontRecommendToggle?.addEventListener('change', async () => {
    const updated = await updateSettings({
      dontRecommendOnBlock: dontRecommendToggle.checked,
    });
    updateUI(updated);
  });

  feedbackToggle?.addEventListener('change', async () => {
    const consent = feedbackToggle.checked ? 'granted' : 'denied';
    const updated = await updateSettings({ feedbackConsent: consent });
    updateUI(updated);
  });

  // Links
  const b = getBrowser();
  const openOptionsPage = (e: MouseEvent) => {
    e.preventDefault();
    try {
      if (b?.runtime?.openOptionsPage) {
        void b.runtime.openOptionsPage();
      }
    } catch {
      // Ignore in environments where openOptionsPage is unmocked
    }
  };
  blockedLink?.addEventListener('click', openOptionsPage);
  allowedLink?.addEventListener('click', openOptionsPage);

  manageHistoryLink?.addEventListener('click', (e) => {
    if (b?.tabs?.create) {
      e.preventDefault();
      b.tabs.create({
        url: 'https://myactivity.google.com/product/youtube',
      });
    }
  });

  // Initialize
  renderCategories(settings);
  updateUI(settings);

  const unsubscribe = watchSettings((newSettings) => {
    updateUI(newSettings);
  });

  return {
    unsubscribe,
    getSettings: () => settings,
    getPatterns: () => patterns,
  };
}

if (typeof document !== 'undefined') {
  const root = document.getElementById('app');
  if (root) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        void initPopup(root);
      });
    } else {
      void initPopup(root);
    }
  }
}
