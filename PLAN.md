# Claude Lens UX Enhancement Plan

**Branch:** `feature/ux-enhancements`
**Worktree:** `/mnt/c/Users/Hoff/Desktop/Coding/claude-lens-ux-features`
**Last Updated:** 2026-01-09

---

## Overview

This plan implements 13 frontend scenarios for element inspection, making Claude Lens a powerful visual debugging tool. The core principle: **"Send Everything, Let Claude Figure It Out"** - users see human-readable descriptions, Claude gets full technical context.

---

## Phase 1: Core UX (Quick Wins) ✅ COMPLETE

**Commit:** `cd44acc` - "feat(desktop): Phase 1 UX enhancements"

### 1.1 Populate parentChain ✅
**File:** `packages/desktop/src/main/playwright-handler.ts`

- Added `describeElement()` function that generates human-readable descriptions
- Uses ARIA roles, semantic HTML tags, and class name inference
- Examples: "Navigation", "Button: Submit", "Modal (#login-modal)"
- Added `buildParentChain()` to walk up DOM tree (max 6 levels)
- Each parent has: `tagName`, `selector`, `description`

### 1.2 Human-readable descriptions in UI ✅
**Files:** `renderer/index.html`, `renderer/main.ts`, `renderer/styles.css`

- Added "WHAT IS THIS?" section showing element description
- Added "WHERE IS IT?" section with clickable hierarchy breadcrumb
- Clicking a parent in the chain highlights it in the browser
- Updated `ElementInfo` type with `description` and rich `parentChain`

### 1.3 Viewport preset selector ✅
**Files:** `renderer/index.html`, `renderer/main.ts`, `renderer/styles.css`

- Dropdown in browser panel header with presets:
  - Full Width (0 = no constraint)
  - Desktop (1280px)
  - Tablet Landscape (1024px)
  - Tablet (768px)
  - Mobile L (425px)
  - Mobile (375px)
- Created `updateBrowserBounds()` helper for consistent viewport handling
- Viewport constraint persists across resize and console drawer toggle

### 1.4 Ctrl+Click quick capture ✅
**Files:** `packages/desktop/src/main/index.ts`, `renderer/index.html`, `renderer/styles.css`

- Injected `__claudeLensCtrlClickHandler` on page load
- Ctrl+Click (or Cmd+Click on Mac) captures element without Inspect Mode
- Green highlight (#10b981) distinguishes from blue inspect highlight
- Added hint in empty state: "or Ctrl+Click any element for quick capture"

---

## Phase 2: Inspect Mode Enhancement (Dropdown Scenario)

**Goal:** Capture multi-step interactions like clicking a dropdown trigger then selecting an item inside.

### 2.1 Inspect sequence capture
**Files to modify:** `renderer/main.ts`, `renderer/index.html`

**Current behavior:** Inspect Mode captures ONE click then disables itself.

**New behavior:**
- Inspect Mode stays ON until explicitly toggled OFF
- Each click adds to an interaction sequence array
- UI shows numbered list of captured interactions

**Implementation:**
```typescript
// New state in renderer/main.ts
interface CapturedInteraction {
  element: ElementInfo;
  action: 'click';
  result: string; // "Opened dropdown", "Action blocked", etc.
  timestamp: number;
}
let inspectSequence: CapturedInteraction[] = [];
```

**UI changes (index.html):**
```html
<!-- Inside context panel, shown when inspectMode && inspectSequence.length > 0 -->
<div id="inspectSequenceInfo" class="context-section hidden">
  <div class="section-header">
    <span class="section-title">CAPTURED INTERACTIONS</span>
    <span class="sequence-count">0</span>
  </div>
  <div class="section-content" id="inspectSequenceList"></div>
  <div class="sequence-actions">
    <button id="clearSequenceBtn" class="btn btn-small">Clear</button>
    <button id="sendSequenceBtn" class="btn btn-small btn-primary">Send Sequence</button>
  </div>
</div>
```

### 2.2 Block default actions in Inspect Mode
**File to modify:** `packages/desktop/src/main/index.ts`

**Current behavior:** `e.preventDefault()` stops navigation but dropdown still closes after click.

**New behavior:**
- Detect if clicked element would trigger state change (dropdown, modal, etc.)
- Block the action but log what WOULD have happened
- Keep dropdown/modal open for further inspection

**Implementation:**
```javascript
// In the inject script for browser:enableInspect
window.__claudeLensInspectHandler = function(e) {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation(); // Block ALL handlers

  // Detect interaction type
  const el = e.target;
  const role = el.getAttribute('role');
  const isMenuItem = role === 'menuitem' || el.closest('[role="menu"]');
  const isDropdownTrigger = el.hasAttribute('data-toggle') || el.closest('.dropdown-toggle');

  let result = 'Clicked';
  if (isMenuItem) result = 'Menu item selected (blocked)';
  if (isDropdownTrigger) result = 'Dropdown trigger (blocked)';

  // Send with result info
  console.log('CLAUDE_LENS_ELEMENT:' + JSON.stringify({...elementInfo, interactionResult: result}));

  // DON'T remove listener - stay in inspect mode
};
```

### 2.3 "Send All Context" includes full sequence
**File to modify:** `renderer/main.ts` (sendPromptBtn handler)

**Current behavior:** Sends selected elements only.

**New behavior:**
- If inspect sequence exists, include it in Claude context
- Format as numbered interaction steps
- Include what each click captured and what action was blocked

**Context format sent to Claude:**
```yaml
interaction_sequence:
  - step: 1
    element: "Account button"
    selector: ".nav-account-btn"
    result: "Opened dropdown menu"

  - step: 2
    element: "Settings menu item"
    selector: ".dropdown-item:nth-child(2)"
    result: "Action blocked (inspect mode)"

dropdown_context:
  trigger: "Account button"
  visible_items: ["Profile", "Settings", "Logout"]
  selected: "Settings"
```

---

## Phase 3: States & Detection

**Goal:** Automatically detect and display element states that affect behavior.

### 3.1 Form field state detection
**File to modify:** `packages/desktop/src/main/playwright-handler.ts`

**Add to `inspectElement()` return:**
```typescript
formState?: {
  type: 'text' | 'email' | 'password' | 'checkbox' | 'radio' | 'select' | 'textarea';
  value: string;
  placeholder?: string;
  required: boolean;
  disabled: boolean;
  readOnly: boolean;
  validationState: 'valid' | 'invalid' | 'pending' | null;
  validationMessage?: string;
}
```

**Detection logic:**
```javascript
if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) {
  formState = {
    type: el.type || el.tagName.toLowerCase(),
    value: el.value,
    placeholder: el.placeholder,
    required: el.required,
    disabled: el.disabled,
    readOnly: el.readOnly,
    validationState: el.validity?.valid ? 'valid' : (el.validity ? 'invalid' : null),
    validationMessage: el.validationMessage || undefined,
  };
}
```

### 3.2 Loading state detection
**File to modify:** `packages/desktop/src/main/playwright-handler.ts`

**Add to element description logic:**
```javascript
// Detect loading indicators
const isLoading =
  el.classList.contains('loading') ||
  el.classList.contains('spinner') ||
  el.classList.contains('skeleton') ||
  el.getAttribute('aria-busy') === 'true' ||
  el.querySelector('.spinner, .loading, [aria-busy="true"]');

if (isLoading) {
  description = 'Loading: ' + description;
}
```

### 3.3 Freeze hover state
**Files to modify:** `packages/desktop/src/main/index.ts`, `renderer/main.ts`

**Purpose:** Capture hover-triggered elements (tooltips, dropdown menus) before they disappear.

**Implementation:**
- Add "Freeze Hover" button next to Inspect button
- When enabled, inject CSS that forces `:hover` states to persist
- User hovers over element, clicks Freeze, element stays visible

**Inject script:**
```javascript
// Freeze all current hover states
const hoveredElements = document.querySelectorAll(':hover');
hoveredElements.forEach(el => {
  el.classList.add('claude-lens-hover-frozen');
});

// Add CSS rule
const style = document.createElement('style');
style.textContent = `
  .claude-lens-hover-frozen,
  .claude-lens-hover-frozen * {
    pointer-events: none !important;
  }
  /* Force visibility of common hover patterns */
  .claude-lens-hover-frozen .tooltip,
  .claude-lens-hover-frozen .dropdown-menu,
  .claude-lens-hover-frozen [data-show] {
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
  }
`;
document.head.appendChild(style);
```

---

## Phase 4: Edge Cases

**Goal:** Handle complex UI patterns that need special treatment.

### 4.1 Modal/overlay detection
**File to modify:** `packages/desktop/src/main/playwright-handler.ts`

**Add to element info:**
```typescript
overlay?: {
  type: 'modal' | 'dialog' | 'drawer' | 'popover' | 'tooltip';
  isBackdrop: boolean;
  triggeredBy?: string; // Selector of trigger element
  canDismiss: boolean;
}
```

**Detection:**
```javascript
const isOverlay =
  el.getAttribute('role') === 'dialog' ||
  el.classList.contains('modal') ||
  el.classList.contains('drawer') ||
  el.hasAttribute('aria-modal');

const isBackdrop =
  el.classList.contains('backdrop') ||
  el.classList.contains('overlay') ||
  (el.style.position === 'fixed' && el.style.inset === '0px');
```

### 4.2 Z-index stacking display
**File to modify:** `renderer/main.ts`

**Add to context panel:**
- Show z-index of selected element
- Show stacking context (list of overlapping elements at that point)
- Highlight which element is "on top"

**Implementation:**
```javascript
// Get all elements at click point
const elementsAtPoint = document.elementsFromPoint(x, y);
const stackingInfo = elementsAtPoint.slice(0, 5).map(el => ({
  description: describeElement(el),
  zIndex: getComputedStyle(el).zIndex,
  selector: buildSelector(el),
}));
```

### 4.3 Toast notification capture
**File to modify:** `packages/desktop/src/main/index.ts`

**Problem:** Toasts appear briefly and disappear.

**Solution:** MutationObserver that watches for toast additions.

```javascript
// Inject toast watcher
const toastObserver = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType === 1) {
        const el = node;
        const isToast =
          el.classList.contains('toast') ||
          el.getAttribute('role') === 'alert' ||
          el.classList.contains('notification') ||
          el.classList.contains('snackbar');

        if (isToast) {
          console.log('CLAUDE_LENS_TOAST:' + JSON.stringify({
            text: el.textContent,
            type: el.classList.contains('error') ? 'error' :
                  el.classList.contains('success') ? 'success' : 'info',
            timestamp: Date.now(),
          }));
        }
      }
    }
  }
});
toastObserver.observe(document.body, { childList: true, subtree: true });
```

### 4.4 iFrame context
**File to modify:** `packages/desktop/src/main/playwright-handler.ts`

**Problem:** Elements inside iframes need special handling.

**Detection:**
```javascript
// Check if element is in iframe
const isInIframe = el.ownerDocument !== document;
if (isInIframe) {
  elementInfo.iframe = {
    src: el.ownerDocument.defaultView?.frameElement?.src,
    name: el.ownerDocument.defaultView?.frameElement?.name,
    sandboxed: el.ownerDocument.defaultView?.frameElement?.sandbox?.length > 0,
  };
}
```

**Note:** Cross-origin iframes will have limited access. Same-origin iframes can be fully inspected.

### 4.5 Shadow DOM handling
**File to modify:** `packages/desktop/src/main/playwright-handler.ts`

**Problem:** Shadow DOM elements aren't accessible via normal queries.

**Detection and handling:**
```javascript
// Check for shadow root
if (el.shadowRoot) {
  elementInfo.shadowRoot = {
    mode: el.shadowRoot.mode, // 'open' or 'closed'
    childCount: el.shadowRoot.childElementCount,
  };
}

// Check if element is inside shadow DOM
let shadowHost = el;
while (shadowHost) {
  if (shadowHost.getRootNode() instanceof ShadowRoot) {
    elementInfo.insideShadowDOM = true;
    elementInfo.shadowHost = describeElement(shadowHost.getRootNode().host);
    break;
  }
  shadowHost = shadowHost.parentElement;
}
```

### 4.6 Scroll context awareness
**File to modify:** `packages/desktop/src/main/playwright-handler.ts`

**Add scroll info to element:**
```typescript
scroll?: {
  isScrollable: boolean;
  scrollTop: number;
  scrollLeft: number;
  scrollHeight: number;
  scrollWidth: number;
  isInViewport: boolean;
  visiblePercentage: number;
}
```

**Detection:**
```javascript
const rect = el.getBoundingClientRect();
const viewport = {
  width: window.innerWidth,
  height: window.innerHeight,
};

const isInViewport =
  rect.top < viewport.height &&
  rect.bottom > 0 &&
  rect.left < viewport.width &&
  rect.right > 0;

const visibleArea = Math.max(0,
  Math.min(rect.right, viewport.width) - Math.max(rect.left, 0)
) * Math.max(0,
  Math.min(rect.bottom, viewport.height) - Math.max(rect.top, 0)
);
const totalArea = rect.width * rect.height;
const visiblePercentage = totalArea > 0 ? (visibleArea / totalArea) * 100 : 0;
```

---

## File Summary

| File | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|------|---------|---------|---------|---------|
| `playwright-handler.ts` | ✅ | | 3.1, 3.2 | 4.1, 4.4, 4.5, 4.6 |
| `renderer/main.ts` | ✅ | 2.1, 2.3 | 3.3 | 4.2 |
| `renderer/index.html` | ✅ | 2.1 | 3.3 | |
| `renderer/styles.css` | ✅ | 2.1 | 3.3 | |
| `main/index.ts` | ✅ | 2.2 | 3.3 | 4.3 |
| `core/browser/types.ts` | ✅ | | 3.1 | 4.1, 4.4, 4.5, 4.6 |
| `renderer/types.ts` | ✅ | 2.1 | 3.1 | |

---

## How to Resume

```bash
# Navigate to worktree
cd /mnt/c/Users/Hoff/Desktop/Coding/claude-lens-ux-features

# Check current state
git log --oneline -5
git status

# Continue with Phase 2
# Start with item 2.1 - Inspect sequence capture
```

---

## Testing Checklist

### Phase 1 ✅
- [ ] Select element, verify description shows in "WHAT IS THIS?"
- [ ] Verify parent chain is clickable and highlights work
- [ ] Change viewport preset, verify browser resizes
- [ ] Ctrl+Click element, verify green highlight and capture

### Phase 2
- [ ] Enable Inspect Mode, click multiple elements
- [ ] Verify sequence shows in panel
- [ ] Click dropdown trigger, verify it stays open
- [ ] Click item inside, verify action is blocked
- [ ] Send sequence to Claude, verify format

### Phase 3
- [ ] Select invalid form field, verify validation state shows
- [ ] Select loading spinner, verify "Loading:" prefix
- [ ] Freeze hover on tooltip, verify it stays visible

### Phase 4
- [ ] Select modal, verify overlay info
- [ ] Check z-index stacking display
- [ ] Trigger toast, verify it's captured
- [ ] Inspect element in iframe
- [ ] Inspect shadow DOM component
