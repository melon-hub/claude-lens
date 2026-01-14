/**
 * Form State UI (Phase 3)
 *
 * Displays form input state (validation, value, placeholder, etc.)
 */

import type { ElementInfo } from '../types';
import {
  formStateInfo,
  formStateContent,
  validationBadge,
} from '../setup';

/**
 * Update the form state UI for a selected element
 */
export function updateFormStateUI(element: ElementInfo): void {
  const formState = element.formState;

  if (!formState) {
    formStateInfo.classList.add('hidden');
    return;
  }

  formStateInfo.classList.remove('hidden');

  // Set validation badge
  validationBadge.className = 'validation-badge';
  if (formState.disabled) {
    validationBadge.textContent = 'Disabled';
    validationBadge.classList.add('disabled');
  } else if (formState.validationState === 'invalid') {
    validationBadge.textContent = 'Invalid';
    validationBadge.classList.add('invalid');
  } else if (formState.validationState === 'valid') {
    validationBadge.textContent = 'Valid';
    validationBadge.classList.add('valid');
  } else if (formState.required) {
    validationBadge.textContent = 'Required';
    validationBadge.classList.add('required');
  } else {
    validationBadge.textContent = '';
  }

  // Build form state rows
  formStateContent.textContent = '';

  const addRow = (label: string, value: string, isError = false) => {
    const row = document.createElement('div');
    row.className = 'form-state-row';

    const labelEl = document.createElement('span');
    labelEl.className = 'form-state-label';
    labelEl.textContent = label;
    row.appendChild(labelEl);

    const valueEl = document.createElement('span');
    valueEl.className = 'form-state-value';
    if (isError) valueEl.classList.add('error');
    valueEl.textContent = value;
    row.appendChild(valueEl);

    formStateContent.appendChild(row);
  };

  addRow('Type', formState.type);

  if (formState.value) {
    const displayValue = formState.type === 'password' ? '••••••••' : formState.value.slice(0, 30);
    addRow('Value', displayValue + (formState.value.length > 30 ? '...' : ''));
  }

  if (formState.placeholder) {
    addRow('Placeholder', formState.placeholder);
  }

  if (formState.checked !== undefined) {
    addRow('Checked', formState.checked ? 'Yes' : 'No');
  }

  if (formState.options && formState.options.length > 0) {
    addRow('Options', formState.options.slice(0, 5).join(', ') + (formState.options.length > 5 ? '...' : ''));
  }

  if (formState.readOnly) {
    addRow('Read-only', 'Yes');
  }

  if (formState.validationMessage) {
    addRow('Error', formState.validationMessage, true);
  }
}
