/**
 * Element Inspection Helpers
 *
 * Browser-side helpers for inspecting DOM elements.
 * These run in the browser context via page.evaluate().
 *
 * Used by both inspectElement and inspectElementAtPoint.
 *
 * EXPORTS (used by edge-case-helpers.js):
 * - describeElement(el) - Human-readable element description
 * - buildSelector(el) - Build CSS selector for element
 */

// Check if element is in a loading state
function isLoadingState(element) {
  const classes = Array.from(element.classList);
  const loadingClasses = ['loading', 'spinner', 'skeleton', 'shimmer', 'pulse', 'loader'];
  const hasLoadingClass = classes.some(c =>
    loadingClasses.some(lc => c.toLowerCase().includes(lc))
  );
  const ariaBusy = element.getAttribute('aria-busy') === 'true';
  const hasSpinnerChild = !!element.querySelector('.spinner, .loading, .loader, [aria-busy="true"]');
  return hasLoadingClass || ariaBusy || hasSpinnerChild;
}

// Get form field state
function getFormState(element) {
  const tag = element.tagName.toLowerCase();
  if (!['input', 'select', 'textarea'].includes(tag)) return null;

  const formState = {
    type: element.type || tag,
    value: element.value || '',
    placeholder: element.placeholder || undefined,
    required: element.required || false,
    disabled: element.disabled || false,
    readOnly: element.readOnly || false,
    validationState: null,
    validationMessage: undefined,
  };

  if (element.validity) {
    if (element.validity.valid) {
      formState.validationState = 'valid';
    } else if (element.validationMessage) {
      formState.validationState = 'invalid';
      formState.validationMessage = element.validationMessage;
    }
  }

  if (element.type === 'checkbox' || element.type === 'radio') {
    formState.checked = element.checked;
  }

  if (tag === 'select') {
    formState.selectedIndex = element.selectedIndex;
    formState.options = Array.from(element.options).slice(0, 10).map(o => o.text);
  }

  return formState;
}

// Semantic element descriptions mapping
const semanticMap = {
  'nav': 'Navigation', 'header': 'Header', 'footer': 'Footer',
  'main': 'Main content', 'aside': 'Sidebar', 'article': 'Article',
  'section': 'Section', 'form': 'Form', 'button': 'Button', 'a': 'Link',
  'ul': 'List', 'ol': 'Numbered list', 'table': 'Table',
  'thead': 'Table header', 'tbody': 'Table body', 'tr': 'Table row',
  'td': 'Table cell', 'th': 'Header cell', 'input': 'Input field',
  'select': 'Dropdown', 'textarea': 'Text area', 'dialog': 'Dialog',
  'menu': 'Menu', 'img': 'Image', 'video': 'Video', 'audio': 'Audio',
};

// Role-based descriptions mapping
const roleMap = {
  'navigation': 'Navigation', 'banner': 'Header banner',
  'contentinfo': 'Footer info', 'main': 'Main content',
  'complementary': 'Sidebar', 'dialog': 'Dialog',
  'alertdialog': 'Alert dialog', 'menu': 'Menu', 'menubar': 'Menu bar',
  'menuitem': 'Menu item', 'tab': 'Tab', 'tabpanel': 'Tab panel',
  'tablist': 'Tab list', 'listbox': 'Dropdown list', 'option': 'Option',
  'grid': 'Grid', 'row': 'Row', 'cell': 'Cell', 'button': 'Button',
  'link': 'Link', 'search': 'Search', 'form': 'Form',
};

// Generate human-readable description for an element
function describeElement(element) {
  const tag = element.tagName.toLowerCase();
  const loading = isLoadingState(element);
  const role = element.getAttribute('role');
  const ariaLabel = element.getAttribute('aria-label');
  const dataTestId = element.getAttribute('data-testid');

  let label = '';
  if (ariaLabel) {
    label = ariaLabel;
  } else if (element.textContent && element.textContent.trim().length < 30) {
    label = element.textContent.trim().split('\n')[0];
  }

  let description = '';
  if (role && roleMap[role]) {
    description = roleMap[role];
  } else if (semanticMap[tag]) {
    description = semanticMap[tag];
  } else if (tag === 'div' || tag === 'span') {
    const classes = Array.from(element.classList);
    const inferredRole = classes.find(c =>
      /nav|header|footer|sidebar|modal|dropdown|menu|card|panel|container|wrapper|content|body/i.test(c)
    );
    if (inferredRole) {
      description = inferredRole.replace(/[-_]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
      description = description.charAt(0).toUpperCase() + description.slice(1).toLowerCase();
    } else {
      description = 'Container';
    }
  } else {
    description = tag;
  }

  if (label && label !== description) {
    description = description + ': "' + label.substring(0, 25) + (label.length > 25 ? '...' : '') + '"';
  } else if (element.id) {
    description = description + ' (#' + element.id + ')';
  } else if (dataTestId) {
    description = description + ' [' + dataTestId + ']';
  }

  if (loading) {
    description = 'Loading: ' + description;
  }

  return description;
}

// Build unique selector for an element
function buildSelector(element) {
  if (element.id) return '#' + element.id;

  let selector = element.tagName.toLowerCase();
  if (element.classList.length > 0) {
    selector += '.' + Array.from(element.classList).slice(0, 2).join('.');
  }

  const parent = element.parentElement;
  if (parent) {
    const siblings = Array.from(parent.children).filter(s => s.tagName === element.tagName);
    if (siblings.length > 1) {
      const index = siblings.indexOf(element) + 1;
      selector += ':nth-of-type(' + index + ')';
    }
  }

  return selector;
}

// Build parent chain (up to 6 levels)
function buildParentChain(element, maxDepth = 6) {
  const chain = [];
  let current = element.parentElement;
  let depth = 0;

  while (current && current !== document.body && depth < maxDepth) {
    chain.push({
      tagName: current.tagName.toLowerCase(),
      selector: buildSelector(current),
      description: describeElement(current),
    });
    current = current.parentElement;
    depth++;
  }

  return chain;
}

// Get computed styles object
function getComputedStylesObject(element) {
  const styles = window.getComputedStyle(element);
  return {
    display: styles.display,
    position: styles.position,
    width: styles.width,
    height: styles.height,
    margin: styles.margin,
    padding: styles.padding,
    color: styles.color,
    backgroundColor: styles.backgroundColor,
    fontSize: styles.fontSize,
    fontFamily: styles.fontFamily,
  };
}

// Build base element info object
function buildBaseElementInfo(el, selectorOverride) {
  const rect = el.getBoundingClientRect();
  const parent = el.parentElement;
  const siblingCount = parent ? parent.children.length - 1 : 0;

  return {
    tagName: el.tagName.toLowerCase(),
    id: el.id || undefined,
    classes: Array.from(el.classList),
    selector: selectorOverride || buildSelector(el),
    xpath: '',
    attributes: Object.fromEntries(Array.from(el.attributes).map(a => [a.name, a.value])),
    computedStyles: getComputedStylesObject(el),
    boundingBox: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
    parentChain: buildParentChain(el),
    siblingCount: siblingCount,
    childCount: el.childElementCount,
    description: describeElement(el),
    formState: getFormState(el),
    isLoading: isLoadingState(el),
  };
}
