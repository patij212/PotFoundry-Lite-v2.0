/**
 * Sidebar component with tabbed navigation and resizable width.
 * 
 * Provides separate pages for Design controls and Public Library.
 * Width is resizable by dragging the edge, with localStorage persistence.
 * 
 * @module ui/layout/Sidebar
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { X, RotateCcw, Sliders, BookOpen, GripVertical } from 'lucide-react';
import { IconButton, Button } from '../shared';
import {
  DimensionControls,
  StyleControls,
  MeshControls,
  AppearanceControls,
  CameraControls,
  ExportPanel,
  PresetPanel,
  LibraryPanel,
} from '../controls';
import { useUI, useUIActions, useGeometryActions, useStyleActions } from '../../state';
import './Sidebar.css';

// ============================================================================
// Constants
// ============================================================================

const SIDEBAR_WIDTH_KEY = 'pf-sidebar-width';
const DEFAULT_WIDTH = 340;
const MIN_WIDTH = 280;
const getMaxWidth = () => Math.min(800, window.innerWidth * 0.5); // 50% of viewport or 800px

// ============================================================================
// Types
// ============================================================================

type SidebarTab = 'design' | 'library';

// ============================================================================
// Component
// ============================================================================

/**
 * The main sidebar with tabbed navigation and resizable width.
 * 
 * Contains two pages:
 * - Design: All pot configuration controls
 * - Library: Public library browser and publish
 */
export const Sidebar: React.FC = () => {
  const ui = useUI();
  const { setPanelOpen } = useUIActions();
  const { resetGeometry } = useGeometryActions();
  const { resetStyleOpts } = useStyleActions();
  const [activeTab, setActiveTab] = useState<SidebarTab>('design');

  // Resizable width state
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? Math.max(MIN_WIDTH, Math.min(getMaxWidth(), parseInt(saved, 10))) : DEFAULT_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);

  const handleClose = () => setPanelOpen(false);

  const handleReset = () => {
    resetGeometry();
    resetStyleOpts();
  };

  // Resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;

    const newWidth = Math.max(MIN_WIDTH, Math.min(getMaxWidth(), e.clientX));
    setWidth(newWidth);
  }, [isResizing]);

  const handleResizeEnd = useCallback(() => {
    if (isResizing) {
      setIsResizing(false);
      localStorage.setItem(SIDEBAR_WIDTH_KEY, width.toString());
    }
  }, [isResizing, width]);

  // Attach global listeners for resize
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  // Update max width on window resize
  useEffect(() => {
    const handleWindowResize = () => {
      const maxW = getMaxWidth();
      if (width > maxW) {
        setWidth(maxW);
      }
    };
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [width]);

  if (!ui.panelOpen) {
    return null;
  }

  return (
    <aside
      ref={sidebarRef}
      className={`pf-sidebar ${isResizing ? 'pf-sidebar--resizing' : ''}`}
      style={{ width: `${width}px` }}
    >
      {/* Header */}
      <header className="pf-sidebar__header">
        <div className="pf-sidebar__title">
          <h2>PotFoundry</h2>
          <span className="pf-sidebar__version">v2.1</span>
          {/* Renderer selector - inline in header for mobile visibility */}
          <select
            className="pf-sidebar__renderer-header-select"
            value={typeof window !== 'undefined' ? (localStorage.getItem('pf-preferred-renderer') || 'auto') : 'auto'}
            onChange={(e) => {
              const value = e.target.value;
              if (value === 'auto') {
                localStorage.removeItem('pf-preferred-renderer');
              } else {
                localStorage.setItem('pf-preferred-renderer', value);
              }
              window.location.reload();
            }}
            title="Change graphics renderer"
          >
            <option value="auto">Auto</option>
            <option value="webgpu">GPU</option>
            <option value="webgl">GL</option>
          </select>
        </div>
        <IconButton
          icon={<X size={18} />}
          aria-label="Close panel"
          onClick={handleClose}
          variant="ghost"
          size="sm"
        />
      </header>

      {/* Tab Navigation */}
      <nav className="pf-sidebar__tabs">
        <button
          className={`pf-sidebar__tab ${activeTab === 'design' ? 'pf-sidebar__tab--active' : ''}`}
          onClick={() => setActiveTab('design')}
          aria-selected={activeTab === 'design'}
        >
          <Sliders size={16} />
          <span>Design</span>
        </button>
        <button
          className={`pf-sidebar__tab ${activeTab === 'library' ? 'pf-sidebar__tab--active' : ''}`}
          onClick={() => setActiveTab('library')}
          aria-selected={activeTab === 'library'}
        >
          <BookOpen size={16} />
          <span>Library</span>
        </button>
      </nav>

      {/* Tab Content */}
      <div className="pf-sidebar__content">
        {activeTab === 'design' && (
          <div className="pf-sidebar__page">
            <PresetPanel />
            <DimensionControls />
            <StyleControls />
            <CameraControls />
            <MeshControls />
            <AppearanceControls />
            <ExportPanel />
          </div>
        )}

        {activeTab === 'library' && (
          <div className="pf-sidebar__page pf-sidebar__page--library">
            <LibraryPanel />
          </div>
        )}
      </div>

      {/* Footer Actions - only show on Design tab */}
      {activeTab === 'design' && (
        <footer className="pf-sidebar__footer">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            iconLeft={<RotateCcw size={14} />}
          >
            Reset All
          </Button>

          {/* Renderer Toggle */}
          <div className="pf-sidebar__renderer-toggle">
            <select
              className="pf-sidebar__renderer-select"
              value={typeof window !== 'undefined' ? (localStorage.getItem('pf-preferred-renderer') || 'auto') : 'auto'}
              onChange={(e) => {
                const value = e.target.value;
                if (value === 'auto') {
                  localStorage.removeItem('pf-preferred-renderer');
                } else {
                  localStorage.setItem('pf-preferred-renderer', value);
                }
                window.location.reload();
              }}
              title="Change graphics renderer"
            >
              <option value="auto">Auto</option>
              <option value="webgpu">WebGPU</option>
              <option value="webgl">WebGL</option>
            </select>
          </div>
        </footer>
      )}

      {/* Resize Handle */}
      <div
        className="pf-sidebar__resize-handle"
        onMouseDown={handleResizeStart}
        title="Drag to resize"
      >
        <GripVertical size={12} />
      </div>
    </aside>
  );
};
