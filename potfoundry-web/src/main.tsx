/**
 * PotFoundry Web - Standalone Entry Point
 * 
 * This is the main entry point for the standalone PotFoundry web app,
 * completely independent of Streamlit.
 */

// React import not needed with new JSX transform if not using React directly
import { createRoot } from 'react-dom/client';
import { installConsolePatch } from './infra/logging/ConsolePatch';

// Install console patch immediately
installConsolePatch();

import App from './App';
import './styles.css';

const container = document.getElementById('root');

if (container) {
    const root = createRoot(container);
    root.render(
        <App />
    );
} else {
    console.error('Root element not found');
}
