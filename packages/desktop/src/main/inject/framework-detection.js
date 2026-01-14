/**
 * Framework Detection Helpers
 *
 * Shared utilities for detecting React/Vue components in the DOM.
 * Injected into BrowserView and used by multiple handlers.
 */

/**
 * Detect React component info - walks up DOM tree to find fiber
 * @param {Element} element - DOM element to inspect
 * @returns {Object|null} - { framework: 'React', components: [...] } or null
 */
function getReactInfo(element) {
  // Walk up DOM tree to find element with React fiber (max 10 levels)
  let domNode = element;
  let fiber = null;
  let domDepth = 0;
  const maxDomDepth = 10;

  while (domNode && domDepth < maxDomDepth) {
    const fiberKey = Object.keys(domNode).find(key =>
      key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')
    );
    if (fiberKey && domNode[fiberKey]) {
      fiber = domNode[fiberKey];
      break;
    }
    domNode = domNode.parentElement;
    domDepth++;
  }

  if (!fiber) return null;

  // Walk up fiber tree to find component (function/class, not host elements)
  let current = fiber;
  const components = [];
  let depth = 0;
  const maxDepth = 20; // Prevent infinite loops

  while (current && depth < maxDepth) {
    depth++;
    const type = current.type;

    if (type && typeof type === 'function') {
      const name = type.displayName || type.name || 'Anonymous';
      // Skip internal React components
      if (!name.startsWith('_') && name !== 'Anonymous') {
        const componentInfo = { name };

        // Try to get source location from _debugSource (dev mode only)
        if (current._debugSource) {
          componentInfo.source = {
            fileName: current._debugSource.fileName,
            lineNumber: current._debugSource.lineNumber,
          };
        }

        // Get props (limited, avoid circular refs)
        if (current.memoizedProps) {
          const props = {};
          const propKeys = Object.keys(current.memoizedProps).slice(0, 10);
          for (const key of propKeys) {
            const val = current.memoizedProps[key];
            if (val !== null && typeof val !== 'function' && typeof val !== 'object') {
              props[key] = val;
            } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
              props[key] = '{...}';
            } else if (Array.isArray(val)) {
              props[key] = '[...]';
            } else if (typeof val === 'function') {
              props[key] = 'fn()';
            }
          }
          if (Object.keys(props).length > 0) {
            componentInfo.props = props;
          }
        }

        components.push(componentInfo);
        if (components.length >= 3) break; // Get up to 3 parent components
      }
    }
    current = current.return;
  }

  return components.length > 0 ? { components, framework: 'React' } : null;
}

/**
 * Detect Vue component info
 * @param {Element} element - DOM element to inspect
 * @returns {Object|null} - { framework: 'Vue', components: [...] } or null
 */
function getVueInfo(element) {
  const vueKey = Object.keys(element).find(key => key.startsWith('__vue'));
  if (!vueKey) return null;

  const vue = element[vueKey];
  if (!vue) return null;

  const name = vue.$options?.name || vue.$.type?.name || 'VueComponent';
  return {
    framework: 'Vue',
    components: [{ name }]
  };
}

/**
 * Get framework info for an element (React or Vue)
 * @param {Element} element - DOM element to inspect
 * @returns {Object|null} - Framework info or null
 */
function getFrameworkInfo(element) {
  const reactInfo = getReactInfo(element);
  if (reactInfo) return reactInfo;
  return getVueInfo(element);
}

// Export for use in injected scripts
if (typeof window !== 'undefined') {
  window.__claudeLensFrameworkDetection = {
    getReactInfo,
    getVueInfo,
    getFrameworkInfo,
  };
}
