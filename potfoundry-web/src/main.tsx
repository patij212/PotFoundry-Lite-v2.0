/**
 * PotFoundry Web - Standalone Entry Point
 * 
 * This is the main entry point for the standalone PotFoundry web app,
 * completely independent of Streamlit.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
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
