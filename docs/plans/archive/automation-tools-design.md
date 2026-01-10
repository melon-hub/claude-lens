# Automation Tools Design

> Adding browser-use style capabilities to Claude Lens

**Status:** ✅ IMPLEMENTED (v0.2.1)
**Date:** 2026-01-09

> **Note:** This design document has been implemented. See [MCP-TOOLS.md](../api/MCP-TOOLS.md) for current tool documentation.

---

## Overview

Currently Claude Lens is **observation-focused**: you click, Claude sees. This document outlines adding **automation capabilities**: Claude clicks, types, scrolls - similar to browser-use, Playwright MCP, and Cursor's browser.

---

## Motivation

### Current Model (Observation)

```
User: *clicks button*
Claude: I see that button has wrong styles. Here's a fix...
User: Apply it
Claude: Done.
```

### Proposed Model (Observation + Automation)

```
User: Test the checkout flow with a $50 item

Claude: I'll test the checkout flow now.
        *navigates to /products*
        *clicks "Add to Cart" on first $50 item*
        *clicks cart icon*
        *clicks "Proceed to Checkout"*
        *fills shipping form*
        *clicks "Place Order"*

        Checkout completed successfully. Order confirmation shows #12345.
        Total was $53.50 (including $3.50 shipping).

        Want me to test with edge cases?
```

---

## Proposed MCP Tools

### 1. `claude_lens_click`

Click an element.

```typescript
interface ClickParams {
  selector: string;          // CSS selector
  button?: 'left' | 'right' | 'middle';
  doubleClick?: boolean;
  modifiers?: ('ctrl' | 'shift' | 'alt' | 'meta')[];
}

interface ClickResult {
  success: boolean;
  clicked: boolean;
  element?: {
    tagName: string;
    text: string;
    selector: string;
  };
  error?: string;
}
```

**Implementation via CDP:**
```typescript
async click(params: ClickParams): Promise<ClickResult> {
  const { selector, button = 'left', doubleClick = false } = params;

  // Find element and get coordinates
  const { result } = await this.client.Runtime.evaluate({
    expression: `
      const el = document.querySelector('${selector}');
      if (!el) throw new Error('Element not found');
      const rect = el.getBoundingClientRect();
      ({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        tagName: el.tagName,
        text: el.textContent?.slice(0, 50)
      })
    `,
    returnByValue: true
  });

  const { x, y, tagName, text } = result.value;

  // Perform click via CDP Input domain
  await this.client.Input.dispatchMouseEvent({
    type: 'mousePressed',
    x, y,
    button,
    clickCount: doubleClick ? 2 : 1
  });

  await this.client.Input.dispatchMouseEvent({
    type: 'mouseReleased',
    x, y,
    button,
    clickCount: doubleClick ? 2 : 1
  });

  return { success: true, clicked: true, element: { tagName, text, selector } };
}
```

---

### 2. `claude_lens_type`

Type text into an input field.

```typescript
interface TypeParams {
  selector: string;          // CSS selector for input
  text: string;              // Text to type
  clear?: boolean;           // Clear existing content first
  submit?: boolean;          // Press Enter after typing
  delay?: number;            // Delay between keystrokes (ms)
}

interface TypeResult {
  success: boolean;
  typed: string;
  submitted: boolean;
  error?: string;
}
```

**Implementation via CDP:**
```typescript
async type(params: TypeParams): Promise<TypeResult> {
  const { selector, text, clear = true, submit = false, delay = 0 } = params;

  // Focus the element
  await this.client.Runtime.evaluate({
    expression: `document.querySelector('${selector}')?.focus()`
  });

  // Clear if requested
  if (clear) {
    await this.client.Input.dispatchKeyEvent({ type: 'keyDown', key: 'a', modifiers: 2 }); // Ctrl+A
    await this.client.Input.dispatchKeyEvent({ type: 'keyUp', key: 'a' });
    await this.client.Input.dispatchKeyEvent({ type: 'keyDown', key: 'Backspace' });
    await this.client.Input.dispatchKeyEvent({ type: 'keyUp', key: 'Backspace' });
  }

  // Type each character
  for (const char of text) {
    await this.client.Input.dispatchKeyEvent({
      type: 'keyDown',
      text: char
    });
    await this.client.Input.dispatchKeyEvent({
      type: 'keyUp',
      text: char
    });
    if (delay > 0) await sleep(delay);
  }

  // Submit if requested
  if (submit) {
    await this.client.Input.dispatchKeyEvent({ type: 'keyDown', key: 'Enter' });
    await this.client.Input.dispatchKeyEvent({ type: 'keyUp', key: 'Enter' });
  }

  return { success: true, typed: text, submitted: submit };
}
```

---

### 3. `claude_lens_scroll`

Scroll the page or an element.

```typescript
interface ScrollParams {
  selector?: string;         // Element to scroll (omit for page)
  direction: 'up' | 'down' | 'left' | 'right';
  amount?: number;           // Pixels (default: viewport height/width)
  toElement?: string;        // Scroll until element is visible
}

interface ScrollResult {
  success: boolean;
  scrolledTo: { x: number; y: number };
  elementVisible?: boolean;
  error?: string;
}
```

**Implementation via CDP:**
```typescript
async scroll(params: ScrollParams): Promise<ScrollResult> {
  const { direction, amount, toElement } = params;

  if (toElement) {
    // Scroll element into view
    await this.client.Runtime.evaluate({
      expression: `document.querySelector('${toElement}')?.scrollIntoView({ behavior: 'smooth', block: 'center' })`
    });
  } else {
    // Scroll by amount
    const delta = amount || 500;
    const deltaX = direction === 'left' ? -delta : direction === 'right' ? delta : 0;
    const deltaY = direction === 'up' ? -delta : direction === 'down' ? delta : 0;

    await this.client.Input.dispatchMouseEvent({
      type: 'mouseWheel',
      x: 400, y: 300,
      deltaX, deltaY
    });
  }

  // Get current scroll position
  const { result } = await this.client.Runtime.evaluate({
    expression: `({ x: window.scrollX, y: window.scrollY })`,
    returnByValue: true
  });

  return { success: true, scrolledTo: result.value };
}
```

---

### 4. `claude_lens_hover`

Hover over an element (triggers :hover styles, tooltips, dropdowns).

```typescript
interface HoverParams {
  selector: string;
  duration?: number;         // How long to hover (ms, default: 0 = until next action)
}

interface HoverResult {
  success: boolean;
  hovering: boolean;
  element?: { tagName: string; text: string };
  error?: string;
}
```

---

### 5. `claude_lens_wait_for`

Wait for a condition before continuing.

```typescript
interface WaitForParams {
  selector?: string;         // Wait for element to appear
  text?: string;             // Wait for text to appear on page
  hidden?: string;           // Wait for element to disappear
  timeout?: number;          // Max wait time (ms, default: 5000)
  navigation?: boolean;      // Wait for navigation to complete
}

interface WaitForResult {
  success: boolean;
  found: boolean;
  timedOut: boolean;
  waitedMs: number;
  error?: string;
}
```

**Implementation via CDP:**
```typescript
async waitFor(params: WaitForParams): Promise<WaitForResult> {
  const { selector, text, hidden, timeout = 5000 } = params;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (selector) {
      const { result } = await this.client.Runtime.evaluate({
        expression: `!!document.querySelector('${selector}')`,
        returnByValue: true
      });
      if (result.value) return { success: true, found: true, timedOut: false, waitedMs: Date.now() - start };
    }

    if (hidden) {
      const { result } = await this.client.Runtime.evaluate({
        expression: `!document.querySelector('${hidden}')`,
        returnByValue: true
      });
      if (result.value) return { success: true, found: true, timedOut: false, waitedMs: Date.now() - start };
    }

    if (text) {
      const { result } = await this.client.Runtime.evaluate({
        expression: `document.body.textContent.includes('${text}')`,
        returnByValue: true
      });
      if (result.value) return { success: true, found: true, timedOut: false, waitedMs: Date.now() - start };
    }

    await sleep(100);
  }

  return { success: false, found: false, timedOut: true, waitedMs: timeout };
}
```

---

### 6. `claude_lens_select`

Select an option from a dropdown/select element.

```typescript
interface SelectParams {
  selector: string;          // Select element
  value?: string;            // Option value
  text?: string;             // Option text (visible label)
  index?: number;            // Option index
}

interface SelectResult {
  success: boolean;
  selected: string;
  error?: string;
}
```

---

### 7. `claude_lens_fill_form`

Fill multiple form fields at once (convenience wrapper).

```typescript
interface FillFormParams {
  fields: Array<{
    selector: string;
    value: string;
    type?: 'text' | 'select' | 'checkbox' | 'radio';
  }>;
  submit?: boolean;
  submitSelector?: string;
}

interface FillFormResult {
  success: boolean;
  filled: number;
  errors: string[];
}
```

---

## Safety Considerations

### 1. Confirmation Mode

For destructive actions, require user confirmation:

```typescript
interface ToolOptions {
  requireConfirmation?: boolean;  // Prompt user before executing
  dryRun?: boolean;               // Show what would happen without executing
}
```

### 2. Action Logging

Log all automated actions for audit:

```typescript
interface ActionLog {
  timestamp: Date;
  tool: string;
  params: unknown;
  result: unknown;
  screenshot?: string;  // Before/after screenshots
}
```

### 3. Rate Limiting

Prevent runaway automation:

```typescript
const RATE_LIMITS = {
  clicksPerMinute: 60,
  typingCharsPerSecond: 20,
  maxActionsPerTask: 100
};
```

### 4. Localhost Only

All automation is restricted to localhost URLs (same as observation tools).

---

## Integration with Existing Tools

The automation tools complement the existing observation tools:

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLAUDE LENS TOOLS                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  OBSERVATION (Current)           AUTOMATION (Proposed)           │
│  ─────────────────────           ──────────────────────          │
│  inspect_element                 click                           │
│  highlight_element               type                            │
│  get_console                     scroll                          │
│  screenshot                      hover                           │
│  navigate                        wait_for                        │
│                                  select                          │
│                                  fill_form                       │
│                                                                  │
│  "You click, Claude sees"        "Claude clicks, you watch"      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Example Workflows

### Testing a Form

```
User: Test the contact form with various inputs

Claude: I'll test the contact form systematically.

        Test 1: Empty submission
        *clicks submit button*
        ✓ Validation errors appeared for all required fields

        Test 2: Invalid email
        *types "notanemail" in email field*
        *clicks submit*
        ✓ "Invalid email" error appeared

        Test 3: Valid submission
        *fills name: "Test User"*
        *fills email: "test@example.com"*
        *fills message: "Test message"*
        *clicks submit*
        ✓ Success message: "Thanks for contacting us!"

        All tests passed. The form handles edge cases correctly.
```

### Debugging a Flow

```
User: The checkout keeps failing after clicking "Place Order". Debug it.

Claude: I'll step through the checkout flow and watch for errors.

        *navigates to /cart*
        *clicks "Proceed to Checkout"*
        Console: No errors

        *fills shipping form*
        *clicks "Continue to Payment"*
        Console: No errors

        *fills payment form*
        *clicks "Place Order"*
        Console: ❌ Error: "Uncaught TypeError: Cannot read property 'id' of undefined at checkout.js:142"

        Found it! The error is in checkout.js line 142. Looking at the network tab...
        The /api/orders endpoint returned 400 with: {"error": "shipping_method required"}

        The bug: The shipping method isn't being sent with the order.
        Want me to find where that's set in the code?
```

---

## Implementation Priority

| Phase | Tools | Rationale |
|-------|-------|-----------|
| **Phase 1** | `click`, `type`, `wait_for` | Core automation - covers 80% of use cases |
| **Phase 2** | `scroll`, `hover`, `select` | Enhanced interaction |
| **Phase 3** | `fill_form`, confirmation mode | Convenience + safety |

---

## Open Questions

1. **Should automation require explicit opt-in?** (e.g., `--enable-automation` flag)
2. **How to handle popups/alerts triggered by actions?**
3. **Should we support keyboard shortcuts?** (e.g., Ctrl+S to save)
4. **How to visualize automated actions in the UI?** (cursor movement, action log)

---

## Implementation Status

1. [x] Implement `click` tool as proof of concept
2. [x] Add all automation tools (25+ total)
3. [ ] Design UI for showing automated actions
4. [x] Test with real-world workflows
5. [ ] Gather feedback on safety/confirmation needs

**Implemented in v0.2.1** via Playwright connected to Electron's BrowserView through CDP.
