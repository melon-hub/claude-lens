/**
 * Context Panel
 *
 * Manages element selection display and the main context panel UI.
 * Shows element details, component hierarchy, styles, attributes, etc.
 */

import type { ElementInfo } from '../types';
import {
  state,
  addSelectedElement as stateAddSelectedElement,
  removeSelectedElement as stateRemoveSelectedElement,
} from '../state';
import {
  // Context Panel - Core
  contextEmpty,
  descriptionInfo,
  elementDescription,
  elementInfo,
  hierarchyInfo,
  hierarchyList,
  pathInfo,
  attributesInfo,
  stylesInfo,
  positionInfo,
  textInfo,
  // Context Panel - Element Details
  elementTag,
  elementPath,
  attributesList,
  stylesList,
  positionData,
  innerText,
  // Context Panel - Component Info
  componentInfo,
  frameworkBadge,
  componentList,
  // Context Panel - Source Info
  sourceInfo,
  sourceStatus,
  sourceAvailable,
  sourceLocation,
  sourceUnavailable,
  sourceNoFramework,
  // Context Panel - Chips
  elementChips,
} from '../setup';

// UI update callbacks - set by main.ts to avoid circular dependencies
let updateFormStateCallback: ((element: ElementInfo) => void) | null = null;
let updatePhase4Callback: ((element: ElementInfo) => void) | null = null;

/**
 * Register UI update callbacks from main.ts
 */
export function setContextPanelCallbacks(
  formStateCallback: (element: ElementInfo) => void,
  phase4Callback: (element: ElementInfo) => void
): void {
  updateFormStateCallback = formStateCallback;
  updatePhase4Callback = phase4Callback;
}

/**
 * Add selected element to context panel
 */
export function addSelectedElement(element: ElementInfo): void {
  // Add to list if not already selected (delegate to state helper)
  stateAddSelectedElement(element);

  // Update context panel display
  updateContextPanel(element);
  updateElementChips();
}

/**
 * Helper to create a prop display element (safe DOM method, no innerHTML)
 */
function createPropElement(name: string, value: unknown): HTMLSpanElement {
  const container = document.createElement('span');

  const nameSpan = document.createElement('span');
  nameSpan.className = 'prop-name';
  nameSpan.textContent = name;

  const equals = document.createTextNode('=');

  const valueSpan = document.createElement('span');
  valueSpan.className = 'prop-value';
  const valueStr = typeof value === 'string' ? `"${value}"` : String(value);
  valueSpan.textContent = valueStr;

  container.appendChild(nameSpan);
  container.appendChild(equals);
  container.appendChild(valueSpan);

  return container;
}

/**
 * Update the context panel with element info
 */
export function updateContextPanel(element: ElementInfo): void {
  // Hide empty state, show sections
  contextEmpty.classList.add('hidden');
  elementInfo.classList.remove('hidden');
  pathInfo.classList.remove('hidden');
  textInfo.classList.remove('hidden');

  // DESCRIPTION section - human-readable element description
  if (element.description) {
    descriptionInfo.classList.remove('hidden');
    elementDescription.textContent = element.description;
  } else {
    descriptionInfo.classList.add('hidden');
  }

  // ELEMENT section - build tag display
  let tagDisplay = `<${element.tagName}`;
  if (element.id) tagDisplay += ` id="${element.id}"`;
  if (element.classes.length > 0) tagDisplay += ` class="${element.classes.join(' ')}"`;
  tagDisplay += '>';
  elementTag.textContent = tagDisplay;

  // COMPONENT section (React/Vue)
  if (element.framework && element.framework.components.length > 0) {
    componentInfo.classList.remove('hidden');

    // Set framework badge
    frameworkBadge.textContent = element.framework.framework;
    frameworkBadge.className = `framework-badge ${element.framework.framework.toLowerCase()}`;

    // Display component hierarchy
    componentList.textContent = '';
    for (const comp of element.framework.components) {
      const row = document.createElement('div');
      row.className = 'component-row';

      // Component name (e.g., <UserProfile />)
      const nameEl = document.createElement('div');
      nameEl.className = 'component-name';
      nameEl.textContent = `<${comp.name} />`;
      row.appendChild(nameEl);

      // Source file and line number
      if (comp.source) {
        const sourceEl = document.createElement('div');
        sourceEl.className = 'component-source';
        sourceEl.textContent = `${comp.source.fileName}:${comp.source.lineNumber}`;
        row.appendChild(sourceEl);
      }

      // Props (limited display) - using safe DOM methods
      if (comp.props && Object.keys(comp.props).length > 0) {
        const propsEl = document.createElement('div');
        propsEl.className = 'component-props';
        const propEntries = Object.entries(comp.props).slice(0, 3);

        propEntries.forEach(([k, v], idx) => {
          if (idx > 0) {
            propsEl.appendChild(document.createTextNode(' '));
          }
          propsEl.appendChild(createPropElement(k, v));
        });

        if (Object.keys(comp.props).length > 3) {
          propsEl.appendChild(document.createTextNode(' ...'));
        }
        row.appendChild(propsEl);
      }

      componentList.appendChild(row);
    }

  } else {
    componentInfo.classList.add('hidden');
  }

  // SOURCE section - always show to indicate whether source detection is working
  // Three states: available (file:line), missing (framework but no source), no-framework (hint)
  sourceInfo.classList.remove('hidden');
  sourceAvailable.classList.add('hidden');
  sourceUnavailable.classList.add('hidden');
  sourceNoFramework.classList.add('hidden');

  if (element.framework && element.framework.components.length > 0) {
    const firstComponent = element.framework.components[0];
    if (firstComponent?.source) {
      // Source available - show file:line
      sourceStatus.textContent = 'Available';
      sourceStatus.className = 'source-status available';
      sourceAvailable.classList.remove('hidden');
      sourceLocation.textContent = `${firstComponent.source.fileName}:${firstComponent.source.lineNumber}`;
    } else {
      // Framework detected but source NOT available - show warning with fix button
      sourceStatus.textContent = 'Missing';
      sourceStatus.className = 'source-status unavailable';
      sourceUnavailable.classList.remove('hidden');
    }
  } else {
    // No framework detected - show hint to select a component
    sourceStatus.textContent = '';
    sourceStatus.className = 'source-status';
    sourceNoFramework.classList.remove('hidden');
  }

  // HIERARCHY section - clickable parent chain
  if (element.parentChain && element.parentChain.length > 0) {
    hierarchyInfo.classList.remove('hidden');
    hierarchyList.textContent = '';

    // Show as breadcrumb: "This element" → parent → grandparent...
    const breadcrumb = document.createElement('div');
    breadcrumb.className = 'hierarchy-breadcrumb';

    // Current element (first item, not clickable)
    const currentItem = document.createElement('span');
    currentItem.className = 'hierarchy-item current';
    currentItem.textContent = element.description || element.tagName;
    breadcrumb.appendChild(currentItem);

    // Add parent chain items (clickable to highlight)
    for (const parent of element.parentChain) {
      const separator = document.createElement('span');
      separator.className = 'hierarchy-separator';
      separator.textContent = ' → ';
      breadcrumb.appendChild(separator);

      const parentItem = document.createElement('span');
      parentItem.className = 'hierarchy-item clickable';
      parentItem.textContent = parent.description;
      parentItem.title = `Click to highlight: ${parent.selector}`;
      parentItem.dataset.selector = parent.selector;
      parentItem.addEventListener('click', () => {
        // Highlight this parent element in the browser
        window.claudeLens?.browser.highlight(parent.selector);
      });
      breadcrumb.appendChild(parentItem);
    }

    hierarchyList.appendChild(breadcrumb);
  } else {
    hierarchyInfo.classList.add('hidden');
  }

  // PATH section
  elementPath.textContent = element.selector;

  // ATTRIBUTES section
  if (element.attributes && Object.keys(element.attributes).length > 0) {
    attributesInfo.classList.remove('hidden');
    attributesList.textContent = '';
    for (const [name, value] of Object.entries(element.attributes)) {
      const row = document.createElement('div');
      row.className = 'attribute-row';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'attribute-name';
      nameSpan.textContent = name;

      const valueSpan = document.createElement('span');
      valueSpan.className = 'attribute-value';
      valueSpan.textContent = `"${value}"`;

      row.appendChild(nameSpan);
      row.appendChild(valueSpan);
      attributesList.appendChild(row);
    }
  } else {
    attributesInfo.classList.add('hidden');
  }

  // STYLES section
  if (element.styles && Object.keys(element.styles).length > 0) {
    stylesInfo.classList.remove('hidden');
    stylesList.textContent = '';
    const styles = element.styles;
    for (const name of Object.keys(styles)) {
      const value = styles[name];
      if (!value) continue;

      const row = document.createElement('div');
      row.className = 'style-row';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'style-name';
      nameSpan.textContent = name;

      const valueSpan = document.createElement('span');
      valueSpan.className = 'style-value';

      // Add color swatch for color values
      if (name.toLowerCase().includes('color') && value.match(/^(#|rgb|hsl)/)) {
        const swatch = document.createElement('span');
        swatch.className = 'color-swatch';
        swatch.style.backgroundColor = value;
        valueSpan.appendChild(swatch);
      }

      const textNode = document.createTextNode(value);
      valueSpan.appendChild(textNode);

      row.appendChild(nameSpan);
      row.appendChild(valueSpan);
      stylesList.appendChild(row);
    }
  } else {
    stylesInfo.classList.add('hidden');
  }

  // POSITION section
  if (element.position) {
    positionInfo.classList.remove('hidden');
    positionData.textContent = '';

    const grid = document.createElement('div');
    grid.className = 'position-grid';

    const items = [
      { label: 'X', value: `${Math.round(element.position.x)}px` },
      { label: 'Y', value: `${Math.round(element.position.y)}px` },
      { label: 'Width', value: `${Math.round(element.position.width)}px` },
      { label: 'Height', value: `${Math.round(element.position.height)}px` },
    ];

    for (const item of items) {
      const div = document.createElement('div');
      div.className = 'position-item';

      const labelSpan = document.createElement('span');
      labelSpan.className = 'position-label';
      labelSpan.textContent = item.label;

      const valueSpan = document.createElement('span');
      valueSpan.className = 'position-value';
      valueSpan.textContent = item.value;

      div.appendChild(labelSpan);
      div.appendChild(valueSpan);
      grid.appendChild(div);
    }

    positionData.appendChild(grid);
  } else {
    positionInfo.classList.add('hidden');
  }

  // TEXT section
  if (element.text && element.text.trim()) {
    textInfo.classList.remove('hidden');
    innerText.textContent = element.text.slice(0, 200) + (element.text.length > 200 ? '...' : '');
  } else {
    textInfo.classList.add('hidden');
  }

  // FORM STATE section (Phase 3) - via callback to avoid circular dependency
  if (updateFormStateCallback) {
    updateFormStateCallback(element);
  }

  // Phase 4 sections (overlay, stacking, scroll, iframe, shadow DOM) - via callback
  if (updatePhase4Callback) {
    updatePhase4Callback(element);
  }
}

/**
 * Update element chips display
 */
export function updateElementChips(): void {
  elementChips.textContent = '';

  for (const element of state.selectedElements) {
    const chip = document.createElement('div');
    chip.className = 'element-chip';

    const icon = document.createElement('span');
    icon.className = 'chip-icon';
    icon.textContent = '◇';

    const text = document.createElement('span');
    const displayName = `<${element.tagName}${element.id ? '#' + element.id : ''}>`;
    text.textContent = displayName;

    const close = document.createElement('span');
    close.className = 'chip-close';
    close.textContent = '×';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      removeElement(element.selector);
    });

    chip.appendChild(icon);
    chip.appendChild(text);
    chip.appendChild(close);

    chip.addEventListener('click', () => {
      updateContextPanel(element);
      window.claudeLens.browser.highlight(element.selector);
    });

    elementChips.appendChild(chip);
  }
}

/**
 * Remove element from selection
 */
export function removeElement(selector: string): void {
  stateRemoveSelectedElement(selector);
  updateElementChips();

  if (state.selectedElements.length === 0) {
    resetContextPanelUI();
  } else {
    // Show the last selected element
    const lastElement = state.selectedElements[state.selectedElements.length - 1];
    if (lastElement) {
      updateContextPanel(lastElement);
    }
  }
}

/**
 * Reset context panel to empty state (no element selected)
 */
export function resetContextPanelUI(): void {
  contextEmpty.classList.remove('hidden');
  elementInfo.classList.add('hidden');
  componentInfo.classList.add('hidden');
  sourceInfo.classList.add('hidden');
  pathInfo.classList.add('hidden');
  attributesInfo.classList.add('hidden');
  stylesInfo.classList.add('hidden');
  positionInfo.classList.add('hidden');
  textInfo.classList.add('hidden');
  descriptionInfo.classList.add('hidden');
  hierarchyInfo.classList.add('hidden');
}
