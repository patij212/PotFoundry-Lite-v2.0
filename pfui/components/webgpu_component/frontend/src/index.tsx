import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Streamlit } from 'streamlit-component-lib';

import './styles.css';
import WebGPUComponent from './WebGPUComponent';
import WebGPUPreview from './WebGPUPreview';
import { DevModeToggle, useUIMode, UIMode } from './DevModeToggle';

// Determine if development mode is enabled
const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';

/**
 * Root application component with UI mode switching support
 * 
 * The component renders either the new WebGPUPreview (with embedded UI) 
 * or the legacy WebGPUComponent based on:
 * 1. Streamlit's `embedded_ui` arg (highest priority when passed)
 * 2. Local storage preference (for dev mode switching)
 * 3. Default to new UI
 */
const App: React.FC = () => {
  const [localUIMode, setLocalUIMode] = useUIMode();
  const [streamlitEmbeddedUI, setStreamlitEmbeddedUI] = useState<boolean | null>(null);
  
  // Listen for Streamlit args to check embedded_ui flag
  useEffect(() => {
    const handleRender = (event: Event) => {
      try {
        // Streamlit sends args via custom event
        const customEvent = event as CustomEvent;
        const args = customEvent?.detail?.args;
        if (args && typeof args.embedded_ui === 'boolean') {
          setStreamlitEmbeddedUI(args.embedded_ui);
        }
      } catch (err) {
        // Ignore parsing errors
      }
    };
    
    // Try to get initial args from Streamlit
    window.addEventListener('streamlit:render', handleRender);
    
    return () => {
      window.removeEventListener('streamlit:render', handleRender);
    };
  }, []);
  
  // Determine effective UI mode
  // Priority: Streamlit arg > local storage > default (new)
  const effectiveUIMode: UIMode = streamlitEmbeddedUI === true 
    ? 'new' 
    : streamlitEmbeddedUI === false 
      ? 'legacy' 
      : localUIMode;
  
  return (
    <>
      {/* Render the appropriate component based on UI mode */}
      {effectiveUIMode === 'new' ? <WebGPUPreview /> : <WebGPUComponent />}
      
      {/* Development mode toggle (only shown in dev builds) */}
      {isDev && (
        <DevModeToggle
          currentMode={effectiveUIMode}
          onModeChange={setLocalUIMode}
        />
      )}
    </>
  );
};

// Mount the application
const container = document.getElementById('root');

if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} else {
  console.error('WebGPU component root element not found');
}
