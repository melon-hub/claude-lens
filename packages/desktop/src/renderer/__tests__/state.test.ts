import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getState,
  updateState,
  subscribe,
  resetState,
  state,
  addSelectedElement,
  removeSelectedElement,
  clearSelectedElements,
  addToInspectSequence,
  clearInspectSequence,
  addCapturedToast,
  clearCapturedToasts,
  consoleBuffer,
  addConsoleMessage,
  clearConsoleMessages,
  DRAWER_HEIGHT,
  MAX_CONSOLE_MESSAGES,
} from '../state';
import type { ElementInfo, CapturedInteraction, ToastCapture } from '../types';

describe('State Management', () => {
  beforeEach(() => {
    resetState();
  });

  describe('getState', () => {
    it('should return initial state', () => {
      const s = getState();
      expect(s.claudeRunning).toBe(false);
      expect(s.browserLoaded).toBe(false);
      expect(s.inspectMode).toBe(false);
      expect(s.selectedElements).toEqual([]);
      expect(s.contextMode).toBe('lean');
    });
  });

  describe('updateState', () => {
    it('should update single value', () => {
      updateState({ claudeRunning: true });
      expect(getState().claudeRunning).toBe(true);
    });

    it('should update multiple values', () => {
      updateState({
        claudeRunning: true,
        browserLoaded: true,
        currentProjectName: 'test-project',
      });
      const s = getState();
      expect(s.claudeRunning).toBe(true);
      expect(s.browserLoaded).toBe(true);
      expect(s.currentProjectName).toBe('test-project');
    });

    it('should preserve other values when updating', () => {
      updateState({ claudeRunning: true });
      updateState({ browserLoaded: true });
      const s = getState();
      expect(s.claudeRunning).toBe(true);
      expect(s.browserLoaded).toBe(true);
    });
  });

  describe('subscribe', () => {
    it('should notify listeners on state change', () => {
      const listener = vi.fn();
      subscribe(listener);

      updateState({ claudeRunning: true });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ claudeRunning: true }),
        ['claudeRunning']
      );
    });

    it('should pass changed keys to listener', () => {
      const listener = vi.fn();
      subscribe(listener);

      updateState({ claudeRunning: true, browserLoaded: true });

      expect(listener).toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining(['claudeRunning', 'browserLoaded'])
      );
    });

    it('should return unsubscribe function', () => {
      const listener = vi.fn();
      const unsubscribe = subscribe(listener);

      updateState({ claudeRunning: true });
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();

      updateState({ browserLoaded: true });
      expect(listener).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    it('should handle listener errors gracefully', () => {
      const errorListener = vi.fn(() => {
        throw new Error('Test error');
      });
      const goodListener = vi.fn();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      subscribe(errorListener);
      subscribe(goodListener);

      updateState({ claudeRunning: true });

      expect(goodListener).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('resetState', () => {
    it('should reset all values to initial state', () => {
      updateState({
        claudeRunning: true,
        browserLoaded: true,
        currentProjectName: 'test',
        selectedElements: [{ selector: 'test' } as ElementInfo],
      });

      resetState();

      const s = getState();
      expect(s.claudeRunning).toBe(false);
      expect(s.browserLoaded).toBe(false);
      expect(s.currentProjectName).toBe('');
      expect(s.selectedElements).toEqual([]);
    });

    it('should notify listeners on reset', () => {
      const listener = vi.fn();
      subscribe(listener);

      resetState();

      expect(listener).toHaveBeenCalled();
    });

    it('should clear console buffer on reset', () => {
      addConsoleMessage({ level: 'error', message: 'test', timestamp: Date.now() });
      expect(consoleBuffer.length).toBe(1);

      resetState();

      expect(consoleBuffer.length).toBe(0);
    });
  });

  describe('state getters', () => {
    it('should provide convenient access to state values', () => {
      updateState({
        claudeRunning: true,
        viewportWidth: 1024,
        currentProjectName: 'my-app',
      });

      expect(state.claudeRunning).toBe(true);
      expect(state.viewportWidth).toBe(1024);
      expect(state.currentProjectName).toBe('my-app');
    });
  });

  describe('Element selection helpers', () => {
    const mockElement: ElementInfo = {
      tagName: 'button',
      id: 'submit',
      classes: ['btn'],
      selector: '#submit',
      text: 'Submit',
      position: { x: 0, y: 0, width: 100, height: 40 },
      styles: {},
      attributes: {},
    };

    it('should add element to selection', () => {
      addSelectedElement(mockElement);
      expect(state.selectedElements).toHaveLength(1);
      expect(state.selectedElements[0]).toEqual(mockElement);
    });

    it('should not add duplicate elements', () => {
      addSelectedElement(mockElement);
      addSelectedElement(mockElement);
      expect(state.selectedElements).toHaveLength(1);
    });

    it('should remove element from selection', () => {
      addSelectedElement(mockElement);
      removeSelectedElement('#submit');
      expect(state.selectedElements).toHaveLength(0);
    });

    it('should clear all selected elements', () => {
      addSelectedElement(mockElement);
      addSelectedElement({ ...mockElement, selector: '#other' });
      clearSelectedElements();
      expect(state.selectedElements).toHaveLength(0);
    });
  });

  describe('Inspect sequence helpers', () => {
    const mockInteraction: CapturedInteraction = {
      element: {
        tagName: 'button',
        id: 'btn',
        classes: [],
        selector: '#btn',
        text: 'Click',
        position: { x: 0, y: 0, width: 100, height: 40 },
        styles: {},
        attributes: {},
      },
      action: 'click',
      result: 'success',
      timestamp: Date.now(),
    };

    it('should add to inspect sequence', () => {
      addToInspectSequence(mockInteraction);
      expect(state.inspectSequence).toHaveLength(1);
    });

    it('should clear inspect sequence', () => {
      addToInspectSequence(mockInteraction);
      clearInspectSequence();
      expect(state.inspectSequence).toHaveLength(0);
    });
  });

  describe('Toast capture helpers', () => {
    const mockToast: ToastCapture = {
      text: 'Success!',
      type: 'success',
      timestamp: Date.now(),
    };

    it('should add captured toast', () => {
      addCapturedToast(mockToast);
      expect(state.capturedToasts).toHaveLength(1);
    });

    it('should clear captured toasts', () => {
      addCapturedToast(mockToast);
      clearCapturedToasts();
      expect(state.capturedToasts).toHaveLength(0);
    });
  });

  describe('Console message helpers', () => {
    it('should add console message', () => {
      addConsoleMessage({ level: 'error', message: 'Test error', timestamp: Date.now() });
      expect(consoleBuffer.length).toBe(1);
    });

    it('should clear console messages', () => {
      addConsoleMessage({ level: 'error', message: 'Test', timestamp: Date.now() });
      clearConsoleMessages();
      expect(consoleBuffer.length).toBe(0);
    });
  });

  describe('Constants', () => {
    it('should export DRAWER_HEIGHT', () => {
      expect(DRAWER_HEIGHT).toBe(235);
    });

    it('should export MAX_CONSOLE_MESSAGES', () => {
      expect(MAX_CONSOLE_MESSAGES).toBe(50);
    });
  });
});
