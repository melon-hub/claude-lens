/**
 * Inspect Sequence UI (Phase 2)
 *
 * Manages the captured interaction sequence display.
 */

import { state, clearInspectSequence } from '../state';
import {
  inspectSequenceInfo,
  sequenceCount,
  inspectSequenceList,
} from '../setup';

/**
 * Update the inspect sequence UI with current captured interactions
 */
export function updateInspectSequenceUI(): void {
  // Show/hide sequence section
  if (state.inspectSequence.length > 0) {
    inspectSequenceInfo.classList.remove('hidden');
    sequenceCount.textContent = String(state.inspectSequence.length);
  } else {
    inspectSequenceInfo.classList.add('hidden');
  }

  // Render sequence items
  inspectSequenceList.textContent = '';

  for (let i = 0; i < state.inspectSequence.length; i++) {
    const interaction = state.inspectSequence[i];
    if (!interaction) continue;
    const el = interaction.element;

    const item = document.createElement('div');
    item.className = 'sequence-item';

    // Step number
    const numberEl = document.createElement('div');
    numberEl.className = 'sequence-number';
    numberEl.textContent = String(i + 1);
    item.appendChild(numberEl);

    // Content
    const contentEl = document.createElement('div');
    contentEl.className = 'sequence-content';

    // Element description
    const elementEl = document.createElement('div');
    elementEl.className = 'sequence-element';
    elementEl.textContent = el.description || `<${el.tagName}${el.id ? '#' + el.id : ''}>`;
    contentEl.appendChild(elementEl);

    // Selector
    const selectorEl = document.createElement('div');
    selectorEl.className = 'sequence-selector';
    selectorEl.textContent = el.selector;
    contentEl.appendChild(selectorEl);

    // Result
    const resultEl = document.createElement('div');
    resultEl.className = 'sequence-result';
    if (interaction.result.includes('blocked')) {
      resultEl.classList.add('blocked');
    }
    resultEl.textContent = interaction.result;
    contentEl.appendChild(resultEl);

    item.appendChild(contentEl);
    inspectSequenceList.appendChild(item);
  }
}

/**
 * Clear inspect sequence and update UI
 */
export function clearInspectSequenceUI(): void {
  clearInspectSequence();
  updateInspectSequenceUI();
}
