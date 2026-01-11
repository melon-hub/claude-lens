# Claude Lens Desktop - UX Improvements Plan

> Remaining UI/UX enhancements for production polish

**Created:** 2026-01-11
**Status:** In Progress

---

## Overview

This plan captures the remaining UX improvements identified during the initial UI review. These are quality-of-life enhancements that improve usability without changing core functionality.

---

## Phase 2: Context Panel Enhancements

### 2b. Copy Buttons
**Priority:** Medium
**Effort:** Small

Add copy-to-clipboard buttons for key information in the context panel:

- [ ] Copy selector button (next to PATH section)
- [ ] Copy component name (next to COMPONENT section)
- [ ] Copy file:line reference (for React/Vue source locations)
- [ ] Visual feedback on copy (brief "Copied!" toast or checkmark)

**Implementation Notes:**
- Use `navigator.clipboard.writeText()` API
- Add small icon button (clipboard icon from existing icon set)
- Consider keyboard shortcut (Ctrl+C when section is focused)

---

### 2c. Claude Thinking Indicator
**Priority:** Medium
**Effort:** Medium

Show visual feedback when Claude is processing:

- [ ] Detect when Claude is "thinking" (analyzing input, no output yet)
- [ ] Add subtle animation in terminal header or status bar
- [ ] Show elapsed time for long-running operations
- [ ] Clear indicator when Claude starts outputting response

**Implementation Notes:**
- Could detect based on PTY activity patterns
- Alternatively, parse Claude's output for thinking indicators
- Keep animation subtle to avoid distraction

---

## Phase 3: Discoverability & Feedback

### 3a. Keyboard Shortcut Hints
**Priority:** Low
**Effort:** Small

Add shortcut hints to buttons and actions:

- [ ] Inspect button: Show "(Ctrl+I)" hint
- [ ] Freeze hover: Already shows "(F)" - consistent
- [ ] Send to Claude: Show "(Enter)" hint in prompt area
- [ ] Refresh: Show "(Ctrl+R)" or "(F5)" hint
- [ ] Add tooltips on hover with full shortcut description

**Implementation Notes:**
- Use `title` attribute for simple tooltips
- Consider dedicated tooltip component for richer hints
- Ensure hints don't clutter minimal UI

---

### 3b. Enhanced Status Bar
**Priority:** Low
**Effort:** Medium

Improve status bar with more contextual information:

- [ ] Show current project name
- [ ] Show server type (Dev Server vs Static)
- [ ] Show port number
- [ ] Show Playwright connection status icon
- [ ] Show viewport size when constrained
- [ ] Add click actions (e.g., click port to copy URL)

**Current Status Bar:**
```
[Status indicator] Connected
```

**Proposed Status Bar:**
```
[Project: my-app] [Dev Server :5173] [Playwright ✓] [1280px]
```

**Implementation Notes:**
- Keep it compact - use icons where possible
- Make sections clickable for quick actions
- Consider collapsing on narrow windows

---

## Phase 4: Visual Polish

### 4a. Header Refinement
**Priority:** Low
**Effort:** Small

- [ ] Review spacing and alignment in browser header
- [ ] Ensure URL input has proper focus states
- [ ] Add subtle hover states to header buttons
- [ ] Consider adding project dropdown in header

---

### 4b. Button Consistency
**Priority:** Low
**Effort:** Small

- [ ] Audit all buttons for consistent sizing
- [ ] Ensure hover/active states are smooth (150-200ms transitions)
- [ ] Verify focus states for keyboard navigation
- [ ] Check disabled states have proper visual feedback

---

### 4c. Resizer Improvements
**Priority:** Low
**Effort:** Small

- [ ] Add visual indicator when hovering resizer
- [ ] Consider minimum panel widths to prevent UI breakage
- [ ] Persist panel widths across sessions
- [ ] Add double-click to reset to default widths

---

### 4d. Overall Refinement
**Priority:** Low
**Effort:** Medium

- [ ] Review color consistency across light/dark themes
- [ ] Audit font sizes for hierarchy
- [ ] Check spacing consistency (use 4px/8px grid)
- [ ] Review loading states across all flows
- [ ] Test at various window sizes (1280, 1440, 1920)

---

## Completed Items

### Phase 1 (Completed 2026-01-11)

- [x] **1a. Replace emoji placeholders with SVG icons**
  - Replaced emoji icons with Nerd Font icons in terminal
  - Added semantic icon mapping for MCP tool outputs

- [x] **1b. Add loading spinner during page navigation**
  - Added loading overlay with spinner
  - Shows during navigation, refresh, and project loading
  - Aligned timing with actual page load completion

- [x] **1c. Improve modal button visual hierarchy**
  - Primary/secondary button distinction
  - Proper focus states and hover effects

---

## Implementation Order (Suggested)

1. **Copy buttons (2b)** - Quick win, high value
2. **Keyboard shortcut hints (3a)** - Easy, improves discoverability
3. **Status bar enhancements (3b)** - Medium effort, good feedback
4. **Claude thinking indicator (2c)** - Requires PTY analysis
5. **Phase 4 polish** - Final pass before release

---

## Design Principles

1. **Minimal but helpful** - Don't add UI unless it solves a real problem
2. **Consistent** - Follow existing patterns in the codebase
3. **Accessible** - Keyboard navigation, focus states, contrast
4. **Performant** - No heavy animations, efficient updates
5. **Professional** - No emojis as icons, proper spacing, smooth transitions
