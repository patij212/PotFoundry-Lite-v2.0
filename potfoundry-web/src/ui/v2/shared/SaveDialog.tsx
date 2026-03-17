/**
 * SaveDialog — Save current design to the library.
 *
 * Simple modal dialog with title input and publish action.
 * Uses LibraryContext.publish() which requires Supabase + auth.
 *
 * @module ui/v2/shared/SaveDialog
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Upload } from 'lucide-react';
import { ButtonV2 } from '../controls/ButtonV2';
import { useLibraryMaybe } from '../../../context/LibraryContext';
import { useAppStore } from '../../../state';
import { useAnnounce } from './Announcer';
import './SaveDialog.css';

// ============================================================================
// Props
// ============================================================================

interface SaveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ============================================================================
// Component
// ============================================================================

export const SaveDialog: React.FC<SaveDialogProps> = ({ open, onOpenChange }) => {
  const library = useLibraryMaybe();
  const styleName = useAppStore((s) => s.style.name);
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const announce = useAnnounce();

  // Pre-fill title with style name when opening
  useEffect(() => {
    if (open) {
      setTitle(`${styleName ?? 'Custom'} Pot`);
      setTags('');
      // Focus input after animation
      setTimeout(() => inputRef.current?.select(), 100);
    }
  }, [open, styleName]);

  const publishing = library?.state.publishing ?? false;
  const publishSuccess = library?.state.publishSuccess;
  const publishError = library?.state.publishError;

  // Auto-close on success
  useEffect(() => {
    if (publishSuccess) {
      announce('Design saved to library');
      const timer = setTimeout(() => {
        library?.actions.clearPublishStatus();
        onOpenChange(false);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [publishSuccess, library, onOpenChange, announce]);

  const handleSave = useCallback(() => {
    if (!library || !title.trim()) return;
    const tagList = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    library.actions.publish(title.trim(), tagList, 'CC-BY-4.0');
  }, [library, title, tags]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && !publishing) {
        e.preventDefault();
        handleSave();
      }
    },
    [handleSave, publishing]
  );

  const supabaseReady = library?.state.ready ?? false;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="pf2-save-dialog__overlay" />
        <Dialog.Content
          className="pf2-save-dialog"
          aria-describedby={undefined}
        >
          <div className="pf2-save-dialog__header">
            <Dialog.Title className="pf2-save-dialog__title">
              Save to Library
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="pf2-save-dialog__close pf2-focus-ring"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          {!supabaseReady ? (
            <div className="pf2-save-dialog__body">
              <p className="pf2-save-dialog__notice pf2-text-label">
                Library requires sign-in. Connect with Supabase to save designs.
              </p>
            </div>
          ) : (
            <div className="pf2-save-dialog__body" onKeyDown={handleKeyDown}>
              <label className="pf2-save-dialog__field">
                <span className="pf2-text-label">Design Name</span>
                <input
                  ref={inputRef}
                  type="text"
                  className="pf2-save-dialog__input pf2-focus-ring"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="My awesome pot"
                  maxLength={100}
                  disabled={publishing}
                />
              </label>

              <label className="pf2-save-dialog__field">
                <span className="pf2-text-label">Tags (comma separated)</span>
                <input
                  type="text"
                  className="pf2-save-dialog__input pf2-focus-ring"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="planter, geometric, modern"
                  maxLength={200}
                  disabled={publishing}
                />
              </label>

              {publishError && (
                <div className="pf2-save-dialog__error" role="alert">
                  {publishError}
                </div>
              )}

              {publishSuccess && (
                <div className="pf2-save-dialog__success" role="status">
                  Design saved successfully!
                </div>
              )}

              <ButtonV2
                variant="primary"
                fullWidth
                iconLeft={<Upload size={16} />}
                onClick={handleSave}
                disabled={publishing || !title.trim()}
              >
                {publishing ? 'Saving...' : 'Save Design'}
              </ButtonV2>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
