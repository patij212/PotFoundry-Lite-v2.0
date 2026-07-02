/**
 * PotFoundry UI v3 — "Studio at Dusk" root shell (spec §4, §12).
 */
import React, { useEffect } from 'react';
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

  useStudioBackdrop();

  useEffect(() => {
    document.documentElement.dataset.theme = 'dark';
    return () => { delete document.documentElement.dataset.theme; };
  }, []);

  useEffect(() => {
    if (uiTheme !== 'v3') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return;

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
      if (k === 'd') { e.preventDefault(); window.dispatchEvent(new CustomEvent('pf3:download')); }
      if (k === 'r') { e.preventDefault(); window.dispatchEvent(new CustomEvent('pf3:reset-camera')); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [uiTheme, undo, redo, setV3ActiveTab, toggleZenMode]);

  return (
    <ErrorBoundary name="AppUIv3">
      <div className="pf3-root pf3-layout" data-theme="dark" data-zen={zenMode || undefined} data-testid="pf3-root">
        <ErrorBoundary name="PillToolbar"><PillToolbar /></ErrorBoundary>
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
      </div>
    </ErrorBoundary>
  );
};

export default AppUIv3;
