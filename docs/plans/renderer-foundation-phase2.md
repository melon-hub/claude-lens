# Renderer Foundation Phase 2: Rock-Solid Base

> Complete the modular foundation to enable faster, bigger updates

**Branch:** `refactor/renderer-foundation-phase2`
**Prerequisites:** PR `claude/refactor-renderer-CfwWN` merged to main
**Goal:** main.ts < 500 lines, all state centralized, event handlers modularized

---

## 📊 Current Progress (Updated 2026-01-13)

| Phase | Status | Notes |
|-------|--------|-------|
| 2.1 State Migration | ✅ DONE | All state via `state.*` and `updateState()` |
| 2.2 DOM Setup Module | ✅ DONE | Elements in `setup/` module |
| 2.3 Event Handler Extraction | ✅ DONE | `ui-helpers.ts`, `browser-helpers.ts` created |
| 2.4 Terminal Module | ✅ DONE | `terminal/manager.ts`, `terminal/context-menu.ts` |
| 2.5 Panel Module | ✅ DONE | `panels/project-modal.ts`, `panels/resizers.ts`, `panels/console-drawer.ts`, `panels/context-panel.ts` |
| 2.6 Integration & Cleanup | 🔄 IN PROGRESS | Target: < 500 lines |

**Line count:** 2,237 → 1,297 (42% reduction)
**Remaining:** ~800 lines to extract (UI update functions, event handlers)

### Modules Created
```
packages/desktop/src/renderer/
├── browser-helpers.ts      # updateBrowserBounds, setBrowserLoaded
├── ui-helpers.ts           # setStatus, showThinking, hideThinking, updateStatusBar
├── panels/
│   ├── project-modal.ts    # Project detection dialog
│   ├── resizers.ts         # Panel resize with localStorage
│   ├── console-drawer.ts   # Console message display
│   └── context-panel.ts    # Element selection & details UI
└── terminal/
    ├── manager.ts          # Terminal instance, fit/refresh helpers
    └── context-menu.ts     # Right-click copy/paste menu
```

---

## Why This Matters

Current state:
- main.ts: **2237 lines** - too large to modify safely
- State: Mixed (state module exists but local `let` vars still in main.ts)
- Events: All `addEventListener` calls inline in main.ts
- Testing: Utilities tested, but main.ts logic untestable

Target state:
- main.ts: **< 500 lines** - initialization and wiring only
- State: **Single source of truth** - all state in state module
- Events: **Modular handlers** - each feature in its own module
- Testing: **> 80% coverage** - all extracted modules testable

---

## Phase Order (Risk-First)

Each phase is designed to be:
1. **Independently testable** - can verify before moving on
2. **Safely revertable** - if issues found, easy to roll back
3. **Incrementally valuable** - each phase improves the codebase

| Phase | Focus | Risk | Impact |
|-------|-------|------|--------|
| 2.1 | State Migration | LOW | HIGH - enables reactive patterns |
| 2.2 | DOM Setup Module | LOW | MEDIUM - cleaner initialization |
| 2.3 | Event Handler Extraction | MEDIUM | HIGH - biggest main.ts reduction |
| 2.4 | Terminal Module Completion | LOW | MEDIUM - self-contained |
| 2.5 | Panel Module Completion | MEDIUM | HIGH - complex UI logic |
| 2.6 | Integration & Cleanup | LOW | HIGH - final polish |

---

## Phase 2.1: State Migration

**Goal:** Remove all local `let` variables from main.ts, use state module exclusively

**Why First:** State is the foundation. Without centralized state, other modules can't be properly decoupled.

### Tasks
- [ ] Identify all local state variables in main.ts (lines 159-174)
- [ ] For each variable, replace reads with `state.propertyName`
- [ ] For each variable, replace writes with `updateState({ propertyName: value })`
- [ ] Remove local `let` declarations
- [ ] Add state subscriptions where UI needs to react to changes

### Variables to Migrate
```typescript
// main.ts:159-174 - REMOVE THESE
let selectedElements: ElementInfo[] = [];        // → state.selectedElements
let inspectSequence: CapturedInteraction[] = []; // → state.inspectSequence
let capturedToasts: ToastCapture[] = [];         // → state.capturedToasts
let claudeRunning = false;                       // → state.claudeRunning
let browserLoaded = false;                       // → state.browserLoaded
let inspectMode = false;                         // → state.inspectMode
let consoleDrawerOpen = false;                   // → state.consoleDrawerOpen
let contextMode: ContextMode = 'lean';           // → state.contextMode
let hoverFrozen = false;                         // → state.hoverFrozen
let isThinking = false;                          // → state.isThinking
let thinkingTimeout = null;                      // → state.thinkingTimeout
let viewportWidth = 0;                           // → state.viewportWidth
let currentProjectName = '';                     // → state.currentProjectName
let currentServerPort = 0;                       // → state.currentServerPort
let currentServerType = null;                    // → state.currentServerType
let playwrightConnected = false;                 // → state.playwrightConnected
```

### Checkpoint 2.1
```bash
# ALL must pass before proceeding
pnpm run build              # TypeScript compiles
pnpm run lint               # No lint errors
pnpm run test               # All 87+ tests pass
grep -c "^let " packages/desktop/src/renderer/main.ts  # Should be 0 state vars
```
- [ ] No local `let` state variables in main.ts
- [ ] App launches and works identically
- [ ] Console shows no errors
- [ ] All features work (use manual test checklist)

### Rollback Plan
If issues: `git checkout main -- packages/desktop/src/renderer/main.ts`

---

## Phase 2.2: DOM Setup Module

**Goal:** Extract DOM element initialization to `setup/dom-elements.ts`

**Why:** 50+ `getEl()` calls at top of main.ts add noise and prevent testing

### Tasks
- [ ] Create `packages/desktop/src/renderer/setup/dom-elements.ts`
- [ ] Move all `getEl()` calls to new module
- [ ] Export typed element references
- [ ] Update main.ts to import elements
- [ ] Add tests for element existence

### Structure
```typescript
// setup/dom-elements.ts
import { getEl } from '../utils';

// Header elements
export const urlInput = getEl<HTMLInputElement>('urlInput');
export const goBtn = getEl<HTMLButtonElement>('goBtn');
// ... etc

// Panels
export const placeholder = getEl<HTMLDivElement>('placeholder');
// ... etc

// Validate all elements exist
export function validateDomElements(): void {
  const required = [urlInput, goBtn, /* ... */];
  for (const el of required) {
    if (!el) throw new Error('Missing required DOM element');
  }
}
```

### Checkpoint 2.2
```bash
pnpm run build
pnpm run lint
pnpm run test
grep -c "getEl<" packages/desktop/src/renderer/main.ts  # Should be 0
```
- [ ] No `getEl()` calls in main.ts
- [ ] All elements imported from setup module
- [ ] App launches without "Missing element" errors

### Rollback Plan
If issues: `git checkout main -- packages/desktop/src/renderer/main.ts`

---

## Phase 2.3: Event Handler Extraction

**Goal:** Extract event handlers to dedicated modules

**Why:** This is where most of main.ts complexity lives. Extracting enables testing.

### Tasks
- [ ] Create `handlers/browser-events.ts` (navigation, refresh, viewport)
- [ ] Create `handlers/terminal-events.ts` (PTY, keyboard, context menu)
- [ ] Create `handlers/inspect-events.ts` (element inspection, freeze)
- [ ] Create `handlers/claude-events.ts` (send to Claude, thinking indicator)
- [ ] Create `handlers/panel-events.ts` (resizers, drawer toggle)
- [ ] Create `setup/event-wiring.ts` (wire all handlers to elements)
- [ ] Update main.ts to call setup functions

### Structure
```typescript
// handlers/browser-events.ts
import { elements } from '../setup/dom-elements';
import { state, updateState } from '../state';
import { VIEWPORT_PRESETS } from './navigation';

export function handleGoClick(): void {
  const url = elements.urlInput.value;
  // ... navigation logic
}

export function handleViewportChange(preset: string): void {
  updateState({ viewportWidth: VIEWPORT_PRESETS[preset] || 0 });
  // ... update browser bounds
}
```

```typescript
// setup/event-wiring.ts
import { elements } from './dom-elements';
import * as browserEvents from '../handlers/browser-events';
import * as terminalEvents from '../handlers/terminal-events';
// ... etc

export function wireAllEvents(): void {
  // Browser
  elements.goBtn.addEventListener('click', browserEvents.handleGoClick);
  elements.viewportSelect.addEventListener('change', () =>
    browserEvents.handleViewportChange(elements.viewportSelect.value)
  );
  // ... etc
}
```

### Checkpoint 2.3
```bash
pnpm run build
pnpm run lint
pnpm run test
grep -c "addEventListener" packages/desktop/src/renderer/main.ts  # Should be < 5
wc -l packages/desktop/src/renderer/main.ts  # Target: < 800 lines
```
- [ ] Most `addEventListener` calls moved to event-wiring.ts
- [ ] main.ts under 800 lines
- [ ] All event handlers testable (pure functions where possible)
- [ ] App works identically

### Rollback Plan
If issues: `git stash && git checkout main`

---

## Phase 2.4: Terminal Module Completion

**Goal:** Complete terminal module extraction

**Why:** Terminal is self-contained, lower risk than panels

### Tasks
- [ ] Create `terminal/setup.ts` (terminal creation, addon loading)
- [ ] Create `terminal/handlers.ts` (PTY data, key handlers)
- [ ] Create `terminal/context-menu.ts` (right-click menu)
- [ ] Move terminal initialization from main.ts
- [ ] Add tests for terminal handlers

### Checkpoint 2.4
```bash
pnpm run build
pnpm run lint
pnpm run test
```
- [ ] Terminal module is self-contained
- [ ] Terminal works: input, output, copy/paste, context menu
- [ ] Claude Code starts correctly
- [ ] Terminal resizes properly

---

## Phase 2.5: Panel Module Completion

**Goal:** Complete panel module extraction

**Why:** Panels have complex UI logic that benefits from isolation

### Tasks
- [ ] Create `panels/browser.ts` (updateBrowserBounds, setBrowserLoaded)
- [ ] Create `panels/context.ts` (element selection display)
- [ ] Create `panels/console.ts` (console drawer rendering)
- [ ] Create `panels/project-modal.ts` (project detection dialog)
- [ ] Create `components/panel-resizers.ts` (resize handling)
- [ ] Add tests for panel logic

### Checkpoint 2.5
```bash
pnpm run build
pnpm run lint
pnpm run test
```
- [ ] Each panel in its own module
- [ ] Browser panel: navigation, viewport, inspection all work
- [ ] Context panel: element selection, chips, send to Claude
- [ ] Console drawer: messages, filtering, clear
- [ ] Project modal: detect, start server, cancel

---

## Phase 2.6: Integration & Final Cleanup

**Goal:** main.ts < 500 lines, clean architecture

### Tasks
- [ ] Review main.ts - only initialization and module wiring
- [ ] Remove any remaining inline logic
- [ ] Add integration tests
- [ ] Update ARCHITECTURE.md
- [ ] Final manual test pass

### Checkpoint 2.6 (FINAL)
```bash
pnpm run build
pnpm run lint
pnpm run test
wc -l packages/desktop/src/renderer/main.ts  # MUST be < 500
```
- [ ] main.ts < 500 lines
- [ ] All modules under 300 lines
- [ ] Test coverage > 80%
- [ ] Full manual test checklist passes
- [ ] No console errors

---

## Success Criteria

| Metric | Current | Target |
|--------|---------|--------|
| main.ts lines | 2237 | < 500 |
| State location | Mixed | 100% in state module |
| Event handlers | Inline | Modular |
| Test coverage | ~60% | > 80% |
| Modules > 300 lines | 1 (main.ts) | 0 |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Regression in features | Manual test checklist after each phase |
| State sync issues | Add state debugging logs during migration |
| Event handler bugs | Test each handler in isolation first |
| Large merge conflicts | Small commits, rebase frequently |

---

## Manual Test Checklist

Run after EVERY phase:

- [ ] App launches without errors
- [ ] Can navigate to localhost URL
- [ ] Ctrl+hover highlights elements
- [ ] Click element shows context panel
- [ ] Send to Claude works
- [ ] Console drawer opens/closes
- [ ] Console messages appear
- [ ] Panel resizing works
- [ ] Viewport presets work (Full, Desktop, Mobile)
- [ ] Inspect mode captures sequence
- [ ] Terminal input/output works
- [ ] Terminal copy/paste works
- [ ] Right-click context menu works
- [ ] Status bar updates correctly
- [ ] Project modal works (File > Open)
- [ ] Dev server starts and hot reload works
- [ ] No console errors in DevTools

---

## Time Estimates

| Phase | Estimated Time | Risk |
|-------|---------------|------|
| 2.1 State Migration | 2-3 hours | LOW |
| 2.2 DOM Setup | 1-2 hours | LOW |
| 2.3 Event Handlers | 4-6 hours | MEDIUM |
| 2.4 Terminal | 2-3 hours | LOW |
| 2.5 Panels | 4-6 hours | MEDIUM |
| 2.6 Integration | 2-3 hours | LOW |
| **Total** | **15-23 hours** | |

---

## Notes

- Each phase should be a separate commit (or small PR)
- Don't skip checkpoints - they catch issues early
- If a phase takes > 2x estimate, stop and reassess
- Keep the app working at all times - no "big bang" refactors

---

## Known Issues (Pre-existing)

| Issue | Location | Description | Priority |
|-------|----------|-------------|----------|
| Terminal garbled during right-resizer drag | `panels/resizers.ts` | Right resizer (context↔terminal) doesn't call `fitAddon.fit()` during drag, only on mouseup. Terminal looks garbled until release. Fix: add `fitAddon.fit()` in the `else` branch of mousemove handler. | LOW |
