# Renderer Refactor Plan

> Refactor `packages/desktop/src/renderer/main.ts` (2423 lines) into modular, testable components

**Branch:** `refactor/renderer-modules`
**Created:** 2026-01-12

---

## Current State Analysis

The `main.ts` file contains:

| Section | Lines | Description |
|---------|-------|-------------|
| Imports & utilities | 1-108 | debounce, font helpers, getEl |
| DOM element references | 110-225 | 50+ getElementById calls |
| Terminal setup | 226-253 | xterm.js configuration |
| State variables | 255-288 | Global mutable state |
| Browser/viewport | 290-323 | updateBrowserBounds, setBrowserLoaded |
| Console buffer | 325-332 | CircularBuffer for messages |
| Project modal | 334-457 | Modal dialog creation |
| Init function | 459-804 | Main initialization (~345 lines) |
| Project dropdown | 806-833 | Dropdown management |
| Panel resizers | 835-977 | Three-column resize handling |
| Context panel | 979-1310 | Element selection & display (~330 lines) |
| Console UI | 1312-1360 | Console drawer rendering |
| Inspect sequence | 1362-1423 | Phase 2 multi-click capture |
| Form state UI | 1425-1501 | Phase 3 form validation display |
| Phase 4 UI | 1503-1745 | Edge case panels (~240 lines) |
| Event handlers | 1747-2097 | Button clicks, keyboard shortcuts |
| Status helpers | 2223-2285 | Status bar management |
| Context menu | 2300-2420 | Terminal right-click menu |

**Key Issues:**
1. All state is global and mutable
2. DOM elements captured at module load time
3. Heavy coupling between sections
4. No separation of concerns
5. Impossible to unit test

---

## Target Architecture

```
packages/desktop/src/renderer/
├── main.ts              # Entry point (~100 lines) - init & wire modules
├── types.ts             # Existing types (keep)
├── context-formatter.ts # Existing formatter (keep)
├── constants/           # Existing constants (keep)
│   └── mcp-tool-icons.ts
│
├── state/
│   └── index.ts         # Centralized state management
│
├── utils/
│   ├── dom.ts           # getEl, copyToClipboard
│   ├── fonts.ts         # waitForFonts, runFontDiagnostics
│   └── debounce.ts      # debounce utility
│
├── terminal/
│   ├── setup.ts         # Terminal creation & configuration
│   ├── handlers.ts      # PTY data handling, key handlers
│   └── context-menu.ts  # Right-click menu
│
├── panels/
│   ├── browser.ts       # Browser bounds, viewport management
│   ├── context.ts       # Element context panel
│   ├── console.ts       # Console drawer
│   ├── inspect-sequence.ts  # Phase 2 sequence capture
│   ├── form-state.ts    # Phase 3 form UI
│   └── phase4.ts        # Phase 4 edge case panels
│
├── components/
│   ├── project-modal.ts # Project detection modal
│   ├── panel-resizers.ts # Column resize handling
│   └── status-bar.ts    # Status bar updates
│
└── handlers/
    ├── navigation.ts    # URL navigation, refresh, viewport
    ├── claude.ts        # Send to Claude, thinking indicator
    └── inspect.ts       # Inspect mode, freeze hover
```

---

## Module Specifications

### 1. `state/index.ts`
Centralized state with getters/setters for reactivity.

```typescript
// State interface
interface AppState {
  claudeRunning: boolean;
  browserLoaded: boolean;
  inspectMode: boolean;
  selectedElements: ElementInfo[];
  consoleDrawerOpen: boolean;
  contextMode: ContextMode;
  inspectSequence: CapturedInteraction[];
  hoverFrozen: boolean;
  capturedToasts: ToastCapture[];
  isThinking: boolean;
  viewportWidth: number;
  currentProjectName: string;
  currentServerPort: number;
  currentServerType: 'dev' | 'static' | null;
  playwrightConnected: boolean;
}

// Export state object and helper functions
export const state: AppState;
export function updateState(partial: Partial<AppState>): void;
export function subscribe(callback: (state: AppState) => void): () => void;
```

### 2. `utils/dom.ts`
DOM utilities.

```typescript
export function getEl<T extends HTMLElement>(id: string): T;
export async function copyToClipboard(text: string, button: HTMLButtonElement): Promise<void>;
```

### 3. `utils/fonts.ts`
Font loading utilities.

```typescript
export async function waitForFonts(fontFamily: string, timeoutMs?: number): Promise<void>;
export function runFontDiagnostics(): void;
```

### 4. `terminal/setup.ts`
Terminal configuration.

```typescript
export function createTerminal(): { terminal: Terminal; fitAddon: FitAddon };
export function configureTerminal(terminal: Terminal, fitAddon: FitAddon): void;
```

### 5. `panels/context.ts`
Context panel management.

```typescript
export function updateContextPanel(element: ElementInfo): void;
export function updateElementChips(elements: ElementInfo[]): void;
export function addSelectedElement(element: ElementInfo): void;
export function removeElement(selector: string): void;
export function clearSelection(): void;
```

### 6. `panels/browser.ts`
Browser panel and viewport.

```typescript
export function updateBrowserBounds(): void;
export function setBrowserLoaded(url?: string): void;
export function handleViewportChange(preset: string): void;
```

### 7. `components/project-modal.ts`
Project modal dialog.

```typescript
export function showProjectModal(project: ProjectInfo): void;
export function hideProjectModal(): void;
```

### 8. `handlers/claude.ts`
Claude interaction handlers.

```typescript
export function sendToClaude(prompt: string, context: string): Promise<void>;
export function showThinking(): void;
export function hideThinking(): void;
```

---

## Testing Strategy

### Unit Tests (New)

Create `packages/desktop/src/renderer/__tests__/` directory.

| Test File | Coverage |
|-----------|----------|
| `state.test.ts` | State management, subscriptions |
| `utils.test.ts` | debounce, font detection (mocked) |
| `context-panel.test.ts` | Element formatting, display logic |
| `console-panel.test.ts` | Message buffering, filtering |
| `phase4-ui.test.ts` | Edge case detection logic |

### Testing Approach

1. **Mock `window.claudeLens`** - Create test doubles for IPC
2. **Mock DOM** - Use jsdom or happy-dom for DOM manipulation tests
3. **Pure function extraction** - Move logic out of event handlers for testability
4. **State isolation** - Each test resets state

### Test Setup Requirements

```bash
# Add dev dependencies
pnpm add -D vitest jsdom @testing-library/dom
```

### Example Test Structure

```typescript
// packages/desktop/src/renderer/__tests__/state.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { state, updateState, subscribe } from '../state';

describe('AppState', () => {
  beforeEach(() => {
    // Reset state before each test
  });

  it('should update state immutably', () => {
    updateState({ claudeRunning: true });
    expect(state.claudeRunning).toBe(true);
  });

  it('should notify subscribers on change', () => {
    const callback = vi.fn();
    subscribe(callback);
    updateState({ browserLoaded: true });
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ browserLoaded: true }));
  });
});
```

```typescript
// packages/desktop/src/renderer/__tests__/context-panel.test.ts
import { describe, it, expect } from 'vitest';
import { formatElementDisplay, buildTagDisplay } from '../panels/context';

describe('Context Panel', () => {
  it('should build tag display with id and classes', () => {
    const element = {
      tagName: 'button',
      id: 'submit',
      classes: ['btn', 'primary'],
    };
    expect(buildTagDisplay(element)).toBe('<button id="submit" class="btn primary">');
  });

  it('should truncate long text content', () => {
    const longText = 'a'.repeat(300);
    expect(formatElementDisplay({ text: longText }).text.length).toBeLessThanOrEqual(203);
  });
});
```

---

## Implementation Steps

### Phase 1: Setup & Utils (Day 1)
- [ ] Create directory structure
- [ ] Extract `utils/debounce.ts`
- [ ] Extract `utils/fonts.ts`
- [ ] Extract `utils/dom.ts`
- [ ] Add vitest configuration for desktop package
- [ ] Write tests for utils

### Phase 2: State Management (Day 1-2)
- [ ] Create `state/index.ts` with typed state
- [ ] Migrate global variables to state module
- [ ] Add subscription mechanism for reactivity
- [ ] Write tests for state management

### Phase 3: Terminal Module (Day 2)
- [ ] Extract `terminal/setup.ts`
- [ ] Extract `terminal/handlers.ts`
- [ ] Extract `terminal/context-menu.ts`
- [ ] Update main.ts to use terminal module

### Phase 4: Panels (Day 2-3)
- [ ] Extract `panels/browser.ts`
- [ ] Extract `panels/context.ts`
- [ ] Extract `panels/console.ts`
- [ ] Extract `panels/inspect-sequence.ts`
- [ ] Extract `panels/form-state.ts`
- [ ] Extract `panels/phase4.ts`
- [ ] Write tests for panel logic

### Phase 5: Components (Day 3)
- [ ] Extract `components/project-modal.ts`
- [ ] Extract `components/panel-resizers.ts`
- [ ] Extract `components/status-bar.ts`

### Phase 6: Handlers (Day 3-4)
- [ ] Extract `handlers/navigation.ts`
- [ ] Extract `handlers/claude.ts`
- [ ] Extract `handlers/inspect.ts`
- [ ] Wire handlers in main.ts

### Phase 7: Integration & Cleanup (Day 4)
- [ ] Update main.ts as thin orchestrator
- [ ] Run all tests
- [ ] Manual testing of full application
- [ ] Fix any regressions
- [ ] Update imports throughout

### Phase 8: Documentation (Day 4)
- [ ] Update ARCHITECTURE.md with new structure
- [ ] Add JSDoc comments to exported functions
- [ ] Document state management approach

---

## Success Criteria

1. **main.ts < 150 lines** - Only initialization and wiring
2. **No module > 300 lines** - Each module focused on one concern
3. **Test coverage > 60%** - Critical logic has unit tests
4. **All existing features work** - No regressions
5. **Build passes** - TypeScript compiles without errors
6. **Lint passes** - ESLint rules satisfied

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking existing features | Manual test checklist after each phase |
| Circular dependencies | Careful module boundary design, state as hub |
| Performance regression | Profile before/after, avoid unnecessary re-renders |
| Merge conflicts | Small, focused commits; rebase frequently |

---

## Manual Test Checklist

Run after each phase:

- [ ] App launches without errors
- [ ] Can open a project (File > Open)
- [ ] Dev server starts and page loads
- [ ] Ctrl+hover highlights elements
- [ ] Click element shows context panel
- [ ] Send to Claude works
- [ ] Console drawer shows messages
- [ ] Panel resizing works
- [ ] Viewport presets work
- [ ] Inspect mode captures sequence
- [ ] Terminal copy/paste works
- [ ] Status bar updates correctly

---

## Notes

- Keep `context-formatter.ts` and `constants/` unchanged initially
- Consider TypeScript strict mode after refactor
- Potential future improvement: React/Preact for reactive UI
