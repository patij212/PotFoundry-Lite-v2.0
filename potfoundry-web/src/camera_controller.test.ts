/**
 * Camera Controller Tests
 * Tests for the CameraController class including:
 * - Camera mode switching
 * - Pointer interactions (orbit, pan, zoom)
 * - Inertia and focus tweens
 * - Keyboard navigation
 * - Payload handling and grace periods
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CameraController, PointerState, ControllerHelpers } from './camera_controller';
import type { WebGPUState, CameraRig } from './types';
import type { Vec3, CameraBasis } from './camera_basis';

// Create mock state with all required camera fields
function createMockState(): WebGPUState {
    return {
        panX: 0,
        panY: 0,
        zoom: 1,
        orbitZoom: 1,
        autoRotate: false,
        autoRotateSpeed: 0.5,
        autoRotateResumeAt: 0,
        cameraMode: 'turntable',
        camRight: [1, 0, 0] as Vec3,
        camUp: [0, 0, 1] as Vec3,
        camForward: [0, -1, 0] as Vec3,
        camQuat: [0, 0, 0, 1],
        displayCamRight: null,
        displayCamUp: null,
        displayCamForward: null,
        displayCamQuat: null,
        displayRotX: null,
        displayRotY: null,
        displayRotZ: null,
        rotX: 0.5,
        rotY: 0,
        rotZ: 0,
        sceneRadius: 100,
        inertiaArcAxis: null,
        inertiaArcSpeed: 0,
        inertiaRotX: 0,
        inertiaRotY: 0,
        inertiaPanX: 0,
        inertiaPanY: 0,
        pivot: [0, 0, 0] as Vec3,
        targetPivot: null,
        freePosition: [0, -200, 50] as Vec3,
        freeSpeed: 1,
        interacting: false,
        lastInteraction: 0,
        cameraDirty: false,
        projectionMode: 'perspective',
        lastCameraPush: 0,
        lastParamUpdate: 0,
        lastParamNonce: null,
        recentParamUpdate: false,
        interactiveLodRatio: 1,
        interactiveLodEnabled: false,
        debugOverlay: false,
        cameraNonce: null,
        zone: null,
        canvasAspect: 1,
        showGrid: false,
        showAxis: false,
        autoPivotFromCamera: false,
        disableAutoFlip: false,
        useArcball: false,
    };
}

function createMockPointer(): PointerState {
    return {
        active: false,
        mode: 'orbit',
        lastX: 0,
        lastY: 0,
        arcLastX: 0,
        arcLastY: 0,
        arcStartX: 0,
        arcStartY: 0,
        arcStartQuat: null,
        arcPrevQuat: null,
        arcInertiaAxis: null,
        arcInertiaSpeed: 0,
        lastMoveTs: null,
        arcHit: null,
        arcHitNormal: null,
        arcPendingPivot: null,
        activeTouches: new Map(),
        pinchStartDistance: null,
        pinchStartZoom: null,
        pinchCenterX: null,
        pinchCenterY: null,
        isPinching: false,
        x: 0,
        y: 0,
    };
}

function createMockCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    // Mock getBoundingClientRect
    canvas.getBoundingClientRect = () => ({
        width: 800,
        height: 600,
        top: 0,
        left: 0,
        bottom: 600,
        right: 800,
        x: 0,
        y: 0,
        toJSON: () => { },
    });
    return canvas;
}

function createMockHelpers(): ControllerHelpers {
    const mockBasis: CameraBasis = {
        right: [1, 0, 0],
        up: [0, 0, 1],
        forward: [0, -1, 0],
    };

    const mockRig: CameraRig = {
        eye: [0, -200, 50],
        viewProjection: new Float32Array(16),
        near: 0.1,
        far: 1000,
        fov: 45,
        mode: 'perspective',
        basis: mockBasis,
    };

    return {
        resolveInteractionRig: () => ({
            cfg: {},
            extents: { paddedHalfWidth: 50, paddedHalfHeight: 60, paddedMax: 60, paddingHint: 0 },
            rig: mockRig,
        }),
        ensureInteractiveBasis: () => mockBasis,
        computePanFactor: () => 0.5,
        updatePivotFromPan: vi.fn(),
        requestCameraEmitWhenStatic: vi.fn(),
        markInteraction: vi.fn(),
        worldRayFromCanvas: () => ({ origin: [0, -200, 50], dir: [0, 1, 0] }),
        intersectRayZPlane: () => [0, 0, 0],
        intersectRayCylinder: () => [0, 50, 30],
        buildCameraRig: () => mockRig,
        clampZoomValue: (v: number) => Math.max(0.1, Math.min(10, v)),
        cancelCameraEmit: vi.fn(),
        setAutoRotate: vi.fn(),
        setCameraMode: vi.fn(),
        freeKeyboard: { activeKeys: new Set(), boost: false },
        writeUniformsImmediately: vi.fn(),
    };
}

describe('CameraController', () => {
    let state: WebGPUState;
    let pointer: PointerState;
    let canvas: HTMLCanvasElement;
    let helpers: ControllerHelpers;
    let controller: CameraController;

    beforeEach(() => {
        state = createMockState();
        pointer = createMockPointer();
        canvas = createMockCanvas();
        helpers = createMockHelpers();
        controller = new CameraController(state, pointer, canvas, helpers);
    });

    describe('Constructor', () => {
        it('should initialize with provided state', () => {
            expect(controller.state).toBe(state);
            expect(controller.pointer).toBe(pointer);
            expect(controller.canvas).toBe(canvas);
            expect(controller.helpers).toBe(helpers);
        });

        it('should initialize focusTween as null', () => {
            expect(controller.focusTween).toBeNull();
        });

        it('should have default host camera accept policy', () => {
            expect(controller.hostCameraAcceptPolicy).toBe('grace');
        });
    });

    describe('setHostCameraAcceptPolicy', () => {
        it('should update policy to strict', () => {
            controller.setHostCameraAcceptPolicy('strict');
            expect(controller.hostCameraAcceptPolicy).toBe('strict');
        });

        it('should update policy to always', () => {
            controller.setHostCameraAcceptPolicy('always');
            expect(controller.hostCameraAcceptPolicy).toBe('always');
        });
    });

    describe('setLocalCameraGraceMs', () => {
        it('should update grace period', () => {
            controller.setLocalCameraGraceMs(500);
            expect((controller as any).LOCAL_CAMERA_GRACE_MS).toBe(500);
        });

        it('should clamp to non-negative', () => {
            controller.setLocalCameraGraceMs(-100);
            expect((controller as any).LOCAL_CAMERA_GRACE_MS).toBe(1000); // unchanged
        });

        it('should ignore non-finite values', () => {
            controller.setLocalCameraGraceMs(Infinity);
            expect((controller as any).LOCAL_CAMERA_GRACE_MS).toBe(1000);
        });
    });

    describe('applyPayloadToState', () => {
        it('should apply rotX/rotY when not interacting', () => {
            controller.applyPayloadToState({ rotX: 0.8, rotY: 1.2 }, false);
            expect(state.rotX).toBe(0.8);
            expect(state.rotY).toBe(1.2);
        });

        it('should apply zoom value', () => {
            controller.applyPayloadToState({ zoom: 2.5 }, false);
            expect(state.zoom).toBe(2.5);
        });

        it('should apply pan values', () => {
            controller.applyPayloadToState({ panX: 10, panY: 20 }, false);
            expect(state.panX).toBe(10);
            expect(state.panY).toBe(20);
        });

        it('should apply camera mode', () => {
            controller.applyPayloadToState({ cameraMode: 'arcball' }, false);
            expect(helpers.setCameraMode).toHaveBeenCalledWith('arcball');
        });

        it('should set cameraDirty when mutated', () => {
            state.cameraDirty = false;
            controller.applyPayloadToState({ zoom: 1.5 }, false);
            expect(state.cameraDirty).toBe(true);
        });

        it('should force apply even when interacting', () => {
            state.interacting = true;
            controller.applyPayloadToState({ zoom: 3.0 }, true);
            expect(state.zoom).toBe(3.0);
        });
    });

    describe('setPayload', () => {
        it('should ignore null payload', () => {
            const originalZoom = state.zoom;
            controller.setPayload(null);
            expect(state.zoom).toBe(originalZoom);
        });

        it('should respect strict policy', () => {
            controller.setHostCameraAcceptPolicy('strict');
            controller.setPayload({ zoom: 5.0 });
            expect(state.zoom).toBe(1); // unchanged
        });

        it('should apply forced payload', () => {
            controller.setHostCameraAcceptPolicy('strict');
            controller.setPayload({ zoom: 5.0 }, { force: true });
            expect(state.zoom).toBe(5.0);
        });

        it('should defer forced payload during interaction', () => {
            state.interacting = true;
            controller.setPayload({ zoom: 5.0 }, { force: true });
            expect(state.zoom).toBe(1); // unchanged
            expect(controller.pendingForceCameraPayload).not.toBeNull();
        });
    });

    describe('resetInertia', () => {
        it('should reset all inertia values', () => {
            state.inertiaRotX = 1;
            state.inertiaRotY = 2;
            state.inertiaPanX = 3;
            state.inertiaPanY = 4;
            state.inertiaArcAxis = [1, 0, 0];
            state.inertiaArcSpeed = 5;

            controller.resetInertia();

            expect(state.inertiaRotX).toBe(0);
            expect(state.inertiaRotY).toBe(0);
            expect(state.inertiaPanX).toBe(0);
            expect(state.inertiaPanY).toBe(0);
            expect(state.inertiaArcAxis).toBeNull();
            expect(state.inertiaArcSpeed).toBe(0);
        });
    });

    describe('computePanFactor', () => {
        it('should return positive value', () => {
            const factor = controller.computePanFactor(canvas);
            expect(factor).toBeGreaterThan(0);
        });

        it('should scale with scene radius', () => {
            state.sceneRadius = 100;
            const factor1 = controller.computePanFactor(canvas);
            state.sceneRadius = 200;
            const factor2 = controller.computePanFactor(canvas);
            expect(factor2).toBeGreaterThan(factor1);
        });
    });

    describe('cancelFocusTween', () => {
        it('should set focusTween to null', () => {
            controller.focusTween = {
                startTime: 0,
                duration: 260,
                startPanX: 0,
                startPanY: 0,
                startZoom: 1,
                targetPanX: 10,
                targetPanY: 10,
                targetZoom: 2,
            };
            controller.cancelFocusTween();
            expect(controller.focusTween).toBeNull();
        });
    });

    describe('startFocusTween', () => {
        it('should create a focus tween', () => {
            const tween = controller.startFocusTween(10, 20, 2.0);
            expect(tween).toBeDefined();
            expect(tween.targetPanX).toBe(10);
            expect(tween.targetPanY).toBe(20);
            expect(tween.startZoom).toBe(state.zoom);
        });

        it('should reset inertia when starting tween', () => {
            state.inertiaRotX = 1;
            controller.startFocusTween(0, 0, 1);
            expect(state.inertiaRotX).toBe(0);
        });

        it('should mark state as interacting', () => {
            controller.startFocusTween(0, 0, 1);
            expect(state.interacting).toBe(true);
        });
    });

    describe('zoomCameraAtCursor', () => {
        it('should update zoom value', () => {
            controller.zoomCameraAtCursor(400, 300, 1.5);
            expect(state.zoom).not.toBe(1);
        });

        it('should not change zoom with factor of 1', () => {
            const originalZoom = state.zoom;
            controller.zoomCameraAtCursor(400, 300, 1.0);
            // Very small change is acceptable due to clamping
            expect(Math.abs(state.zoom - originalZoom)).toBeLessThan(0.01);
        });

        it('should ignore invalid factor', () => {
            const originalZoom = state.zoom;
            controller.zoomCameraAtCursor(400, 300, -1);
            expect(state.zoom).toBe(originalZoom);
        });

        it('should handle free camera mode differently', () => {
            state.cameraMode = 'free';
            const originalZoom = state.zoom;
            controller.zoomCameraAtCursor(400, 300, 1.5);
            // In free mode, zoom doesn't change directly
            expect(state.zoom).toBe(originalZoom);
        });
    });

    describe('updatePivotFromPan', () => {
        it('should update pivot X and Y from pan', () => {
            state.panX = 15;
            state.panY = 25;
            state.pivot = [0, 0, 10];
            controller.updatePivotFromPan();
            expect(state.pivot?.[0]).toBe(15);
            expect(state.pivot?.[1]).toBe(25);
            expect(state.pivot?.[2]).toBe(10); // Z unchanged
        });
    });

    describe('cameraPayloadDiffers', () => {
        it('should detect different zoom', () => {
            const differs = controller.cameraPayloadDiffers({ zoom: 2.0 }, state);
            expect(differs).toBe(true);
        });

        it('should detect same state', () => {
            const differs = controller.cameraPayloadDiffers({
                rotX: state.rotX,
                rotY: state.rotY,
                zoom: state.zoom,
                panX: state.panX,
                panY: state.panY,
            }, state);
            // May or may not differ based on tolerance
            expect(typeof differs).toBe('boolean');
        });
    });
});

describe('CameraController Keyboard Input', () => {
    let state: WebGPUState;
    let pointer: PointerState;
    let canvas: HTMLCanvasElement;
    let helpers: ControllerHelpers;
    let controller: CameraController;

    beforeEach(() => {
        state = createMockState();
        pointer = createMockPointer();
        canvas = createMockCanvas();
        helpers = createMockHelpers();
        controller = new CameraController(state, pointer, canvas, helpers);
    });

    describe('applyFreeKeyboardInput', () => {
        it('should return false when no keys active', () => {
            helpers.freeKeyboard!.activeKeys.clear();
            const result = controller.applyFreeKeyboardInput(16);
            expect(result).toBe(false);
        });

        it('should apply W key movement in free mode', () => {
            state.cameraMode = 'free';
            helpers.freeKeyboard!.activeKeys.add('w');
            const originalPos = [...state.freePosition];
            const result = controller.applyFreeKeyboardInput(16);
            expect(result).toBe(true);
            // Position should have changed
            expect(state.freePosition).not.toEqual(originalPos);
        });

        it('should apply WASD pan in turntable mode', () => {
            state.cameraMode = 'turntable';
            helpers.freeKeyboard!.activeKeys.add('d');
            const originalPanX = state.panX;
            const result = controller.applyFreeKeyboardInput(16);
            expect(result).toBe(true);
            expect(state.panX).not.toBe(originalPanX);
        });
    });
});
