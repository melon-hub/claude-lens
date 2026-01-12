/**
 * Centralized state management for the renderer
 *
 * This module provides a simple reactive state container that allows
 * components to subscribe to state changes.
 */

import type { ElementInfo, CapturedInteraction, ToastCapture } from '../types';
import type { ContextMode } from '../context-formatter';
import { CircularBuffer } from '@claude-lens/core';

/**
 * Console message type
 */
export interface ConsoleMessage {
  level: string;
  message: string;
  timestamp: number;
}

/**
 * Application state interface
 */
export interface AppState {
  // Core UI state
  claudeRunning: boolean;
  browserLoaded: boolean;
  inspectMode: boolean;
  consoleDrawerOpen: boolean;
  hoverFrozen: boolean;
  isThinking: boolean;

  // Element selection
  selectedElements: ElementInfo[];
  contextMode: ContextMode;

  // Inspect sequence (Phase 2)
  inspectSequence: CapturedInteraction[];

  // Toast captures (Phase 4)
  capturedToasts: ToastCapture[];

  // Viewport
  viewportWidth: number;

  // Project/Server state
  currentProjectName: string;
  currentServerPort: number;
  currentServerType: 'dev' | 'static' | null;
  playwrightConnected: boolean;

  // Thinking timeout (internal)
  thinkingTimeout: ReturnType<typeof setTimeout> | null;
}

/**
 * State change listener type
 */
type StateListener = (state: AppState, changedKeys: (keyof AppState)[]) => void;

/**
 * Constants
 */
export const DRAWER_HEIGHT = 235;
export const MAX_CONSOLE_MESSAGES = 50;

/**
 * Console message buffer - separate from main state for performance
 */
export const consoleBuffer = new CircularBuffer<ConsoleMessage>(MAX_CONSOLE_MESSAGES);

/**
 * Initial state values
 */
const initialState: AppState = {
  claudeRunning: false,
  browserLoaded: false,
  inspectMode: false,
  consoleDrawerOpen: false,
  hoverFrozen: false,
  isThinking: false,
  selectedElements: [],
  contextMode: 'lean',
  inspectSequence: [],
  capturedToasts: [],
  viewportWidth: 0,
  currentProjectName: '',
  currentServerPort: 0,
  currentServerType: null,
  playwrightConnected: false,
  thinkingTimeout: null,
};

/**
 * Current state - mutable internal reference
 */
let currentState: AppState = { ...initialState };

/**
 * Subscribers list
 */
const listeners: Set<StateListener> = new Set();

/**
 * Get the current state (read-only snapshot)
 */
export function getState(): Readonly<AppState> {
  return currentState;
}

/**
 * Update state with partial values
 * Notifies all subscribers with the changed keys
 */
export function updateState(partial: Partial<AppState>): void {
  const changedKeys = Object.keys(partial) as (keyof AppState)[];

  // Apply changes
  currentState = { ...currentState, ...partial };

  // Notify listeners
  for (const listener of listeners) {
    try {
      listener(currentState, changedKeys);
    } catch (err) {
      console.error('[State] Listener error:', err);
    }
  }
}

/**
 * Subscribe to state changes
 * Returns an unsubscribe function
 */
export function subscribe(listener: StateListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Reset state to initial values
 * Useful for testing and project close
 */
export function resetState(): void {
  // Clear any pending timeout
  if (currentState.thinkingTimeout) {
    clearTimeout(currentState.thinkingTimeout);
  }

  currentState = { ...initialState };
  consoleBuffer.clear();

  // Notify listeners of reset
  const allKeys = Object.keys(initialState) as (keyof AppState)[];
  for (const listener of listeners) {
    try {
      listener(currentState, allKeys);
    } catch (err) {
      console.error('[State] Listener error during reset:', err);
    }
  }
}

/**
 * Convenience getters for common state access patterns
 */
export const state = {
  get claudeRunning() {
    return currentState.claudeRunning;
  },
  get browserLoaded() {
    return currentState.browserLoaded;
  },
  get inspectMode() {
    return currentState.inspectMode;
  },
  get consoleDrawerOpen() {
    return currentState.consoleDrawerOpen;
  },
  get hoverFrozen() {
    return currentState.hoverFrozen;
  },
  get isThinking() {
    return currentState.isThinking;
  },
  get selectedElements() {
    return currentState.selectedElements;
  },
  get contextMode() {
    return currentState.contextMode;
  },
  get inspectSequence() {
    return currentState.inspectSequence;
  },
  get capturedToasts() {
    return currentState.capturedToasts;
  },
  get viewportWidth() {
    return currentState.viewportWidth;
  },
  get currentProjectName() {
    return currentState.currentProjectName;
  },
  get currentServerPort() {
    return currentState.currentServerPort;
  },
  get currentServerType() {
    return currentState.currentServerType;
  },
  get playwrightConnected() {
    return currentState.playwrightConnected;
  },
  get thinkingTimeout() {
    return currentState.thinkingTimeout;
  },
};

/**
 * Helper to add an element to selection
 */
export function addSelectedElement(element: ElementInfo): void {
  const existing = currentState.selectedElements.find(
    (e) => e.selector === element.selector
  );
  if (!existing) {
    updateState({
      selectedElements: [...currentState.selectedElements, element],
    });
  }
}

/**
 * Helper to remove an element from selection
 */
export function removeSelectedElement(selector: string): void {
  updateState({
    selectedElements: currentState.selectedElements.filter(
      (e) => e.selector !== selector
    ),
  });
}

/**
 * Helper to clear all selected elements
 */
export function clearSelectedElements(): void {
  updateState({ selectedElements: [] });
}

/**
 * Helper to add to inspect sequence
 */
export function addToInspectSequence(interaction: CapturedInteraction): void {
  updateState({
    inspectSequence: [...currentState.inspectSequence, interaction],
  });
}

/**
 * Helper to clear inspect sequence
 */
export function clearInspectSequence(): void {
  updateState({ inspectSequence: [] });
}

/**
 * Helper to add a captured toast
 */
export function addCapturedToast(toast: ToastCapture): void {
  updateState({
    capturedToasts: [...currentState.capturedToasts, toast],
  });
}

/**
 * Helper to clear captured toasts
 */
export function clearCapturedToasts(): void {
  updateState({ capturedToasts: [] });
}

/**
 * Helper to add a console message
 */
export function addConsoleMessage(msg: ConsoleMessage): void {
  consoleBuffer.push(msg);
}

/**
 * Helper to clear console messages
 */
export function clearConsoleMessages(): void {
  consoleBuffer.clear();
}
