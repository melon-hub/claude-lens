/**
 * Send to Claude Handlers
 *
 * All handlers for sending context to Claude.
 */

import { terminal } from '../terminal';
import { state, consoleBuffer, clearSelectedElements } from '../state';
import { setStatus, showThinking, hideThinking } from '../ui-helpers';
import {
  updateElementChips,
  resetContextPanelUI,
  clearInspectSequenceUI,
  clearToastCaptures,
} from '../panels';
import {
  formatElements,
  formatSequence,
  formatConsole,
} from '../context-formatter';
import {
  clearSequenceBtn,
  sendSequenceBtn,
  clearToastsBtn,
  sendToastsBtn,
  consoleSendBtn,
  sendPromptBtn,
  promptInput,
} from '../setup';

/**
 * Set up all send-to-Claude event handlers
 */
export function setupSendHandlers(): void {
  // Inspect sequence clear button (Phase 2)
  clearSequenceBtn.addEventListener('click', () => {
    clearInspectSequenceUI();
    setStatus('Sequence cleared', true);
  });

  // Inspect sequence send button (Phase 2)
  sendSequenceBtn.addEventListener('click', async () => {
    if (!state.claudeRunning) {
      alert('Start Claude first!');
      return;
    }

    if (state.inspectSequence.length === 0) {
      alert('No interactions captured. Click elements in Inspect mode first.');
      return;
    }

    // Format sequence using optimized formatter (prioritizes file:line > component > selector)
    const sequenceContext = formatSequence(state.inspectSequence);
    const fullPrompt = `Here is the captured interaction sequence:\n\n${sequenceContext}`;
    showThinking();
    const result = await window.claudeLens.sendToClaude(fullPrompt, '');

    if (result.success) {
      // Clear sequence after sending
      clearInspectSequenceUI();
      terminal.focus();
      setStatus('Sequence sent to Claude', true);
    } else {
      hideThinking();
      alert('Failed to send to Claude');
    }
  });

  // Toast capture clear button (Phase 4)
  clearToastsBtn.addEventListener('click', () => {
    clearToastCaptures();
    setStatus('Toasts cleared', true);
  });

  // Toast capture send button (Phase 4)
  sendToastsBtn.addEventListener('click', async () => {
    if (!state.claudeRunning) {
      alert('Start Claude first!');
      return;
    }

    if (state.capturedToasts.length === 0) {
      alert('No toasts captured yet.');
      return;
    }

    // Format lean toast context
    let toastContext = `## Toast Notifications (${state.capturedToasts.length})\n\n`;

    for (const toast of state.capturedToasts) {
      toastContext += `- [${toast.type.toUpperCase()}] ${toast.text}\n`;
    }

    const fullPrompt = `Here are the captured toast notifications:\n\n${toastContext}`;
    showThinking();
    const result = await window.claudeLens.sendToClaude(fullPrompt, '');

    if (result.success) {
      clearToastCaptures();
      terminal.focus();
      setStatus('Toasts sent to Claude', true);
    } else {
      hideThinking();
      alert('Failed to send to Claude');
    }
  });

  // Send console to Claude button
  consoleSendBtn.addEventListener('click', async () => {
    if (!state.claudeRunning) {
      alert('Start Claude first!');
      return;
    }

    if (consoleBuffer.length === 0) {
      alert('No console messages to send');
      return;
    }

    // Format console using optimized formatter
    const consoleContext = formatConsole(consoleBuffer.toArray());
    showThinking();
    const result = await window.claudeLens.sendToClaude(`Here are the browser console messages:\n\n${consoleContext}`, '');

    if (result.success) {
      terminal.focus();
      setStatus('Console sent to Claude', true);
    } else {
      hideThinking();
      alert('Failed to send to Claude');
    }
  });

  // Send to Claude (main send button)
  sendPromptBtn.addEventListener('click', async () => {
    const prompt = promptInput.value.trim();

    if (!state.claudeRunning) {
      alert('Start Claude first!');
      return;
    }

    // Require either a prompt or selected elements
    if (!prompt && state.selectedElements.length === 0) {
      return;
    }

    if (state.selectedElements.length === 0) {
      // Send prompt without element context
      showThinking();
      window.claudeLens.pty.write(prompt + '\n');
      promptInput.value = '';
      terminal.focus();
      return;
    }

    // Format element context using the optimized formatter
    // Lean mode prioritizes: file:line > component name > searchable text
    // Detailed mode includes: selector, classes, styles, position
    const elementContext = formatElements(state.selectedElements, { mode: state.contextMode });

    // If no prompt, use a default instruction
    const finalPrompt = prompt || 'Here is the element I selected:';
    const fullPrompt = `${finalPrompt}\n\n${elementContext}`;
    showThinking();
    const result = await window.claudeLens.sendToClaude(fullPrompt, '');

    if (result.success) {
      promptInput.value = '';
      terminal.focus();
      setStatus('Sent to Claude', true);
      // Delay clearing context to let Claude's output appear first (smoother transition)
      setTimeout(() => {
        clearSelectedElements();
        updateElementChips();
        resetContextPanelUI();
      }, 500);
    } else {
      hideThinking();
      alert('Failed to send to Claude');
    }
  });

  // Enter to send prompt
  promptInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendPromptBtn.click();
    }
  });
}
