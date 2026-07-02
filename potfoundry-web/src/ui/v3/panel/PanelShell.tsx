import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GlassSurface } from '../primitives/GlassSurface';
import { SegmentedControl } from '../primitives/SegmentedControl';
import { safeStorage } from '../utils/safeStorage';
import { useAppStore } from '../../../state';
import type { V3Tab } from '../../../state/types';
import './PanelShell.css';

const WIDTH_KEY = 'pf3-panel-width';
const MIN_W = 300;
const MAX_W = 480;
const DEFAULT_W = 340;

const TABS = [
  { value: 'shape', label: 'Shape' },
  { value: 'style', label: 'Style' },
  { value: 'export', label: 'Export' },
] as const;

export interface PanelShellProps {
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const PanelShell: React.FC<PanelShellProps> = ({ children, footer }) => {
  const activeTab = useAppStore((s) => s.ui.v3ActiveTab);
  const setV3ActiveTab = useAppStore((s) => s.setV3ActiveTab);

  const [width, setWidth] = useState<number>(() => {
    const stored = Number(safeStorage.get(WIDTH_KEY));
    return stored >= MIN_W && stored <= MAX_W ? stored : DEFAULT_W;
  });
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startW: number } | null>(null);

  const onHandleDown = useCallback((e: React.PointerEvent) => {
    drag.current = { startX: e.clientX, startW: panelRef.current?.offsetWidth ?? DEFAULT_W };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const onHandleMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current || !panelRef.current) return;
    const w = Math.min(MAX_W, Math.max(MIN_W, drag.current.startW + (e.clientX - drag.current.startX)));
    panelRef.current.style.width = `${w}px`; // direct write — no re-render per move
  }, []);

  const onHandleUp = useCallback(() => {
    if (!drag.current || !panelRef.current) return;
    drag.current = null;
    const w = Math.max(MIN_W, Math.min(MAX_W, panelRef.current.offsetWidth || DEFAULT_W));
    setWidth(w);
    safeStorage.set(WIDTH_KEY, String(w));
  }, []);

  useEffect(() => {
    if (panelRef.current) panelRef.current.style.width = `${width}px`;
  }, [width]);

  return (
    <div ref={panelRef} className="pf3-panel" data-testid="pf3-panel" style={{ width }}>
      <GlassSurface className="pf3-panel__surface">
        <div className="pf3-panel__header">
          <div className="pf3-panel__wordmark">PotFoundry</div>
          <SegmentedControl<V3Tab>
            options={TABS}
            value={activeTab}
            onChange={setV3ActiveTab}
            ariaLabel="Panel sections"
          />
        </div>
        <div className="pf3-panel__content">{children}</div>
        {footer && <div className="pf3-panel__footer">{footer}</div>}
      </GlassSurface>
      <div
        className="pf3-panel__resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
      />
    </div>
  );
};
