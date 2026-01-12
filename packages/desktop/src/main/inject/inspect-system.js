/**
 * Claude Lens Inspect System
 *
 * Injected into the browser page to provide element inspection.
 * Supports both Ctrl+hover and button toggle modes.
 *
 * This is a self-executing function that sets up:
 * - Tooltip showing element selector
 * - Highlight overlay on hover
 * - Click capture to send element info to Electron
 */
(function() {
  // Remove existing tracking if any
  if (window.__claudeLensCleanup) {
    window.__claudeLensCleanup();
  }

  // State
  window.__claudeLensInspectMode = false; // Button toggle state

  // Create tooltip element
  let tooltip = document.getElementById('claude-lens-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'claude-lens-tooltip';
    tooltip.style.cssText = 'position:fixed;padding:4px 8px;background:#1e1e1e;color:#3794ff;font-family:monospace;font-size:12px;border-radius:4px;pointer-events:none;z-index:999999;display:none;box-shadow:0 2px 8px rgba(0,0,0,0.3);border:1px solid #3c3c3c;white-space:nowrap;';
    document.body.appendChild(tooltip);
  }

  // Create highlight element
  let highlight = document.getElementById('claude-lens-hover-highlight');
  if (!highlight) {
    highlight = document.createElement('div');
    highlight.id = 'claude-lens-hover-highlight';
    highlight.style.cssText = 'position:fixed;pointer-events:none;z-index:999998;border:2px solid #3794ff;background:rgba(55,148,255,0.1);display:none;';
    document.body.appendChild(highlight);
  }

  // Build selector string for display
  function getSelectorDisplay(element) {
    let selector = element.tagName.toLowerCase();
    if (element.id) selector += '#' + element.id;
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.trim().split(/\s+/).filter(c => c && !c.startsWith('claude-lens'));
      if (classes.length) selector += '.' + classes.slice(0, 3).join('.');
      if (classes.length > 3) selector += '...';
    }
    return selector;
  }

  function getFullSelector(element) {
    function getSelector(el) {
      if (el.id) return '#' + el.id;
      let selector = el.tagName.toLowerCase();
      if (el.className && typeof el.className === 'string') {
        const classes = el.className.trim().split(/\s+/).filter(c => c && !c.startsWith('claude-lens'));
        if (classes.length) selector += '.' + classes.join('.');
      }
      const parent = el.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(el) + 1;
          selector += ':nth-child(' + index + ')';
        }
      }
      return selector;
    }
    const parts = [];
    let current = element;
    while (current && current !== document.body) {
      parts.unshift(getSelector(current));
      if (current.id) break;
      current = current.parentElement;
    }
    return parts.join(' > ');
  }

  let currentElement = null;
  let ctrlPressed = false;

  // Expose for blur handler to reset
  window.__claudeLensResetCtrl = true;
  Object.defineProperty(window, '__claudeLensCtrlPressed', {
    get: () => ctrlPressed,
    set: (v) => { ctrlPressed = v; },
    configurable: true
  });

  // Track Ctrl key state
  function handleKeyDown(e) {
    if (e.key === 'Control' && !ctrlPressed) {
      ctrlPressed = true;
      document.body.style.cursor = 'crosshair';
    }
  }

  function handleKeyUp(e) {
    if (e.key === 'Control') {
      ctrlPressed = false;
      if (!window.__claudeLensInspectMode) {
        document.body.style.cursor = '';
        tooltip.style.display = 'none';
        highlight.style.display = 'none';
      }
    }
  }

  // Should we show inspect UI?
  function isInspectActive() {
    return ctrlPressed || window.__claudeLensInspectMode;
  }

  function handleMouseMove(e) {
    if (!isInspectActive()) {
      tooltip.style.display = 'none';
      highlight.style.display = 'none';
      return;
    }

    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === tooltip || el === highlight || el.id?.startsWith('claude-lens')) {
      return;
    }

    if (el !== currentElement) {
      currentElement = el;
      window.__claudeLensLastElement = el;

      // Update tooltip
      const selectorText = getSelectorDisplay(el);
      tooltip.textContent = '<' + selectorText + '>';
      tooltip.style.display = 'block';

      // Position tooltip near cursor
      const tooltipRect = tooltip.getBoundingClientRect();
      let left = e.clientX + 15;
      let top = e.clientY + 15;
      if (left + tooltipRect.width > window.innerWidth) {
        left = e.clientX - tooltipRect.width - 10;
      }
      if (top + tooltipRect.height > window.innerHeight) {
        top = e.clientY - tooltipRect.height - 10;
      }
      tooltip.style.left = left + 'px';
      tooltip.style.top = top + 'px';

      // Update highlight
      const rect = el.getBoundingClientRect();
      highlight.style.left = rect.left + 'px';
      highlight.style.top = rect.top + 'px';
      highlight.style.width = rect.width + 'px';
      highlight.style.height = rect.height + 'px';
      highlight.style.display = 'block';
    }
  }

  function handleMouseLeave() {
    tooltip.style.display = 'none';
    highlight.style.display = 'none';
    currentElement = null;
  }

  function handleClick(e) {
    // Only capture if Ctrl is held OR inspect mode is on
    if (!isInspectActive()) return;

    const el = e.target;
    if (el.id?.startsWith('claude-lens')) return;

    // In inspect mode (button), block the click; with Ctrl, let it through
    if (window.__claudeLensInspectMode) {
      e.preventDefault();
      e.stopPropagation();
    }
    // With Ctrl only, we still capture but DON'T block - allows dropdowns to open

    // Get element info
    const attributes = {};
    for (const attr of el.attributes) {
      if (attr.name !== 'class' && attr.name !== 'id') {
        attributes[attr.name] = attr.value;
      }
    }

    const computed = window.getComputedStyle(el);
    const styles = {
      color: computed.color,
      backgroundColor: computed.backgroundColor,
      fontSize: computed.fontSize,
      fontFamily: computed.fontFamily,
      display: computed.display,
      position: computed.position,
    };

    const rect = el.getBoundingClientRect();

    const elementInfo = {
      tagName: el.tagName.toLowerCase(),
      id: el.id || undefined,
      classes: el.className && typeof el.className === 'string'
        ? el.className.trim().split(/\s+/).filter(c => c && !c.startsWith('claude-lens'))
        : [],
      selector: getFullSelector(el),
      text: el.textContent?.slice(0, 100) || '',
      attributes: attributes,
      styles: styles,
      position: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      interactionResult: 'Element captured',
    };

    // Show capture highlight (orange)
    const captureHighlight = document.createElement('div');
    captureHighlight.className = 'claude-lens-capture-highlight';
    captureHighlight.style.cssText = 'position:fixed;left:'+rect.left+'px;top:'+rect.top+'px;width:'+rect.width+'px;height:'+rect.height+'px;border:2px solid #f59e0b;background:rgba(245,158,11,0.15);pointer-events:none;z-index:999999;transition:opacity 0.5s;';
    document.body.appendChild(captureHighlight);
    setTimeout(() => { captureHighlight.style.opacity = '0'; }, 1500);
    setTimeout(() => { captureHighlight.remove(); }, 2000);

    // Send to Electron
    console.log('CLAUDE_LENS_ELEMENT:' + JSON.stringify(elementInfo));
  }

  document.addEventListener('keydown', handleKeyDown, true);
  document.addEventListener('keyup', handleKeyUp, true);
  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('mouseleave', handleMouseLeave);
  document.addEventListener('click', handleClick, true);

  // Cleanup function
  window.__claudeLensCleanup = function() {
    document.removeEventListener('keydown', handleKeyDown, true);
    document.removeEventListener('keyup', handleKeyUp, true);
    document.removeEventListener('mousemove', handleMouseMove, true);
    document.removeEventListener('mouseleave', handleMouseLeave);
    document.removeEventListener('click', handleClick, true);
    tooltip?.remove();
    highlight?.remove();
    document.body.style.cursor = '';
  };
})()
