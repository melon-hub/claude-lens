/**
 * DOM utilities for the renderer
 */

/**
 * Type-safe getElementById helper
 * @param id - Element ID without the # prefix
 * @returns The element cast to the specified type
 */
export function getEl<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

/**
 * Copy text to clipboard with visual feedback on a button
 * @param text - Text to copy
 * @param button - Button element to show feedback on
 * @param setStatus - Optional status callback function
 */
export async function copyToClipboard(
  text: string,
  button: HTMLButtonElement,
  setStatus?: (msg: string, connected?: boolean) => void
): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    button.classList.add('copied');

    // Swap icon to checkmark temporarily
    const originalSvg = button.innerHTML;
    button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>`;

    if (setStatus) {
      setStatus('Copied!', true);
    }

    setTimeout(() => {
      button.classList.remove('copied');
      button.innerHTML = originalSvg;
    }, 1500);
  } catch (err) {
    console.error('Failed to copy:', err);
    if (setStatus) {
      setStatus('Copy failed');
    }
  }
}
