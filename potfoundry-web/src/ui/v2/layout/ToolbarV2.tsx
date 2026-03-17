/**
 * ToolbarV2 — Floating top toolbar with quick actions.
 *
 * Top-center floating bar with camera controls, save/load, fullscreen,
 * and zen mode toggle. Always visible (even in zen mode per spec).
 *
 * @module ui/v2/layout/ToolbarV2
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Menu,
  Maximize,
  Minimize,
  Camera,
  RotateCcw,
  Save,
  FolderOpen,
  HelpCircle,
  RefreshCw,
  Shrink,
  Expand,
  SlidersHorizontal,
  BookOpen,
  Sun,
  Moon,
  Monitor,
  Undo2,
  Redo2,
  Settings,
  Upload,
} from 'lucide-react';
import { IconButtonV2 } from '../controls/ButtonV2';
import { useAppStore } from '../../../state';
import { useControllerMaybe } from '../../../context';
import { useAnnounce } from '../shared/Announcer';
import { ShortcutsDialog } from '../shared/ShortcutsDialog';
import { useColorMode } from '../hooks/useColorMode';
import { CameraPopover } from '../shared/CameraPopover';
import { LibraryDrawer } from '../shared/LibraryDrawer';
import { SettingsPopover } from '../shared/SettingsPopover';
import { SaveDialog } from '../shared/SaveDialog';
import clsx from 'clsx';
import './ToolbarV2.css';

// ============================================================================
// Component
// ============================================================================

export const ToolbarV2: React.FC = () => {
  const panelOpen = useAppStore((s) => s.ui.panelOpen);
  const fullscreen = useAppStore((s) => s.ui.fullscreen);
  const zenMode = useAppStore((s) => s.ui.zenMode);
  const togglePanel = useAppStore((s) => s.togglePanel);
  const toggleFullscreen = useAppStore((s) => s.toggleFullscreen);
  const toggleZenMode = useAppStore((s) => s.toggleZenMode);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const controller = useControllerMaybe();
  const [helpOpen, setHelpOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const cameraTriggerRef = useRef<HTMLButtonElement>(null);
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);
  const { colorMode, cycleColorMode } = useColorMode();
  const announce = useAnnounce();

  const handleCycleColorMode = useCallback(() => {
    cycleColorMode();
    // Announce the next mode in the cycle
    const next = colorMode === 'system' ? 'light' : colorMode === 'light' ? 'dark' : 'system';
    announce(`Color mode: ${next}`);
  }, [cycleColorMode, colorMode, announce]);

  const isControllerReady = controller?.isReady ?? false;

  // ? key — toggle shortcuts dialog
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) return;
        e.preventDefault();
        setHelpOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [setHelpOpen]);

  // Camera controls
  const handleResetCamera = useCallback(() => {
    if (controller?.isReady) controller.resetCamera();
  }, [controller]);

  // Listen for global keyboard shortcut (R key)
  useEffect(() => {
    const onShortcut = () => { handleResetCamera(); };
    window.addEventListener('pf2:reset-camera', onShortcut);
    return () => window.removeEventListener('pf2:reset-camera', onShortcut);
  }, [handleResetCamera]);

  const handleToggleAutoRotate = useCallback(() => {
    if (controller?.isReady) controller.toggleAutoRotate();
  }, [controller]);

  const handleScreenshot = useCallback(async () => {
    if (!controller?.isReady) return;
    const blob = await controller.takeScreenshot();
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `potfoundry-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }, [controller]);

  // Save design as JSON
  const handleSave = useCallback(() => {
    const state = useAppStore.getState();

    const designData = {
      version: '2.1',
      timestamp: Date.now(),
      name: 'PotFoundry Design',
      geometry: state.geometry,
      style: state.style,
      appearance: {
        colorScheme: state.appearance.colorScheme,
        primaryColor: state.appearance.primaryColor,
        midColor: state.appearance.midColor,
        secondaryColor: state.appearance.secondaryColor,
        showInner: state.appearance.showInner,
        showWireframe: state.appearance.showWireframe,
        gradient: state.appearance.gradient,
        lightingPreset: state.appearance.lightingPreset,
      },
    };

    const json = JSON.stringify(designData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PotFoundry_${state.style.name ?? 'design'}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  // Load design from JSON
  const handleLoad = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const designData = JSON.parse(text) as {
          version?: string;
          geometry?: Record<string, unknown>;
          style?: { name: string; opts?: Record<string, unknown> };
          appearance?: Record<string, unknown>;
        };

        if (!designData.version || !designData.geometry || !designData.style) {
          console.warn('Invalid design file format');
          return;
        }

        const s = useAppStore.getState();

        s.beginHistoryTransaction();
        if (designData.geometry) s.setGeometryParams(designData.geometry as Partial<typeof s.geometry>);
        if (designData.style) {
          s.setStyle(designData.style.name as Parameters<typeof s.setStyle>[0]);
          if (designData.style.opts) s.setStyleOpts(designData.style.opts as Parameters<typeof s.setStyleOpts>[0]);
        }
        if (designData.appearance) {
          const app = designData.appearance;
          if (app.colorScheme) s.setColorScheme(app.colorScheme as string);
          if (app.primaryColor) s.setPrimaryColor(app.primaryColor as string);
          if (app.midColor) s.setMidColor(app.midColor as string);
          if (app.secondaryColor) s.setSecondaryColor(app.secondaryColor as string);
          if (app.showWireframe !== undefined) s.setShowWireframe(app.showWireframe as boolean);
          if (app.showInner !== undefined) s.setShowInner(app.showInner as boolean);
          if (app.gradient) s.setBackgroundGradient(app.gradient as string);
          if (app.lightingPreset) s.setLightingPreset(app.lightingPreset as string);
        }
        s.commitHistoryTransaction();
      } catch (error) {
        console.error('Failed to load design:', error);
      }
    };

    input.click();
  }, []);

  return (
    <>
      <div className={clsx('pf2-toolbar', zenMode && 'pf2-toolbar--zen')} role="toolbar" aria-label="Quick actions">
        {/* Left group — Menu toggle */}
        <div className="pf2-toolbar__group">
          {!panelOpen && (
            <IconButtonV2
              icon={<Menu size={18} />}
              aria-label="Open panel"
              onClick={togglePanel}
            />
          )}
        </div>

        {/* Undo/Redo */}
        <div className="pf2-toolbar__group">
          <IconButtonV2
            icon={<Undo2 size={16} />}
            aria-label="Undo"
            onClick={undo}
            size="sm"
          />
          <IconButtonV2
            icon={<Redo2 size={16} />}
            aria-label="Redo"
            onClick={redo}
            size="sm"
          />
        </div>

        {/* Center group — Camera actions */}
        <div className="pf2-toolbar__group pf2-toolbar__group--center">
          <IconButtonV2
            ref={cameraTriggerRef}
            icon={<SlidersHorizontal size={16} />}
            aria-label="Camera settings"
            aria-expanded={cameraOpen}
            onClick={() => setCameraOpen((o) => !o)}
            size="sm"
            disabled={!isControllerReady}
          />
          <CameraPopover
            open={cameraOpen}
            onOpenChange={setCameraOpen}
            triggerRef={cameraTriggerRef}
          />
          <IconButtonV2
            icon={<RotateCcw size={16} />}
            aria-label="Reset camera"
            onClick={handleResetCamera}
            size="sm"
            disabled={!isControllerReady}
          />
          <IconButtonV2
            icon={<RefreshCw size={16} />}
            aria-label="Toggle auto-rotate"
            onClick={handleToggleAutoRotate}
            size="sm"
            disabled={!isControllerReady}
          />
          <IconButtonV2
            icon={<Camera size={16} />}
            aria-label="Take screenshot"
            onClick={handleScreenshot}
            size="sm"
            disabled={!isControllerReady}
          />
        </div>

        {/* Right group — File & View actions */}
        <div className="pf2-toolbar__group">
          <IconButtonV2
            icon={<BookOpen size={16} />}
            aria-label="Preset library"
            onClick={() => setLibraryOpen(true)}
            size="sm"
          />
          <IconButtonV2
            icon={<Save size={16} />}
            aria-label="Save design"
            onClick={handleSave}
            size="sm"
          />
          <IconButtonV2
            icon={<Upload size={16} />}
            aria-label="Save to library"
            onClick={() => setSaveOpen(true)}
            size="sm"
          />
          <IconButtonV2
            icon={<FolderOpen size={16} />}
            aria-label="Load design"
            onClick={handleLoad}
            size="sm"
          />
          <IconButtonV2
            icon={colorMode === 'light' ? <Sun size={16} /> : colorMode === 'dark' ? <Moon size={16} /> : <Monitor size={16} />}
            aria-label={`Color mode: ${colorMode}. Click to cycle.`}
            onClick={handleCycleColorMode}
            size="sm"
          />

          <div className="pf2-toolbar__divider" aria-hidden="true" />

          <IconButtonV2
            ref={settingsTriggerRef}
            icon={<Settings size={16} />}
            aria-label="Settings"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((o) => !o)}
            size="sm"
          />
          <SettingsPopover
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            triggerRef={settingsTriggerRef}
          />
          <IconButtonV2
            icon={<HelpCircle size={16} />}
            aria-label="Help and shortcuts"
            onClick={() => setHelpOpen(true)}
            size="sm"
          />
          <IconButtonV2
            icon={fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            onClick={toggleFullscreen}
            size="sm"
          />
          <IconButtonV2
            icon={zenMode ? <Expand size={16} /> : <Shrink size={16} />}
            aria-label={zenMode ? 'Exit zen mode' : 'Enter zen mode'}
            onClick={toggleZenMode}
            size="sm"
          />
        </div>
      </div>

      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <LibraryDrawer open={libraryOpen} onOpenChange={setLibraryOpen} />
      <SaveDialog open={saveOpen} onOpenChange={setSaveOpen} />
    </>
  );
};
