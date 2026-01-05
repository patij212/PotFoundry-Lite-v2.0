/**
 * Sidebar component with tabbed navigation and resizable width.
 * 
 * On mobile (≤480px), renders as a bottom sheet instead of a left sidebar.
 * On desktop, provides a resizable left sidebar with localStorage persistence.
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
import { useMobile } from '../../hooks';
import { MobileBottomSheet } from './MobileBottomSheet';
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
// Tab Navigation Component (shared)
// ============================================================================

interface TabNavProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
}

const TabNav: React.FC<TabNavProps> = ({ activeTab, onTabChange }) => (
  <nav className="pf-sidebar__tabs">
    <button
      className={`pf-sidebar__tab ${activeTab === 'design' ? 'pf-sidebar__tab--active' : ''}`}
      onClick={() => onTabChange('design')}
      aria-selected={activeTab === 'design'}
    >
      <Sliders size={16} />
      <span>Design</span>
    </button>
    <button
      className={`pf-sidebar__tab ${activeTab === 'library' ? 'pf-sidebar__tab--active' : ''}`}
      onClick={() => onTabChange('library')}
      aria-selected={activeTab === 'library'}
    >
      <BookOpen size={16} />
      <span>Library</span>
    </button>
  </nav>
);

// ============================================================================
// Tab Content Component (shared)
// ============================================================================

interface TabContentProps {
  activeTab: SidebarTab;
  onReset: () => void;
  showFooter?: boolean;
}

const TabContent: React.FC<TabContentProps> = ({ activeTab, onReset, showFooter = true }) => (
  <>
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
    {showFooter && activeTab === 'design' && (
      <footer className="pf-sidebar__footer">
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          iconLeft={<RotateCcw size={14} />}
        >
          Reset All
        </Button>
      </footer>
    )}
  </>
);

// ============================================================================
// Desktop Sidebar Component
// ============================================================================

interface DesktopSidebarProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  onClose: () => void;
  onReset: () => void;
}

const DesktopSidebar: React.FC<DesktopSidebarProps> = ({
  activeTab,
  onTabChange,
  onClose,
  onReset,
}) => {
  // Resizable width state
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? Math.max(MIN_WIDTH, Math.min(getMaxWidth(), parseInt(saved, 10))) : DEFAULT_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);

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

  return (
    <aside
      ref={sidebarRef}
      className={`pf-sidebar pf-sidebar--desktop ${isResizing ? 'pf-sidebar--resizing' : ''}`}
      style={{ width: `${width}px` }}
    >
      {/* Header */}
      <header className="pf-sidebar__header">
        <div className="pf-sidebar__title">
          <h2>PotFoundry</h2>
          <span className="pf-sidebar__version">v2.1</span>
          {/* Renderer selector */}
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
          onClick={onClose}
          variant="ghost"
          size="sm"
        />
      </header>

      {/* Tab Navigation */}
      <TabNav activeTab={activeTab} onTabChange={onTabChange} />

      {/* Tab Content */}
      <TabContent activeTab={activeTab} onReset={onReset} />

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

// ============================================================================
// Mobile Sidebar Component (Bottom Sheet)
// ============================================================================

interface MobileSidebarProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  onClose: () => void;
  onReset: () => void;
}

const MobileSidebar: React.FC<MobileSidebarProps> = ({
  activeTab,
  onTabChange,
  onClose,
  onReset,
}) => {
  const tabLabel = activeTab === 'design' ? 'Design' : 'Library';

  // Handle sheet state changes to offset the pot when sidebar is deployed
  const handleSheetStateChange = useCallback((state: 'collapsed' | 'half' | 'full') => {
    // Set a data attribute on body so CSS can offset the canvas
    document.body.setAttribute('data-mobile-sheet-state', state);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      document.body.removeAttribute('data-mobile-sheet-state');
    };
  }, []);

  return (
    <MobileBottomSheet
      title="PotFoundry"
      subtitle={tabLabel}
      open={true}
      onClose={onClose}
      onStateChange={handleSheetStateChange}
      initialState="half"
      className="pf-sidebar--mobile"
    >
      {/* Tab Navigation */}
      <TabNav activeTab={activeTab} onTabChange={onTabChange} />

      {/* Tab Content */}
      <TabContent activeTab={activeTab} onReset={onReset} showFooter={true} />
    </MobileBottomSheet>
  );
};

// ============================================================================
// Main Sidebar Component
// ============================================================================

/**
 * The main sidebar with tabbed navigation.
 * 
 * On mobile: Renders as a bottom sheet
 * On desktop: Renders as a resizable left sidebar
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
  const { isMobile, viewportWidth } = useMobile();

  // Debug mobile detection
  // Debug mobile detection
  useEffect(() => {
    // console.log('[Sidebar] isMobile:', isMobile, 'viewportWidth:', viewportWidth);
  }, [isMobile, viewportWidth]);

  const handleClose = useCallback(() => setPanelOpen(false), [setPanelOpen]);
  const handleTabChange = useCallback((tab: SidebarTab) => setActiveTab(tab), []);
  const handleReset = useCallback(() => {
    resetGeometry();
    resetStyleOpts();
  }, [resetGeometry, resetStyleOpts]);

  if (!ui.panelOpen) {
    return null;
  }

  // Mobile: Bottom Sheet
  if (isMobile) {
    return (
      <MobileSidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onClose={handleClose}
        onReset={handleReset}
      />
    );
  }

  // Desktop: Left Sidebar
  return (
    <DesktopSidebar
      activeTab={activeTab}
      onTabChange={handleTabChange}
      onClose={handleClose}
      onReset={handleReset}
    />
  );
};
