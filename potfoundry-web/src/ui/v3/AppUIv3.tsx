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
import { ShowroomOverlay, isShowroomOpen } from './showroom/ShowroomOverlay';
import { AccountChip } from './stage/AccountChip';
import { PricingModal } from '../pricing/PricingModal';
import { ShortcutsDialogV3 } from './shared/ShortcutsDialogV3';
import { TouchModeProvider } from './mobile/TouchModeContext';
import { useMobile } from '../../hooks/useMobile';
import { safeStorage } from './utils/safeStorage';
import './tokens.css';
import './AppUIv3.css';
import './entrance.css';

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

  const { isMobile } = useMobile();

  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [showEntrance, setShowEntrance] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);

  useStudioBackdrop();

  // pf3:upgrade → open PricingModal
  useEffect(() => {
    const handler = () => setPricingOpen(true);
    window.addEventListener('pf3:upgrade', handler);
    return () => window.removeEventListener('pf3:upgrade', handler);
  }, []);

  // Once-per-session entrance (desktop only): set data-entrance on first mount, never replay.
  useEffect(() => {
    if (!isMobile && !safeStorage.getSession('pf3-entered')) {
      setShowEntrance(true);
      safeStorage.setSession('pf3-entered', '1');
    }
  }, [isMobile]);

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
        // Gate: D mid-showroom hover would export the transient preview style, not the user's selection
        if (isShowroomOpen()) return;
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
      <TouchModeProvider value={isMobile}>
        <div
          className="pf3-root pf3-layout"
          data-theme="dark"
          data-zen={zenMode || undefined}
          data-entrance={showEntrance ? '' : undefined}
          data-layout={isMobile ? 'mobile' : 'desktop'}
          data-testid="pf3-root"
        >
          {/* PillToolbar — desktop only; Task 8 wires mobile nav */}
          {!isMobile && <ErrorBoundary name="PillToolbar"><PillToolbar /></ErrorBoundary>}

          {/* AccountChip — always visible (both desktop and mobile) */}
          <ErrorBoundary name="AccountChip"><AccountChip /></ErrorBoundary>

          {isMobile ? (
            /* Mobile shell: sheet placeholder replaces panel+status+hint.
               Zen mode = pot only, so the sheet is hidden in zen. */
            !zenMode && <div data-testid="pf3-sheet" />
          ) : (
            /* Desktop shell: panel rail + status chrome, gated by zen. */
            !zenMode && (
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
            )
          )}

          {/* Overlays — always present regardless of layout or zen */}
          <ShowroomOverlay />
          <ShortcutsDialogV3 open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
          {/* PricingModal — v1-styled; pf3 restyling deferred to Phase-3 */}
          <PricingModal open={pricingOpen} onOpenChange={setPricingOpen} />
        </div>
      </TouchModeProvider>
    </ErrorBoundary>
  );
};

export default AppUIv3;
