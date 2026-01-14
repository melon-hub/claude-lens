# Phase 2.6 Execution Plan: Final Extractions

**Goal:** main.ts from 1,297 → < 500 lines
**Branch:** `refactor/renderer-foundation-phase2`
**Execution:** Autonomous overnight run with verification at each step

---

## Current Analysis (main.ts:1297)

| Line Range | Function/Code | Lines | Target Module |
|------------|---------------|-------|---------------|
| 461-522 | Inspect sequence UI | ~60 | `panels/inspect-sequence.ts` |
| 524-600 | Form state UI | ~76 | `panels/form-state.ts` |
| 602-844 | Phase 4 UI (overlay, stacking, scroll, iframe, shadow, toasts) | ~240 | `panels/phase4-ui.ts` |
| 432-459 | Project dropdown | ~28 | `handlers/project.ts` |
| 846-1015 | Button click handlers | ~170 | `handlers/buttons.ts` |
| 1042-1063 | Keyboard shortcuts | ~22 | `handlers/keyboard.ts` |
| 1095-1236 | Send to Claude handlers | ~140 | `handlers/send-to-claude.ts` |

**Total extractable:** ~736 lines → main.ts target: ~561 lines

---

## Extraction Order (Dependency-Safe)

### Step 1: `panels/inspect-sequence.ts` (~60 lines)
**Risk:** LOW - Self-contained UI functions

Extract:
- `updateInspectSequenceUI()`
- `clearInspectSequenceUI()`

Dependencies:
- `state.inspectSequence` (read only)
- DOM elements: `inspectSequenceInfo`, `sequenceCount`, `inspectSequenceList`
- State helpers: `clearInspectSequence`

**Checkpoint:**
```bash
pnpm run build && pnpm run lint && pnpm run test
```

---

### Step 2: `panels/form-state.ts` (~76 lines)
**Risk:** LOW - Pure UI rendering

Extract:
- `updateFormStateUI(element: ElementInfo)`

Dependencies:
- DOM elements: `formStateInfo`, `formStateContent`, `validationBadge`
- Type: `ElementInfo`

**Checkpoint:**
```bash
pnpm run build && pnpm run lint && pnpm run test
```

---

### Step 3: `panels/phase4-ui.ts` (~240 lines)
**Risk:** LOW - All Phase 4 UI grouped together

Extract:
- `createInfoRow()` helper
- `updateOverlayUI(element)`
- `updateStackingUI(element)`
- `updateScrollUI(element)`
- `updateIframeUI(element)`
- `updateShadowDOMUI(element)`
- `updateToastCapturesUI()`
- `clearToastCaptures()`
- `updatePhase4UI(element)` - orchestrator

Dependencies:
- DOM elements: `overlayInfo`, `overlayContent`, `overlayTypeBadge`, etc.
- State: `state.capturedToasts`
- State helpers: `clearCapturedToasts`

**Checkpoint:**
```bash
pnpm run build && pnpm run lint && pnpm run test
```

---

### Step 4: `handlers/project.ts` (~28 lines)
**Risk:** LOW - Isolated async function

Extract:
- `updateProjectDropdown()`

Dependencies:
- `window.claudeLens.project.getRecent()`
- DOM element: `projectDropdown`
- State: `state.currentProjectName`

**Checkpoint:**
```bash
pnpm run build && pnpm run lint && pnpm run test
```

---

### Step 5: `handlers/buttons.ts` (~170 lines)
**Risk:** MEDIUM - Multiple DOM interactions

Extract button handlers:
- `startClaudeBtn.click` handler
- `goBtn.click` handler
- `refreshBtn.click` handler
- `restartServerBtn.click` handler
- `viewportSelect.change` handler
- `inspectBtn.click` handler
- `freezeHoverBtn.click` handler + `toggleFreezeHover()`

Pattern: Export setup function that receives element refs:
```typescript
export function setupButtonHandlers(elements: ButtonElements): void {
  elements.startClaudeBtn.addEventListener('click', handleStartClaude);
  // ...
}
```

**Checkpoint:**
```bash
pnpm run build && pnpm run lint && pnpm run test
```

---

### Step 6: `handlers/keyboard.ts` (~22 lines)
**Risk:** LOW - Simple keyboard listener

Extract:
- Document keydown handler (F for freeze, Ctrl+R for refresh)

**Checkpoint:**
```bash
pnpm run build && pnpm run lint && pnpm run test
```

---

### Step 7: `handlers/send-to-claude.ts` (~140 lines)
**Risk:** MEDIUM - Core functionality

Extract:
- `sendSequenceBtn.click` handler
- `sendToastsBtn.click` handler
- `consoleSendBtn.click` handler
- `sendPromptBtn.click` handler

Dependencies:
- `window.claudeLens.sendToClaude()`
- `showThinking()`, `hideThinking()`
- Context formatters
- State access

**Checkpoint:**
```bash
pnpm run build && pnpm run lint && pnpm run test
```

---

### Step 8: Final Cleanup
**Risk:** LOW - Just cleanup

Tasks:
- Remove any remaining inline handlers
- Update `panels/index.ts` with new exports
- Update `handlers/index.ts` with new exports
- Verify all imports clean in main.ts
- Update ARCHITECTURE.md

**Checkpoint:**
```bash
pnpm run build && pnpm run lint && pnpm run test
wc -l packages/desktop/src/renderer/main.ts  # Must be < 500
```

---

## Validation Checkpoints

### After Each Step
```bash
# Must all pass before proceeding
pnpm run build          # TypeScript compiles
pnpm run lint           # No lint errors
pnpm run test           # All tests pass
```

### After All Extractions (Pre-E2E)
```bash
# Line count check
wc -l packages/desktop/src/renderer/main.ts  # Target: < 500

# Full build
pnpm run build

# Type coverage
pnpm run typecheck
```

### E2E Manual Testing Checklist
After all extractions complete, verify each feature works:

**Browser Panel:**
- [ ] Navigate to localhost URL
- [ ] Refresh button works
- [ ] Viewport presets work (Full, Desktop, Mobile)
- [ ] Restart server button works (if project open)

**Element Inspection:**
- [ ] Ctrl+hover highlights elements
- [ ] Click selects element
- [ ] Context panel shows element details
- [ ] Framework detection shows React/Vue component
- [ ] Copy selector button works
- [ ] Copy component button works

**Inspect Mode (Phase 2):**
- [ ] Inspect button toggles mode
- [ ] Clicking elements adds to sequence
- [ ] Sequence list shows captured items
- [ ] Clear sequence button works
- [ ] Send sequence to Claude works

**Form State (Phase 3):**
- [ ] Selecting form inputs shows form state panel
- [ ] Validation badge shows (valid/invalid/required)
- [ ] Form values display correctly

**Phase 4 Features:**
- [ ] Overlay detection (modals, tooltips)
- [ ] Z-index stacking info
- [ ] Scroll context info
- [ ] iframe detection
- [ ] Shadow DOM detection
- [ ] Toast capture and send

**Console Drawer:**
- [ ] Toggle opens/closes drawer
- [ ] Console messages appear
- [ ] Clear console works
- [ ] Send console to Claude works

**Terminal:**
- [ ] Start Claude button works
- [ ] Terminal input/output works
- [ ] Ctrl+Shift+C copies selection
- [ ] Ctrl+Shift+V pastes (text and images)
- [ ] Right-click context menu works

**Send to Claude:**
- [ ] Send selected element works
- [ ] Send with custom prompt works
- [ ] Thinking indicator appears
- [ ] Context clears after send

**Keyboard Shortcuts:**
- [ ] F freezes/unfreezes hover
- [ ] Ctrl+R refreshes page

**Project Management:**
- [ ] File > Open Project works
- [ ] Recent projects dropdown works
- [ ] Project close resets state

---

## Rollback Plan

If any step fails:
```bash
# Revert to last good commit
git checkout -- packages/desktop/src/renderer/

# Or reset specific file
git checkout HEAD~1 -- packages/desktop/src/renderer/main.ts
```

---

## Commit Strategy

One commit per extraction step:
1. `refactor(panels): extract inspect sequence UI`
2. `refactor(panels): extract form state UI`
3. `refactor(panels): extract Phase 4 UI functions`
4. `refactor(handlers): extract project dropdown handler`
5. `refactor(handlers): extract button handlers`
6. `refactor(handlers): extract keyboard shortcuts`
7. `refactor(handlers): extract send-to-claude handlers`
8. `refactor: final cleanup, main.ts < 500 lines`

---

## Success Criteria

| Metric | Before | Target |
|--------|--------|--------|
| main.ts lines | 1,297 | < 500 |
| Build passes | ✅ | ✅ |
| Lint passes | ✅ | ✅ |
| Tests pass | ✅ | ✅ |
| E2E manual tests | - | All pass |

---

## Estimated Time

| Step | Time |
|------|------|
| Step 1-3 (Panel UI) | ~45 min |
| Step 4-7 (Handlers) | ~90 min |
| Step 8 (Cleanup) | ~30 min |
| E2E Testing | ~30 min |
| **Total** | ~3.5 hours |

---

## Execution Notes

- Run build/lint/test after EVERY extraction
- If a step fails, fix before proceeding
- Commit after each successful extraction
- Push to branch periodically for safety
- Final E2E test validates everything works together
