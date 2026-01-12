# Code Simplification Plan

**Created:** 2026-01-10
**Updated:** 2026-01-12
**Completed:** 2026-01-12
**Status:** COMPLETE (2 items deferred)
**Priority:** Low-Medium (quality of life, not blocking)

## Overview

Code simplification opportunities identified and validated. All prioritized items complete.
Two low-priority refactoring items deferred for when those files are modified for other reasons.

### Progress Summary

| Phase | Status |
|-------|--------|
| Phase 1: Quick Wins | COMPLETE |
| Phase 2: Inline JS Extraction | COMPLETE |
| Phase 3: Structure Improvements | COMPLETE (2 deferred) |

---

## COMPLETED Items

### 1. Remove Dead Code ✓ DONE
- **File:** `packages/desktop/src/main/index.ts`
- **What:** Deleted `_injectCtrlClickCapture()` function (113 lines)

### 2. Batch getElementById Declarations ✓ DONE
- **File:** `packages/desktop/src/renderer/main.ts`
- **What:** Created `getEl<T>()` helper for type-safe element access

### 3. Extract Inline JavaScript (index.ts) ✓ DONE
- **File:** `packages/desktop/src/main/index.ts`
- **What:** Moved `injectInspectSystem` JS to `src/main/inject/inspect-system.js`
- **Build:** Added copy step to package.json

### 7. Extract Playwright Inspection Helpers ✓ DONE
- **File:** `packages/desktop/src/main/playwright-handler.ts`
- **What:** Moved 350 lines of inline JS to:
  - `src/main/inject/element-inspection-helpers.js`
  - `src/main/inject/edge-case-helpers.js`

### 8. DRY Up Error Handling in Playwright Adapter ✓ DONE
- **File:** `packages/desktop/src/main/playwright-adapter.ts`
- **What:** Created `formatTimeoutError(action, selector, timeout, hint?)` helper

### 9. Extract MCP Tool Icons Config ✓ DONE
- **File:** `packages/desktop/src/renderer/main.ts`
- **What:** Moved to `src/renderer/constants/mcp-tool-icons.ts`

### 11. Rename Constants to SCREAMING_CASE ✓ DONE
- `mcpToolIcons` → `MCP_TOOL_ICONS`
- `charSubstitutions` → `CHAR_SUBSTITUTIONS`
- `viewportPresets` → `VIEWPORT_PRESETS`

### 12. DRY Up Send Button Handlers ✓ SKIPPED
- **Reason:** Variance between handlers too high for meaningful abstraction

### 13. Consolidate Browser State Management ✓ DONE
- **File:** `packages/desktop/src/renderer/main.ts`
- **What:** Created `setBrowserLoaded(url?)` function consolidating 4 code paths

---

## DEFERRED Items

> These are low-priority refactoring opportunities. Address when modifying these files for other reasons.

### 5. Split `updateContextPanel()` Function
- **File:** `packages/desktop/src/renderer/main.ts`
- **Issue:** Large function handling 10+ UI sections
- **Action:** Extract focused functions for each section
- **Effort:** 1 hour
- **Why Deferred:** Function works correctly, splitting is purely cosmetic

### 6. Split `startProject()` Function
- **File:** `packages/desktop/src/main/index.ts`
- **Issue:** Large function with multiple responsibilities
- **Action:** Extract sub-functions for dependencies, dev server, static server
- **Effort:** 1.5 hours
- **Why Deferred:** Function works correctly, splitting is purely cosmetic

---

## Files Changed Summary

| File | Changes |
|------|---------|
| `main/index.ts` | Deleted dead code, extracted inline JS |
| `main/playwright-handler.ts` | Extracted 350 lines inline JS |
| `main/playwright-adapter.ts` | DRY error handling |
| `renderer/main.ts` | `getEl<T>()` helper, `setBrowserLoaded()`, SCREAMING_CASE |
| `renderer/constants/mcp-tool-icons.ts` | NEW - extracted config |
| `main/inject/inspect-system.js` | NEW - browser inspection script |
| `main/inject/element-inspection-helpers.js` | NEW - element helpers |
| `main/inject/edge-case-helpers.js` | NEW - edge case detection |
| `package.json` | Added JS copy step to build |

---

## Notes

- All builds pass after each change
- Remaining items (#5, #6) are optional polish - code works correctly as-is
- Focus on these when touching those files for other reasons
