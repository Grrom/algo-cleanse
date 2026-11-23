import { describe, expect, it } from 'vitest';

describe('popup', () => {
  it('renders the extension name AlgoCleanse', () => {
    document.body.innerHTML = '<div id="app"><h1>AlgoCleanse</h1></div>';
    const heading = document.querySelector('h1');
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toBe('AlgoCleanse');
  });
});
