# Code Simplification Plan

**Created:** 2026-01-10
**Updated:** 2026-01-11
**Status:** Validated
**Priority:** Low-Medium (quality of life, not blocking)

## Overview

Code simplification opportunities identified and validated. Prioritized by impact and effort.

### Current File Sizes

| File | Lines | Status |
|------|-------|--------|
| `renderer/main.ts` | 1839 | Too large - split recommended |
| `main/index.ts` | 2046 | Contains dead code + inline JS |
| `main/playwright-handler.ts` | 844 | Contains 346 lines inline JS |
| `main/playwright-adapter.ts` | 851 | Repetitive error handling |

---

## HIGH Priority

### 1. Remove Dead Code ✓ VALIDATED
- **File:** `packages/desktop/src/main/index.ts`
- **Lines:** 1228-1341 (113 lines)
- **Issue:** `_injectCtrlClickCapture()` is `@deprecated` and unused
- **Action:** Delete the function entirely
- **Effort:** 5 min
- **Lines Saved:** 113

### 2. Batch getElementById Declarations ✓ VALIDATED
- **File:** `packages/desktop/src/renderer/main.ts`
- **Lines:** 91-181 (72 calls found)
- **Issue:** Repetitive `getElementById()` calls with type assertions
- **Proposed:**
  ```typescript
  const getEl = <T extends HTMLElement>(id: string): T =>
    document.getElementById(id) as T;

  const urlInput = getEl<HTMLInputElement>('urlInput');
  const goBtn = getEl<HTMLButtonElement>('goBtn');
  ```
- **Effort:** 30 min
- **Lines Saved:** 50-60

### 3. Extract Inline JavaScript (index.ts) ✓ VALIDATED
- **File:** `packages/desktop/src/main/index.ts`
- **Lines:** 952-1188 (236 lines)
- **Function:** `injectInspectSystem()` contains massive inline JS
- **Action:** Move to `src/main/inject/inspect-system.js` and load at build time
- **Effort:** 1 hour
- **Benefit:** IDE syntax highlighting, testable, easier debugging

---

## MEDIUM Priority

### 4. Extract Tailwind Translation Map ✓ COMPLETED
- **Status:** DONE - Moved to `context-formatter.ts` in recent refactor
- **No action needed**

### 5. Split `updateContextPanel()` Function ✓ VALIDATED
- **File:** `packages/desktop/src/renderer/main.ts`
- **Line:** 731 (function start)
- **Issue:** Large function handling 10+ UI sections
- **Action:** Extract focused functions:
  - `updateDescriptionSection(element)`
  - `updateComponentSection(element)`
  - `updateHierarchySection(element)`
  - `updateAttributesSection(element)`
  - `updateStylesSection(element)`
- **Effort:** 1 hour
- **Benefit:** Testable, maintainable, single responsibility

### 6. Split `startProject()` Function ✓ VALIDATED
- **File:** `packages/desktop/src/main/index.ts`
- **Line:** 566 (function start)
- **Issue:** Large function with multiple responsibilities
- **Action:** Extract:
  - `checkAndRepairDependencies()`
  - `startDevServer()`
  - `startStaticServer()`
  - `initializeBrowserView()`
- **Effort:** 1.5 hours

### 7. Extract Playwright Inspection Helpers ✓ VALIDATED
- **File:** `packages/desktop/src/main/playwright-handler.ts`
- **Lines:** 63-277 (`ELEMENT_INSPECTION_HELPERS` - 214 lines)
- **Lines:** 278-414 (`PHASE4_EDGE_CASE_HELPERS` - 136 lines)
- **Total:** 350 lines of inline JavaScript strings
- **Action:** Move to separate `.js` files
- **Effort:** 45 min
- **Benefit:** Syntax highlighting, testable

### 8. DRY Up Error Handling in Playwright Adapter ✓ VALIDATED
- **File:** `packages/desktop/src/main/playwright-adapter.ts`
- **Issue:** 8 repetitive timeout error handlers (lines 431, 472, 499, 535, 573, 605, 636, 690)
- **Pattern:**
  ```typescript
  if (err.message.includes('Timeout')) {
    throw new Error(`${action} timeout: "${selector}" not found within ${timeout}ms.`);
  }
  ```
- **Action:** Create `formatTimeoutError(action, selector, timeout)` helper
- **Effort:** 30 min
- **Lines Saved:** 20-30

---

## LOW Priority (Nice to Have)

### 9. Extract MCP Tool Icons Config ✓ VALIDATED
- **File:** `packages/desktop/src/renderer/main.ts`
- **Line:** 426 (`mcpToolIcons` array)
- **Issue:** Large config array mixed with code
- **Action:** Move to `src/renderer/constants/mcp-tool-icons.ts`
- **Effort:** 15 min

### 10. Simplify Form State Badge Logic
- **File:** `packages/desktop/src/renderer/main.ts`
- **Issue:** Multiple if-else branches for badge state
- **Action:** Use lookup object
- **Effort:** 15 min

### 11. Rename Constants to SCREAMING_CASE
- `mcpToolIcons` → `MCP_TOOL_ICONS`
- `charSubstitutions` → `CHAR_SUBSTITUTIONS`
- `viewportPresets` → `VIEWPORT_PRESETS`
- **Effort:** 10 min

---

## NEW: Consolidate Send Handlers (from fresh review)

### 12. DRY Up Send Button Handlers
- **File:** `packages/desktop/src/renderer/main.ts`
- **Issue:** 4 near-identical handlers (`sendSequenceBtn`, `sendToastsBtn`, `consoleSendBtn`, `sendPromptBtn`)
- **Pattern:**
  1. Check if Claude running
  2. Check if data exists
  3. Format data
  4. Call sendToClaude
  5. Show success/error
- **Action:** Extract `sendToClaudeWithCheck(data, formatFn, successMsg)` helper
- **Effort:** 30 min

---

## NEW: Unify Project Startup State Management

### 13. Consolidate Browser State Management
- **File:** `packages/desktop/src/renderer/main.ts`
- **Issue:** Two different code paths to start a project cause state inconsistencies

  **Root Cause:**
  1. **Modal flow** (Open Project): Renderer handles everything → calls `project.start()` → sets `browserLoaded = true` after response
  2. **Recent projects flow**: Main process calls `startProject()` directly → bypasses renderer's state management → `browserLoaded` never set

  **Why it was confusing:**
  - The `server:ready` event IS fired in both flows
  - But the old handler only updated status, didn't set `browserLoaded`
  - Without `browserLoaded = true`, ResizeObserver callbacks were blocked

- **Current state:** Duplicated state-setting code in multiple places
- **Action:** Create a single `setBrowserLoaded()` function that:
  - Sets `browserLoaded = true`
  - Enables `refreshBtn` and `restartServerBtn`
  - Hides placeholder
  - Sets status to 'Connected'
  - Updates browser help text
  - Calls `updateBrowserBounds()`
- **Benefit:** Single source of truth for browser loaded state
- **Effort:** 30 min
- **Priority:** MEDIUM - prevents future state bugs

---

## Implementation Order (Updated)

```
Phase 1: Quick Wins (< 30 min total)
├── #1  Remove dead code (5 min) ← START HERE
├── #11 Rename constants (10 min)
└── #9  Extract MCP tool icons (15 min)

Phase 2: Inline JS Extraction (2 hours)
├── #3  Extract inspect-system.js from index.ts (1 hour)
└── #7  Extract playwright helpers (45 min)

Phase 3: Structure Improvements (3-4 hours)
├── #2  Batch getElementById (30 min)
├── #8  DRY error handling (30 min)
├── #12 DRY send handlers (30 min)
├── #13 Consolidate setBrowserLoaded (30 min) ← Prevents state bugs
├── #5  Split updateContextPanel (1 hour)
└── #6  Split startProject (1.5 hours)
```

---

## Summary of Changes

| Item | Original Status | Validated Status |
|------|-----------------|------------------|
| #1 Dead code | Lines 1004-1111 | Lines 1228-1341 (corrected) |
| #2 getElementById | 85 calls | 72 calls (corrected) |
| #3 Inline JS | Lines 727-958 | Lines 952-1188 (corrected) |
| #4 Tailwind map | Planned | COMPLETED (moved to context-formatter.ts) |
| #5 updateContextPanel | Planned | Validated at line 731 |
| #6 startProject | Planned | Validated at line 566 |
| #7 Playwright helpers | 209 lines | 350 lines (both helpers counted) |
| #8 Error handling | Planned | Validated (8 occurrences) |
| #12 Send handlers | NEW | Added from fresh review |
| #13 Browser state | NEW | Dual code path bug fix |

---

## Notes

- Run `npm run build` after each phase to verify
- These are **quality of life** improvements - the code works fine as-is
- Item #4 was completed during the context-formatter refactor
- Prioritize based on how often you touch each file
