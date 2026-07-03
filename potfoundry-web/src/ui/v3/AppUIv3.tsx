/**
 * PotFoundry UI v3 — "Studio at Dusk" root shell (spec §4, §12).
 */
import React, { useEffect, useState } from 'react';
import { ErrorBoundary } from '../shared';
import { useAppStore } from '../../state';
import { PanelShell } from './panel/PanelShell';
import { ShapeTab } from './panel/ShapeTab';
import { StyleTab } from './panel/StyleTab';
import { ExportTab } from './panel/ExportTab';
import { ExportFooter } from './panel/ExportFooter';
import { PillToolbar } from './stage/PillToolbar';
import { StatusLine } from './stage/StatusLine';
import { HintLine } from './stage/HintLine';
import { useStudioBackdrop } from './stage/useStudioBackdrop';
import { ShowroomOverlay } from './showroom/ShowroomOverlay';
import { AccountChip } from './stage/AccountChip';
import { ShortcutsDialogV3 } from './shared/ShortcutsDialogV3';
import './tokens.css';
import './AppUIv3.css';

const TAB_KEYS: Record<string, 'shape' | 'style' | 'export'> = { '1': 'shape', '2': 'style', '3': 'export' };

export const AppUIv3: React.FC = () => {
  const uiTheme = useAppStore((s) => s.ui.uiTheme);
  const zenMode = useAppStore((s) => s.ui.zenMode);
  const v3ActiveTab = useAppStore((s) => s.ui.v3ActiveTab);
  const setV3ActiveTab = useAppStore((s) => s.setV3ActiveTab);
  const toggleZenMode = useAppStore((s) => s.toggleZenMode);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const toggleFullscreen = useAppStore((s) => s.toggleFullscreen);

  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useStudioBackdrop();

  useEffect(() => {
    document.documentElement.dataset.theme = 'dark';
    return () => { delete document.documentElement.dataset.theme; };
  }, []);

  useEffect(() => {
    if (uiTheme !== 'v3') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const isInput = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;

      // F11 always works regardless of input guard or zen mode
      if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
        return;
      }

      // ? (Shift+/) opens/closes shortcuts dialog — input guard applies
      if (e.key === '?') {
        if (isInput) return;
        e.preventDefault();
        setShortcutsOpen((prev) => !prev);
        return;
      }

      if (isInput) return;

      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'z' && e.shiftKey) { e.preventDefault(); redo(); return; }
        if (k === 'y') { e.preventDefault(); redo(); return; }
        if (k === 'z') { e.preventDefault(); undo(); return; }
        return;
      }
      if (e.altKey && TAB_KEYS[e.key]) { e.preventDefault(); setV3ActiveTab(TAB_KEYS[e.key]); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const k = e.key.toLowerCase();
      if (k === 'z') { e.preventDefault(); toggleZenMode(); }
      if (k === 'd') {
        // D targets the panel's ExportFooter — unmounted in zen; zen download ships with Phase-2 export orchestration
        if (zenMode) return;
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('pf3:download'));
      }
      if (k === 'r') { e.preventDefault(); window.dispatchEvent(new CustomEvent('pf3:reset-camera')); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [uiTheme, zenMode, undo, redo, setV3ActiveTab, toggleZenMode, toggleFullscreen]);

  return (
    <ErrorBoundary name="AppUIv3">
      <div className="pf3-root pf3-layout" data-theme="dark" data-zen={zenMode || undefined} data-testid="pf3-root">
        <ErrorBoundary name="PillToolbar"><PillToolbar /></ErrorBoundary>
        <ErrorBoundary name="AccountChip"><AccountChip /></ErrorBoundary>
        {!zenMode && (
          <>
            <ErrorBoundary name="PanelShell">
              <PanelShell footer={<ExportFooter />}>
                {v3ActiveTab === 'shape' && <ShapeTab />}
                {v3ActiveTab === 'style' && <StyleTab />}
                {v3ActiveTab === 'export' && <ExportTab />}
              </PanelShell>
            </ErrorBoundary>
            <StatusLine />
            <HintLine />
          </>
        )}
        <ShowroomOverlay />
        <ShortcutsDialogV3 open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      </div>
    </ErrorBoundary>
  );
};

export default AppUIv3;
