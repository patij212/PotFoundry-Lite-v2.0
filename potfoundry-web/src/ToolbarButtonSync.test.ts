/**
 * Unit tests for ToolbarButtonSync module.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createToolbarButtonSync,
  type ToolbarButtonSync,
  type ToolbarStateSlice,
} from './ToolbarButtonSync';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock button element with the specified selector attribute.
 */
function createMockButton(selector: string): HTMLButtonElement {
  const btn = document.createElement('button');

  // Parse selector to set appropriate attributes
  if (selector.startsWith('[data-role=')) {
    const match = selector.match(/\[data-role="([^"]+)"\]/);
    if (match) {
      btn.dataset.role = match[1];
    }
  } else if (selector.startsWith('[data-wgpu-action=')) {
    const match = selector.match(/\[data-wgpu-action="([^"]+)"\]/);
    if (match) {
      btn.dataset.wgpuAction = match[1];
    }
  } else if (selector.startsWith('#')) {
    btn.id = selector.slice(1);
  }

  return btn;
}

/**
 * Default state for testing.
 */
function createDefaultState(): ToolbarStateSlice {
  return {
    autoRotate: false,
    projectionMode: 'ortho',
    debugOverlay: false,
    showGrid: true,
    showAxis: true,
    cameraMode: 'turntable',
    autoPivotFromCamera: false,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ToolbarButtonSync', () => {
  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let toolbar: ToolbarButtonSync;

  beforeEach(() => {
    // Create container and canvas in DOM
    container = document.createElement('div');
    container.id = 'controls';
    canvas = document.createElement('canvas');
    container.appendChild(canvas);
    document.body.appendChild(container);
  });

  afterEach(() => {
    toolbar?.dispose();
    document.body.innerHTML = '';
  });

  describe('createToolbarButtonSync', () => {
    it('creates a toolbar sync instance', () => {
      toolbar = createToolbarButtonSync({
        controlsRoot: container,
        canvas,
      });

      expect(toolbar).toBeDefined();
      expect(toolbar.updateAll).toBeInstanceOf(Function);
      expect(toolbar.dispose).toBeInstanceOf(Function);
    });

    it('works without controlsRoot', () => {
      toolbar = createToolbarButtonSync({
        controlsRoot: null,
        canvas,
      });

      expect(toolbar).toBeDefined();
    });
  });

  describe('resolveButton', () => {
    it('resolves button from controlsRoot first', () => {
      const btn = createMockButton('[data-role="autorotate"]');
      container.appendChild(btn);

      toolbar = createToolbarButtonSync({
        controlsRoot: container,
        canvas,
      });

      const resolved = toolbar.resolveButton('[data-role="autorotate"]');
      expect(resolved).toBe(btn);
    });

    it('resolves button from canvas parent as fallback', () => {
      const btn = createMockButton('[data-wgpu-action="grid"]');
      container.appendChild(btn);

      toolbar = createToolbarButtonSync({
        controlsRoot: null, // No controlsRoot
        canvas,
      });

      const resolved = toolbar.resolveButton('[data-wgpu-action="grid"]');
      expect(resolved).toBe(btn);
    });

    it('returns null for missing buttons', () => {
      toolbar = createToolbarButtonSync({
        controlsRoot: container,
        canvas,
      });

      const resolved = toolbar.resolveButton('[data-role="nonexistent"]');
      expect(resolved).toBeNull();
    });
  });

  describe('updateAutoButton', () => {
    it('updates button for autoRotate=true', () => {
      const btn = createMockButton('[data-role="autorotate"]');
      container.appendChild(btn);

      toolbar = createToolbarButtonSync({
        controlsRoot: container,
        canvas,
      });

      toolbar.updateAutoButton(true);

      expect(btn.dataset.state).toBe('on');
      expect(btn.getAttribute('aria-pressed')).toBe('true');
      expect(btn.textContent).toBe('Auto');
    });

    it('updates button for autoRotate=false', () => {
      const btn = createMockButton('[data-role="autorotate"]');
      container.appendChild(btn);

      toolbar = createToolbarButtonSync({
        controlsRoot: container,
        canvas,
      });

      toolbar.updateAutoButton(false);

      expect(btn.dataset.state).toBe('off');
      expect(btn.getAttribute('aria-pressed')).toBe('false');
      expect(btn.textContent).toBe('Manual');
    });

    it('handles missing button gracefully', () => {
      toolbar = createToolbarButtonSync({
        controlsRoot: container,
        canvas,
      });

      // Should not throw
      expect(() => toolbar.updateAutoButton(true)).not.toThrow();
    });
  });

  describe('updateProjectionButton', () => {
    it('updates for perspective mode', () => {
      const btn = createMockButton('[data-wgpu-action="projection"]');
      container.appendChild(btn);

      toolbar = createToolbarButtonSync({
        controlsRoot: container,
        canvas,
      });

      toolbar.updateProjectionButton('perspective');

      expect(btn.dataset.state).toBe('perspective');
      expect(btn.getAttribute('aria-pressed')).toBe('true');
      expect(btn.textContent).toBe('Persp');
    });

    it('updates for ortho mode', () => {
      const btn = createMockButton('[data-wgpu-action="projection"]');
      container.appendChild(btn);

      toolbar = createToolbarButtonSync({
        controlsRoot: container,
        canvas,
      });

      toolbar.updateProjectionButton('ortho');

      expect(btn.dataset.state).toBe('ortho');
      expect(btn.getAttribute('aria-pressed')).toBe('false');
      expect(btn.textContent).toBe('Ortho');
    });
  });

  describe('updateDebugButton', () => {
    it('updates for debug enabled', () => {
      const btn = createMockButton('[data-wgpu-action="debug"]');
      container.appendChild(btn);

      toolbar = createToolbarButtonSync({
        controlsRoot: container,
        canvas,
      });

      toolbar.updateDebugButton(true);

      expect(btn.dataset.state).toBe('on');
      expect(btn.getAttribute('aria-pressed')).toBe('true');
      expect(btn.textContent).toBe('Debug*');
    });

    it('updates for debug disabled', () => {
      const btn = createMockButton('[data-wgpu-action="debug"]');
      container.appendChild(btn);

      toolbar = createToolbarButtonSync({
        controlsRoot: container,
        canvas,
      });

      toolbar.updateDebugButton(false);

      expect(btn.dataset.state).toBe('off');
      expect(btn.getAttribute('aria-pressed')).toBe('false');
      expect(btn.textContent).toBe('Debug');
    });
  });

  describe('updateGridButton', () => {
    it('updates for grid visible', () => {
      const btn = createMockButton('[data-wgpu-action="grid"]');
      container.appendChild(btn);

      toolbar = createToolbarButtonSync({
        controlsRoot: container,
        canvas,
      });

      toolbar.updateGridButton(true);

      expect(btn.dataset.state).toBe('on');
      expect(btn.getAttribute('aria-pressed')).toBe('true');
      expect(btn.textContent).toBe('Grid*');
    });

    it('updates for grid hidden', () => {
      const btn = createMockButton('[data-wgpu-action="grid"]');
      container.appendChild(btn);

      toolbar = createToolbarButtonSync({
        controlsRoot: container,
        canvas,
      });

      toolbar.updateGridButton(false);

      expect(btn.dataset.state).toBe('off');
      expect(btn.getAttribute('aria-pressed')).toBe('false');
      expect(btn.textContent).toBe('Grid');
    });
  });

  describe('updateAxisButton', () => {
    it('updates for axis visible', () => {
      const btn = createMockButton('[data-wgpu-action="axis"]');
      container.appendChild(btn);

      toolbar = createToolbarButtonSync({
        controlsRoot: container,
        canvas,
      });

      toolbar.updateAxisButton(true);

      expect(btn.dataset.state).toBe('on');
      expect(btn.getAttribute('aria-pressed')).toBe('true');
      expect(btn.textContent).toBe('Axis*');
    });

    it('uses fallback selector when primary not found', () => {
      const btn = createMockButton('#wgpu-toggle-axis');
      container.appendChild(btn);

      toolbar = createToolbarButtonSync({
        controlsRoot: container,
        canvas,
      });

      toolbar.updateAxisButton(true);

      expect(btn.textContent).toBe('Axis*');
    });
  });

  describe('updateArcballButton', () => {
    it('updates for arcball mode active', () => {
      const btn = createMockButton('[data-wgpu-action="arcball"]');
      container.appendChild(btn);

      toolbar = createToolbarButtonSync({
        controlsRoot: container,
        canvas,
      });

      toolbar.updateArcballButton('arcball');

      expect(btn.getAttribute('data-state')).toBe('on');
      expect(btn.getAttribute('aria-pressed')).toBe('true');
      expect(btn.textContent).toBe('Arc*');
    });

    it('updates for arcball mode inactive', () => {
      const btn = createMockButton('[data-wgpu-action="arcball"]');
      container.appendChild(btn);

      toolbar = createToolbarButtonSync({
        controlsRoot: container,
        canvas,
      });

      toolbar.updateArcballButton('turntable');

      expect(btn.getAttribute('data-state')).toBe('off');
      expect(btn.getAttribute('aria-pressed')).toBe('false');
      expect(btn.textContent).toBe('Arc');
    });
  });

  describe('updateFreeButton', () => {
    it('updates for free mode active', () => {
      const btn = createMockButton('[data-wgpu-action="fly"]');
      container.appendChild(btn);

      toolbar = createToolbarButtonSync({
        controlsRoot: container,
        canvas,
      });

      toolbar.updateFreeButton('free');

      expect(btn.getAttribute('data-state')).toBe('on');
      expect(btn.getAttribute('aria-pressed')).toBe('true');
      expect(btn.textContent).toBe('Free*');
    });

    it('uses fallback selector', () => {
      const btn = createMockButton('#wgpu-toggle-fly');
      container.appendChild(btn);

      toolbar = createToolbarButtonSync({
        controlsRoot: container,
        canvas,
      });

      toolbar.updateFreeButton('free');

      expect(btn.textContent).toBe('Free*');
    });
  });

  describe('updatePivotAutoButton', () => {
    it('updates for auto-pivot enabled', () => {
      const btn = createMockButton('[data-wgpu-action="pivot-auto"]');
      container.appendChild(btn);

      toolbar = createToolbarButtonSync({
        controlsRoot: container,
        canvas,
      });

      toolbar.updatePivotAutoButton(true);

      expect(btn.dataset.state).toBe('on');
      expect(btn.getAttribute('aria-pressed')).toBe('true');
      expect(btn.textContent).toBe('Pivot*');
    });

    it('updates for auto-pivot disabled', () => {
      const btn = createMockButton('[data-wgpu-action="pivot-auto"]');
      container.appendChild(btn);

      toolbar = createToolbarButtonSync({
        controlsRoot: container,
        canvas,
      });

      toolbar.updatePivotAutoButton(false);

      expect(btn.dataset.state).toBe('off');
      expect(btn.getAttribute('aria-pressed')).toBe('false');
      expect(btn.textContent).toBe('Pivot');
    });
  });

  describe('updateCameraModeButtons', () => {
    it('updates both arcball and free buttons', () => {
      const arcBtn = createMockButton('[data-wgpu-action="arcball"]');
      const freeBtn = createMockButton('[data-wgpu-action="fly"]');
      container.appendChild(arcBtn);
      container.appendChild(freeBtn);

      toolbar = createToolbarButtonSync({
        controlsRoot: container,
        canvas,
      });

      toolbar.updateCameraModeButtons('arcball');

      expect(arcBtn.getAttribute('data-state')).toBe('on');
      expect(freeBtn.getAttribute('data-state')).toBe('off');
    });
  });

  describe('updateAll', () => {
    it('updates all buttons from state', () => {
      // Create all buttons
      const autoBtn = createMockButton('[data-role="autorotate"]');
      const projBtn = createMockButton('[data-wgpu-action="projection"]');
      const debugBtn = createMockButton('[data-wgpu-action="debug"]');
      const gridBtn = createMockButton('[data-wgpu-action="grid"]');
      const axisBtn = createMockButton('[data-wgpu-action="axis"]');
      const arcBtn = createMockButton('[data-wgpu-action="arcball"]');
      const freeBtn = createMockButton('[data-wgpu-action="fly"]');
      const pivotBtn = createMockButton('[data-wgpu-action="pivot-auto"]');

      container.append(autoBtn, projBtn, debugBtn, gridBtn, axisBtn, arcBtn, freeBtn, pivotBtn);

      toolbar = createToolbarButtonSync({
        controlsRoot: container,
        canvas,
      });

      const state: ToolbarStateSlice = {
        autoRotate: true,
        projectionMode: 'perspective',
        debugOverlay: true,
        showGrid: false,
        showAxis: false,
        cameraMode: 'arcball',
        autoPivotFromCamera: true,
      };

      toolbar.updateAll(state);

      expect(autoBtn.textContent).toBe('Auto');
      expect(projBtn.textContent).toBe('Persp');
      expect(debugBtn.textContent).toBe('Debug*');
      expect(gridBtn.textContent).toBe('Grid');
      expect(axisBtn.textContent).toBe('Axis');
      expect(arcBtn.textContent).toBe('Arc*');
      expect(freeBtn.textContent).toBe('Free');
      expect(pivotBtn.textContent).toBe('Pivot*');
    });
  });

  describe('dispose', () => {
    it('clears cached button references', () => {
      const btn = createMockButton('[data-role="autorotate"]');
      container.appendChild(btn);

      toolbar = createToolbarButtonSync({
        controlsRoot: container,
        canvas,
      });

      // Trigger caching
      toolbar.updateAutoButton(true);

      // Dispose
      toolbar.dispose();

      // After dispose, the instance should still be usable but will re-resolve buttons
      // This just ensures dispose doesn't throw
      expect(() => toolbar.dispose()).not.toThrow();
    });
  });

  describe('button caching', () => {
    it('caches button references for performance', () => {
      const btn = createMockButton('[data-role="autorotate"]');
      container.appendChild(btn);

      toolbar = createToolbarButtonSync({
        controlsRoot: container,
        canvas,
      });

      // First call resolves and caches
      toolbar.updateAutoButton(true);
      expect(btn.textContent).toBe('Auto');

      // Modify button externally
      btn.textContent = 'Modified';

      // Second call uses cached reference
      toolbar.updateAutoButton(false);
      expect(btn.textContent).toBe('Manual');
    });

    it('re-resolves button if disconnected from DOM', () => {
      const btn1 = createMockButton('[data-role="autorotate"]');
      container.appendChild(btn1);

      toolbar = createToolbarButtonSync({
        controlsRoot: container,
        canvas,
      });

      // Cache btn1
      toolbar.updateAutoButton(true);
      expect(btn1.textContent).toBe('Auto');

      // Remove btn1 and add btn2
      btn1.remove();
      const btn2 = createMockButton('[data-role="autorotate"]');
      container.appendChild(btn2);

      // Should resolve btn2 since btn1 is disconnected
      toolbar.updateAutoButton(false);
      expect(btn2.textContent).toBe('Manual');
    });
  });
});
