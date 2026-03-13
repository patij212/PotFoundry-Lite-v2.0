/**
 * Copy WebGPU source files to standalone app
 * 
 * This script copies the necessary TypeScript source files from the
 * Streamlit component to the standalone potfoundry-web folder.
 * 
 * Run with: node scripts/copy-sources.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const SOURCE_DIR = path.join(ROOT, 'pfui/components/webgpu_component/frontend/src');
const DEST_DIR = path.join(ROOT, 'potfoundry-web/src');

// Files/folders to copy (excluding Streamlit-specific ones)
const TO_COPY = [
    'webgpu_core.ts',
    'camera_basis.ts',
    'camera_constants.ts',
    'camera_controller.ts',
    'camera_helpers.ts',
    'types.ts',
    'types.d.ts',
    'WebGPUPreview.css',
    'geometry',      // Full folder
    'hooks',         // Full folder  
    'state',         // Full folder
    'ui',            // Full folder
    'context',       // Full folder
    'presets',       // Full folder
    'utils',         // Full folder
];

// Files to skip (Streamlit-specific)
const SKIP_FILES = [
    'index.tsx',           // Using our own main.tsx
    'WebGPUComponent.tsx', // Legacy component
    'WebGPUPreview.tsx',   // Has Streamlit imports (we made App.tsx)
    'DevModeToggle.tsx',   // Streamlit dev mode
];

function copyRecursive(src, dest) {
    const stat = fs.statSync(src);

    if (stat.isDirectory()) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }

        const files = fs.readdirSync(src);
        for (const file of files) {
            // Skip test folders and cache
            if (file === '__tests__' || file === '__pycache__' || file.endsWith('.test.ts')) {
                continue;
            }
            copyRecursive(path.join(src, file), path.join(dest, file));
        }
    } else {
        // Skip specific files
        const basename = path.basename(src);
        if (SKIP_FILES.includes(basename)) {
            console.log(`  Skipping: ${basename}`);
            return;
        }

        fs.copyFileSync(src, dest);
        console.log(`  Copied: ${path.relative(DEST_DIR, dest)}`);
    }
}

console.log('Copying WebGPU source files to potfoundry-web...\n');
console.log(`Source: ${SOURCE_DIR}`);
console.log(`Dest:   ${DEST_DIR}\n`);

// Ensure dest exists
if (!fs.existsSync(DEST_DIR)) {
    fs.mkdirSync(DEST_DIR, { recursive: true });
}

for (const item of TO_COPY) {
    const srcPath = path.join(SOURCE_DIR, item);
    const destPath = path.join(DEST_DIR, item);

    if (fs.existsSync(srcPath)) {
        console.log(`Copying ${item}...`);
        copyRecursive(srcPath, destPath);
    } else {
        console.log(`Warning: ${item} not found`);
    }
}

console.log('\nDone! Now run:');
console.log('  cd potfoundry-web');
console.log('  npm install');
console.log('  npm run dev');
