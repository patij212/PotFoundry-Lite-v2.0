/**
 * Library Panel component.
 * 
 * Allows browsing and loading designs from the Public Library directly
 * within the WebGPU preview.
 * 
 * @module ui/controls/LibraryPanel
 */

import React, { useState, useCallback, useEffect } from 'react';
import { BookOpen, Download, ExternalLink, Search, RefreshCw, Upload, User, LogIn } from 'lucide-react';
import { Button, IconButton } from '../shared';
import { DesignThumbnail } from '../shared/DesignThumbnail';
import { useLibraryMaybe, useAuth } from '../../context';
import { useToastMaybe } from '../shared/Toast';
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
  const { state: authState } = useAuth();
  const toast = useToastMaybe();
  const isAuthenticated = Boolean(authState.user);

  const [publishOpen, setPublishOpen] = useState(false);
  const [publishTitle, setPublishTitle] = useState('');
  const [publishTags, setPublishTags] = useState('');
  const [publishLicense, setPublishLicense] = useState('CC BY-NC 4.0');
  const [hasFetched, setHasFetched] = useState(false);
  const [confirmLoad, setConfirmLoad] = useState<{ design: any } | null>(null);

  // Auto-fetch when the panel becomes visible AND the context is ready (uses cache)
  useEffect(() => {
    if (library && library.state.ready && !hasFetched && !library.state.loading) {
      setHasFetched(true);
      library.actions.fetchDesigns(true); // Uses cache if available
    }
  }, [library, library?.state.ready, library?.state.loading, hasFetched]);

  // Handle publish success - show toast and reset form
  useEffect(() => {
    if (library?.state.publishSuccess === true) {
      setPublishOpen(false);
      setPublishTitle('');
      setPublishTags('');
      toast?.addToast('success', 'Design published successfully!');
      // Clear status to prevent duplicate toasts on re-renders
      library.actions.clearPublishStatus();
    } else if (library?.state.publishSuccess === false && library?.state.publishError) {
      toast?.addToast('error', library.state.publishError);
      // Clear status to prevent duplicate toasts on re-renders
      library.actions.clearPublishStatus();
    }
  }, [library?.state.publishSuccess, library?.state.publishError, toast, library?.actions]);

  // Re-fetch when My Designs filter changes (uses cache)
  useEffect(() => {
    if (library && hasFetched) {
      library.actions.fetchDesigns(true); // Uses cache if available
    }
  }, [library?.state.filterMyDesigns]);

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    library?.actions.fetchDesigns(true);
  }, [library]);

  const handlePublish = useCallback(() => {
    if (!publishTitle.trim() || !library) return;

    const tags = publishTags.split(',').map(t => t.trim()).filter(Boolean);
    library.actions.publish(publishTitle.trim(), tags, publishLicense);
  }, [library, publishTitle, publishTags, publishLicense]);

  const handleConfirmLoad = useCallback(() => {
    if (confirmLoad && library) {
      library.actions.loadDesign(confirmLoad.design);
      toast?.addToast('success', `Loaded "${confirmLoad.design.title}"`);
      setConfirmLoad(null);
    }
  }, [confirmLoad, library, toast]);

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
          <option value="LowPolyFacet">LowPolyFacet</option>
        </select>
        {/* My Designs Filter - only show when authenticated */}
        {isAuthenticated && (
          <label className="pf-library-panel__my-designs" title="Show only your designs">
            <input
              type="checkbox"
              checked={state.filterMyDesigns}
              onChange={(e) => actions.setFilterMyDesigns(e.target.checked)}
            />
            <User size={14} />
          </label>
        )}
        <IconButton
          icon={<RefreshCw size={14} />}
          aria-label="Refresh"
          onClick={() => actions.fetchDesigns(true, undefined, true)}
          variant="ghost"
          size="sm"
        />
      </form>

      {/* Load Confirmation Dialog */}
      {confirmLoad && (
        <div className="pf-library-panel__confirm-overlay">
          <div className="pf-library-panel__confirm-dialog">
            <p>Load "{confirmLoad.design.title}"?</p>
            <span>This will replace your current design.</span>
            <div className="pf-library-panel__confirm-actions">
              <Button variant="ghost" size="sm" onClick={() => setConfirmLoad(null)}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={handleConfirmLoad}>Load</Button>
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {state.error && (
        <div className="pf-library-panel__error">
          {state.error}
        </div>
      )}

      {/* Design Grid */}
      <div className="pf-library-panel__grid">
        {state.designs.map(design => (
          <div key={design.id} className="pf-library-panel__card">
            <div className="pf-library-panel__thumb">
              <DesignThumbnail design={design} width={180} height={140} />
            </div>
            <div className="pf-library-panel__card-info">
              <span className="pf-library-panel__card-title">{design.title}</span>
              <span className="pf-library-panel__card-style">{design.style}</span>
            </div>
            <div className="pf-library-panel__card-actions">
              <IconButton
                icon={<ExternalLink size={14} />}
                aria-label="Load design"
                onClick={() => setConfirmLoad({ design })}
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
        ))}
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
        {!isAuthenticated ? (
          /* Show sign-in prompt when not authenticated */
          <div className="pf-library-panel__auth-prompt">
            <LogIn size={16} />
            <span>Sign in to publish your designs</span>
          </div>
        ) : (
          /* Show publish form when authenticated */
          <>
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
                {/* Show publish error if present */}
                {state.publishError && (
                  <div className="pf-library-panel__publish-error">
                    {state.publishError}
                  </div>
                )}
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
          </>
        )}
      </div>
    </div>
  );
};
