/**
 * Sidebar component with tabbed navigation.
 * 
 * Provides separate pages for Design controls and Public Library.
 * 
 * @module ui/layout/Sidebar
 */

import React, { useState, useCallback } from 'react';
import { X, RotateCcw, Sliders, BookOpen } from 'lucide-react';
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
// Types
// ============================================================================

type SidebarTab = 'design' | 'library';

// ============================================================================
// Component
// ============================================================================

/**
 * The main sidebar with tabbed navigation.
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
  
  const handleClose = () => setPanelOpen(false);
  
  const handleReset = () => {
    resetGeometry();
    resetStyleOpts();
  };

  if (!ui.panelOpen) {
    return null;
  }

  return (
    <aside className="pf-sidebar">
      {/* Header */}
      <header className="pf-sidebar__header">
        <div className="pf-sidebar__title">
          <h2>PotFoundry</h2>
          <span className="pf-sidebar__version">v2.1</span>
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
        </footer>
      )}
    </aside>
  );
};
