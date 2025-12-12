/**
 * Library Panel component.
 * 
 * Allows browsing and loading designs from the Public Library directly
 * within the WebGPU preview. Communicates with Python backend via Streamlit.
 * 
 * @module ui/controls/LibraryPanel
 */

import React, { useState, useCallback, useEffect } from 'react';
import { BookOpen, Download, ExternalLink, Search, RefreshCw, Upload } from 'lucide-react';
import { Button, IconButton } from '../shared';
import { useLibraryMaybe } from '../../context';
import './LibraryPanel.css';

// ============================================================================
// Component
// ============================================================================

/**
 * Library browser panel for the WebGPU preview.
 * 
 * Features:
 * - Search designs by title
 * - Filter by style
 * - Load design parameters into editor
 * - Download STL files
 * - Publish current design
 */
export const LibraryPanel: React.FC = () => {
  const library = useLibraryMaybe();
  
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishTitle, setPublishTitle] = useState('');
  const [publishTags, setPublishTags] = useState('');
  const [publishLicense, setPublishLicense] = useState('CC BY-NC 4.0');
  const [hasFetched, setHasFetched] = useState(false);

  // Debug: log received designs to understand what data we're getting
  useEffect(() => {
    if (library?.state.designs.length) {
      console.log('[LibraryPanel] Received designs:', library.state.designs);
      console.log('[LibraryPanel] Sample design fields:', Object.keys(library.state.designs[0]));
    }
  }, [library?.state.designs]);

  // Auto-fetch when the panel becomes visible AND the context is ready
  useEffect(() => {
    if (library && library.state.ready && !hasFetched && !library.state.loading) {
      setHasFetched(true);
      library.actions.fetchDesigns(true);
    }
  }, [library, hasFetched]);

  // Handle publish success
  useEffect(() => {
    if (library?.state.publishSuccess) {
      setPublishOpen(false);
      setPublishTitle('');
      setPublishTags('');
      library.actions.fetchDesigns(true);
    }
  }, [library?.state.publishSuccess]);

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    library?.actions.fetchDesigns(true);
  }, [library]);

  const handlePublish = useCallback(() => {
    if (!publishTitle.trim() || !library) return;
    
    const tags = publishTags.split(',').map(t => t.trim()).filter(Boolean);
    library.actions.publish(publishTitle.trim(), tags, publishLicense);
  }, [library, publishTitle, publishTags, publishLicense]);

  // Show placeholder if no library context
  if (!library) {
    return (
      <div className="pf-library-panel">
        <div className="pf-library-panel__empty">
          <BookOpen size={32} />
          <p>Library not available</p>
          <span>Configure Supabase credentials in secrets.toml</span>
        </div>
      </div>
    );
  }

  const { state, actions } = library;

  return (
    <div className="pf-library-panel">
      {/* Search & Filter Bar */}
      <form className="pf-library-panel__search" onSubmit={handleSearch}>
        <div className="pf-library-panel__search-input">
          <Search size={14} />
          <input
            type="text"
            placeholder="Search designs..."
            value={state.searchQuery}
            onChange={e => actions.setSearchQuery(e.target.value)}
          />
        </div>
        <select
          value={state.styleFilter || ''}
          onChange={e => actions.setStyleFilter(e.target.value || null)}
          className="pf-library-panel__filter"
        >
          <option value="">All Styles</option>
          <option value="HarmonicRipple">HarmonicRipple</option>
          <option value="SpiralRidges">SpiralRidges</option>
          <option value="SuperformulaBlossom">SuperformulaBlossom</option>
          <option value="FourierBloom">FourierBloom</option>
          <option value="SuperellipseMorph">SuperellipseMorph</option>
        </select>
        <IconButton
          icon={<RefreshCw size={14} />}
          aria-label="Refresh"
          onClick={() => actions.fetchDesigns(true)}
          variant="ghost"
          size="sm"
        />
      </form>

      {/* Error Display */}
      {state.error && (
        <div className="pf-library-panel__error">
          {state.error}
        </div>
      )}

      {/* Design Grid */}
      <div className="pf-library-panel__grid">
        {state.designs.map(design => {
          // Debug: log each design being rendered
          console.log('[LibraryPanel] Rendering design:', design.id, 'thumb_url:', design.thumb_url, 'stl_url:', design.stl_url);
          return (
          <div key={design.id} className="pf-library-panel__card">
            <div className="pf-library-panel__thumb">
              {design.thumb_url ? (
                <img src={design.thumb_url} alt={design.title} />
              ) : (
                <div className="pf-library-panel__thumb-placeholder">
                  <BookOpen size={24} />
                </div>
              )}
            </div>
            <div className="pf-library-panel__card-info">
              <span className="pf-library-panel__card-title">{design.title}</span>
              <span className="pf-library-panel__card-style">{design.style}</span>
            </div>
            <div className="pf-library-panel__card-actions">
              <IconButton
                icon={<ExternalLink size={14} />}
                aria-label="Load design"
                onClick={() => actions.loadDesign(design)}
                variant="ghost"
                size="sm"
                title="Load into editor"
              />
              <IconButton
                icon={<Download size={14} />}
                aria-label="Download STL"
                onClick={() => actions.downloadSTL(design)}
                variant="ghost"
                size="sm"
                title="Download STL"
                disabled={!design.stl_url}
              />
            </div>
          </div>
        );})}
      </div>

      {/* Loading State */}
      {state.loading && (
        <div className="pf-library-panel__loading">
          <RefreshCw size={20} className="pf-library-panel__spinner" />
          <span>Loading designs...</span>
        </div>
      )}

      {/* Empty State */}
      {!state.loading && state.designs.length === 0 && !state.error && (
        <div className="pf-library-panel__empty">
          <BookOpen size={32} />
          <p>No designs found</p>
          <span>Try a different search or be the first to publish!</span>
        </div>
      )}

      {/* Load More */}
      {state.hasMore && !state.loading && (
        <Button
          variant="ghost"
          size="sm"
          onClick={actions.loadMore}
          className="pf-library-panel__load-more"
        >
          Load More
        </Button>
      )}

      {/* Publish Section */}
      <div className="pf-library-panel__publish">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setPublishOpen(!publishOpen)}
          iconLeft={<Upload size={14} />}
          className="pf-library-panel__publish-btn"
        >
          {publishOpen ? 'Cancel' : 'Publish Your Design'}
        </Button>
        
        {publishOpen && (
          <div className="pf-library-panel__publish-form">
            <input
              type="text"
              placeholder="Design title *"
              value={publishTitle}
              onChange={e => setPublishTitle(e.target.value)}
              maxLength={120}
            />
            <input
              type="text"
              placeholder="Tags (comma-separated)"
              value={publishTags}
              onChange={e => setPublishTags(e.target.value)}
            />
            <select
              value={publishLicense}
              onChange={e => setPublishLicense(e.target.value)}
            >
              <option value="CC BY-NC 4.0">CC BY-NC 4.0</option>
              <option value="CC BY 4.0">CC BY 4.0</option>
              <option value="CC BY-SA 4.0">CC BY-SA 4.0</option>
              <option value="CC0 1.0">CC0 1.0</option>
              <option value="MIT">MIT</option>
            </select>
            <Button
              variant="primary"
              size="sm"
              onClick={handlePublish}
              disabled={!publishTitle.trim() || state.publishing}
            >
              {state.publishing ? 'Publishing...' : 'Publish'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
