# Code Simplification Plan

**Created:** 2026-01-10
**Status:** Planned
**Priority:** Low-Medium (quality of life, not blocking)

## Overview

Code simplification opportunities identified by the `code-simplifier` agent. Prioritized by impact and effort.

---

## HIGH Priority

### 1. Remove Dead Code
- **File:** `packages/desktop/src/main/index.ts`
- **Lines:** 1004-1111
- **Issue:** `_injectCtrlClickCapture()` is marked `@deprecated` and unused
- **Action:** Delete the function entirely
- **Effort:** 5 min
- **Lines Saved:** 107

### 2. Batch getElementById Declarations
- **File:** `packages/desktop/src/renderer/main.ts`
- **Lines:** 84-168
- **Issue:** 85 repetitive `getElementById()` calls with type assertions
- **Current:**
  ```typescript
  const urlInput = document.getElementById('urlInput') as HTMLInputElement;
  const goBtn = document.getElementById('goBtn') as HTMLButtonElement;
  // ... 80+ more lines
  ```
- **Proposed:**
  ```typescript
  const getEl = <T extends HTMLElement>(id: string): T =>
    document.getElementById(id) as T;

  const urlInput = getEl<HTMLInputElement>('urlInput');
  const goBtn = getEl<HTMLButtonElement>('goBtn');
  ```
- **Effort:** 30 min
- **Lines Saved:** 60-70

### 3. Extract Inline JavaScript Injection
- **File:** `packages/desktop/src/main/index.ts`
- **Lines:** 727-958
- **Issue:** 230 lines of JavaScript as a template string - no syntax highlighting, no type checking
- **Action:** Move to `src/main/inject/inspect-system.js` and read at build time
- **Effort:** 1 hour
- **Benefit:** IDE support, easier debugging, testable

---

## MEDIUM Priority

### 4. Extract Tailwind Translation Map
- **File:** `packages/desktop/src/renderer/main.ts`
- **Lines:** 1700-1795
- **Issue:** 60-entry Tailwind class translation object embedded in event handler
- **Action:** Move to `src/renderer/constants/tailwind-translations.ts`
- **Effort:** 20 min
- **Lines Saved:** 40-50

### 5. Split `updateContextPanel()` Function
- **File:** `packages/desktop/src/renderer/main.ts`
- **Lines:** 685-912
- **Issue:** 227-line function handling 10+ UI sections
- **Action:** Extract focused functions:
  - `updateDescriptionSection(element)`
  - `updateComponentSection(element)`
  - `updateHierarchySection(element)`
  - `updateAttributesSection(element)`
  - `updateStylesSection(element)`
- **Effort:** 1 hour
- **Benefit:** Testable, maintainable, single responsibility

### 6. Split `startProject()` Function
- **File:** `packages/desktop/src/main/index.ts`
- **Lines:** 417-629
- **Issue:** 212-line function with 8+ responsibilities
- **Action:** Extract:
  - `checkAndRepairDependencies()`
  - `startDevServer()`
  - `startStaticServer()`
  - `initializeBrowserView()`
- **Effort:** 1.5 hours
- **Benefit:** Easier to understand, test, and modify

### 7. Extract Playwright Inspection Helpers
- **File:** `packages/desktop/src/main/playwright-handler.ts`
- **Lines:** 59-268
- **Issue:** 209 lines of inline JavaScript string
- **Action:** Same approach as #3 - move to separate file
- **Effort:** 45 min

### 8. DRY Up Error Handling in Playwright Adapter
- **File:** `packages/desktop/src/main/playwright-adapter.ts`
- **Lines:** 339-408
- **Issue:** Repetitive error message formatting in click/fill/type/hover
- **Action:** Create `formatActionError(action, selector, error)` helper
- **Effort:** 30 min
- **Lines Saved:** 20-30

---

## LOW Priority (Nice to Have)

### 9. Extract MCP Tool Icons Config
- **File:** `packages/desktop/src/renderer/main.ts`
- **Lines:** 391-442
- **Issue:** 50-line config array mixed with code
- **Action:** Move to `src/renderer/constants/mcp-tool-icons.ts`
- **Effort:** 15 min

### 10. Simplify Form State Badge Logic
- **File:** `packages/desktop/src/renderer/main.ts`
- **Lines:** 1099-1114
- **Issue:** 6 if-else branches for badge state
- **Action:** Use lookup object:
  ```typescript
  const BADGE_CONFIG = {
    disabled: { text: 'Disabled', class: 'disabled' },
    invalid: { text: 'Invalid', class: 'invalid' },
    // ...
  };
  ```
- **Effort:** 15 min

### 11. Framework Detection Lookup
- **File:** `packages/desktop/src/main/project-manager.ts`
- **Lines:** 71-92
- **Issue:** Nested conditionals for framework/port detection
- **Action:** Use declarative config object
- **Effort:** 20 min

### 12. DOM Builder for Modals (Only if building more modals)
- **File:** `packages/desktop/src/renderer/main.ts`
- **Lines:** 249-359
- **Issue:** `showProjectModal()` is 110 lines of verbose DOM creation
- **Action:** Create `addLabeledField()` helper
- **Decision:** SKIP unless building more modals - code works and is stable

---

## Naming Improvements

Consider renaming these constants to SCREAMING_CASE:
- `mcpToolIcons` → `MCP_TOOL_ICONS`
- `charSubstitutions` → `CHAR_SUBSTITUTIONS`
- `viewportPresets` → `VIEWPORT_PRESETS`

---

## Implementation Order (Suggested)

```
Phase 1: Quick Wins (< 1 hour total)
├── #1  Remove dead code (5 min)
├── #9  Extract MCP tool icons (15 min)
├── #4  Extract Tailwind map (20 min)
└── #10 Simplify badge logic (15 min)

Phase 2: Structure Improvements (2-3 hours)
├── #2  Batch getElementById (30 min)
├── #8  DRY error handling (30 min)
├── #5  Split updateContextPanel (1 hour)
└── #6  Split startProject (1.5 hours)

Phase 3: Inline JS Extraction (2 hours)
├── #3  Extract inspect-system.js (1 hour)
└── #7  Extract playwright helpers (45 min)
```

---

## Notes

- Run `/final-code-review` after each phase
- These are all **quality of life** improvements - the code works fine as-is
- Prioritize based on how often you touch each file
- Skip #12 (modal DOM builder) unless you're adding more modals
