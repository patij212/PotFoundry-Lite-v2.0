#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const componentDir = path.resolve(projectRoot, '..');
const primaryTarget = path.join(componentDir, 'frontend_build', 'index.html');
const STYLE_PATTERN = /<style>[\s\S]+?<\/style>/i;

const findRepoRoot = (startDir) => {
  let current = startDir;
  while (current && current !== path.dirname(current)) {
    if (existsSync(path.join(current, '.git')) || existsSync(path.join(current, 'pyproject.toml'))) {
      return current;
    }
    current = path.dirname(current);
  }
  return null;
};

const repoRoot = findRepoRoot(componentDir);
const targetFiles = [primaryTarget];

if (repoRoot) {
  const legacyTarget = path.join(
    repoRoot,
    'pfui',
    'pfui',
    'components',
    'webgpu_component',
    'frontend_build',
    'index.html'
  );
  if (!targetFiles.includes(legacyTarget)) {
    targetFiles.push(legacyTarget);
  }
}

const validateArtifact = (targetFile) => {
  if (!existsSync(targetFile)) {
    console.error(`[verify_webgpu_build] Missing build artifact: ${targetFile}`);
    process.exit(1);
  }

  const html = readFileSync(targetFile, 'utf8');

  const scriptTags = [];
  const externalScripts = [];
  let cursor = 0;
  while (cursor < html.length) {
    const start = html.indexOf('<script', cursor);
    if (start === -1) {
      break;
    }
    const prev = start > 0 ? html[start - 1] : '';
    if (prev === '"' || prev === "'" || prev === '`') {
      cursor = start + 7;
      continue;
    }
    const close = html.indexOf('>', start);
    if (close === -1) {
      break;
    }
    const tag = html.slice(start, close + 1);
    if (/src\s*=/.test(tag)) {
      externalScripts.push(tag);
    } else {
      scriptTags.push(tag);
    }
    cursor = close + 1;
  }

  if (scriptTags.length === 0) {
    console.error('[verify_webgpu_build] Inline module script not detected in index.html');
    process.exit(1);
  }

  if (externalScripts.length > 0) {
    console.error('[verify_webgpu_build] External module scripts remain after inlining');
    process.exit(1);
  }

  if (!STYLE_PATTERN.test(html)) {
    console.error('[verify_webgpu_build] Inline stylesheet not detected in index.html');
    process.exit(1);
  }

  console.log(`[verify_webgpu_build] Verified inline build artifact at ${targetFile}`);
};

targetFiles.forEach(validateArtifact);
