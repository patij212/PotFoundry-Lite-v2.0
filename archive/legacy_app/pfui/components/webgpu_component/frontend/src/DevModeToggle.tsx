/**
 * DevModeToggle - Development-only component for toggling between UI modes
 * 
 * Displays a floating button in development mode to switch between
 * the original WebGPUComponent and the new WebGPUPreview with
 * the integrated Zustand-powered UI.
 */
import React, { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'potfoundry-dev-ui-mode';

export type UIMode = 'legacy' | 'new';

interface DevModeToggleProps {
  currentMode: UIMode;
  onModeChange: (mode: UIMode) => void;
}

/**
 * Floating toggle button for switching between UI modes during development
 */
export const DevModeToggle: React.FC<DevModeToggleProps> = ({
  currentMode,
  onModeChange,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const handleToggle = useCallback(() => {
    const newMode: UIMode = currentMode === 'legacy' ? 'new' : 'legacy';
    localStorage.setItem(STORAGE_KEY, newMode);
    onModeChange(newMode);
  }, [currentMode, onModeChange]);
  
  return (
    <div
      style={{
        position: 'fixed',
        top: 8,
        right: 8,
        zIndex: 10000,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          borderRadius: 6,
          background: 'rgba(30, 30, 30, 0.9)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
          transition: 'all 0.2s ease',
        }}
      >
        {/* Mode indicator */}
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: currentMode === 'new' ? '#4ade80' : '#facc15',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {currentMode === 'new' ? '✨ New UI' : '📦 Legacy'}
        </span>
        
        {/* Toggle button */}
        <button
          onClick={handleToggle}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 8px',
            fontSize: 11,
            fontWeight: 500,
            color: '#fff',
            background: currentMode === 'new' 
              ? 'linear-gradient(135deg, #22c55e, #16a34a)' 
              : 'linear-gradient(135deg, #eab308, #ca8a04)',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            transition: 'transform 0.1s ease, box-shadow 0.1s ease',
          }}
          onMouseDown={(e) => {
            (e.target as HTMLButtonElement).style.transform = 'scale(0.95)';
          }}
          onMouseUp={(e) => {
            (e.target as HTMLButtonElement).style.transform = 'scale(1)';
          }}
        >
          ↔️ Switch
        </button>
        
        {/* Expanded info panel */}
        {isExpanded && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 4,
              padding: 12,
              minWidth: 220,
              background: 'rgba(30, 30, 30, 0.95)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
            }}
          >
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 4 }}>
                🔧 Development Mode
              </div>
              <div style={{ fontSize: 11, color: '#888', lineHeight: 1.4 }}>
                Toggle between UI implementations for testing and comparison.
              </div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 11, color: '#666' }}>
                <strong style={{ color: '#888' }}>Legacy:</strong> Original WebGPUComponent
              </div>
              <div style={{ fontSize: 11, color: '#666' }}>
                <strong style={{ color: '#888' }}>New:</strong> Zustand + Radix UI
              </div>
            </div>
            
            <div 
              style={{ 
                marginTop: 8, 
                paddingTop: 8, 
                borderTop: '1px solid rgba(255,255,255,0.1)',
                fontSize: 10,
                color: '#555',
              }}
            >
              This toggle only appears in development builds.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Hook to manage UI mode state with localStorage persistence
 */
export const useUIMode = (): [UIMode, (mode: UIMode) => void] => {
  const [mode, setMode] = useState<UIMode>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'new' || stored === 'legacy') {
        return stored;
      }
    }
    return 'new'; // Default to new UI - the refactored version!
  });
  
  const setModeAndPersist = useCallback((newMode: UIMode) => {
    localStorage.setItem(STORAGE_KEY, newMode);
    setMode(newMode);
  }, []);
  
  return [mode, setModeAndPersist];
};

/**
 * Get initial UI mode from URL params or localStorage
 */
export const getInitialUIMode = (): UIMode => {
  if (typeof window === 'undefined') return 'new';
  
  // Check URL param first (highest priority)
  const urlParams = new URLSearchParams(window.location.search);
  const urlMode = urlParams.get('ui');
  if (urlMode === 'new') return 'new';
  if (urlMode === 'legacy') return 'legacy';
  
  // Check localStorage
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'new' || stored === 'legacy') return stored;
  
  // Check env var (set during build)
  if (import.meta.env.VITE_USE_NEW_UI === 'false') return 'legacy';
  
  return 'new'; // Default to new UI
};

export default DevModeToggle;
