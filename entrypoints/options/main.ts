import {
  allowChannel,
  blockChannel,
  getSettings,
  removeChannel,
  watchSettings,
} from '../../src/core/settings';
import type { Settings } from '../../src/core/types';

export interface OptionsController {
  unsubscribe: () => void;
  getSettings: () => Settings;
}

export async function initOptions(
  root: HTMLElement = document.body,
): Promise<OptionsController> {
  let settings = await getSettings();

  const addForm = root.querySelector<HTMLFormElement>('#add-channel-form');
  const handleInput =
    root.querySelector<HTMLInputElement>('#add-handle-input') ||
    root.querySelector<HTMLInputElement>('#handle-input') ||
    root.querySelector<HTMLInputElement>('input[type="text"]');
  const channelTypeSelect =
    root.querySelector<HTMLSelectElement>('#channel-type');
  const blockBtn =
    root.querySelector<HTMLButtonElement>('#block-channel-btn') ||
    root.querySelector<HTMLButtonElement>('#block-btn');
  const allowBtn =
    root.querySelector<HTMLButtonElement>('#allow-channel-btn') ||
    root.querySelector<HTMLButtonElement>('#allow-btn');

  const blockedList = root.querySelector<HTMLUListElement>(
    '#blocked-channels-list',
  );
  const allowedList = root.querySelector<HTMLUListElement>(
    '#allowed-channels-list',
  );
  const blockedCount = root.querySelector<HTMLElement>('#blocked-count');
  const allowedCount = root.querySelector<HTMLElement>('#allowed-count');
  const blockedEmpty = root.querySelector<HTMLElement>('#blocked-empty');
  const allowedEmpty = root.querySelector<HTMLElement>('#allowed-empty');

  function renderList(
    container: HTMLUListElement | null,
    emptyEl: HTMLElement | null,
    countEl: HTMLElement | null,
    channels: string[],
    listType: 'blocked' | 'allowed',
  ) {
    if (countEl) countEl.textContent = String(channels.length);
    if (!container) return;
    container.innerHTML = '';

    if (channels.length === 0) {
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    for (const handle of channels) {
      const li = document.createElement('li');
      li.className = 'channel-item';
      li.dataset.handle = handle;

      const span = document.createElement('span');
      span.className = 'channel-handle';
      span.textContent = handle;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'remove-btn';
      removeBtn.dataset.handle = handle;
      removeBtn.dataset.list = listType;
      removeBtn.textContent = 'Remove';
      removeBtn.setAttribute('aria-label', `Remove ${handle}`);

      removeBtn.addEventListener('click', async () => {
        const updated = await removeChannel(handle);
        updateUI(updated);
      });

      li.appendChild(span);
      li.appendChild(removeBtn);
      container.appendChild(li);
    }
  }

  function updateUI(s: Settings) {
    settings = s;
    renderList(
      blockedList,
      blockedEmpty,
      blockedCount,
      s.blockedChannels,
      'blocked',
    );
    renderList(
      allowedList,
      allowedEmpty,
      allowedCount,
      s.allowedChannels,
      'allowed',
    );
  }

  async function handleAdd(type: 'blocked' | 'allowed') {
    if (!handleInput) return;
    const value = handleInput.value.trim();
    if (!value) return;

    let updated: Settings;
    if (type === 'allowed') {
      updated = await allowChannel(value);
    } else {
      updated = await blockChannel(value);
    }
    handleInput.value = '';
    updateUI(updated);
  }

  addForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = channelTypeSelect?.value === 'allowed' ? 'allowed' : 'blocked';
    await handleAdd(type);
  });

  blockBtn?.addEventListener('click', async () => {
    await handleAdd('blocked');
  });

  allowBtn?.addEventListener('click', async () => {
    await handleAdd('allowed');
  });

  updateUI(settings);

  const unsubscribe = watchSettings((newSettings) => {
    updateUI(newSettings);
  });

  return {
    unsubscribe,
    getSettings: () => settings,
  };
}

if (typeof document !== 'undefined') {
  const root = document.getElementById('app');
  if (root) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        void initOptions(root);
      });
    } else {
      void initOptions(root);
    }
  }
}
