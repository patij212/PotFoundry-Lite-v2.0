#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const componentDir = path.resolve(projectRoot, '..');
const sourceDir = path.join(projectRoot, 'build');
const primaryTargetDir = path.join(componentDir, 'frontend_build');

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
const targetDirs = [primaryTargetDir];

if (repoRoot) {
  const legacyDir = path.join(
    repoRoot,
    'pfui',
    'pfui',
    'components',
    'webgpu_component',
    'frontend_build'
  );
  if (!targetDirs.includes(legacyDir)) {
    targetDirs.push(legacyDir);
  }
}

if (!existsSync(sourceDir)) {
  console.error(`[copy_build_to_python] build output missing: ${sourceDir}`);
  process.exit(1);
}

const inlineAssets = (destinationDir) => {
  const indexPath = path.join(destinationDir, 'index.html');
  if (!existsSync(indexPath)) {
    console.error(`[copy_build_to_python] Expected build artifact missing: ${indexPath}`);
    process.exit(1);
  }

  let html = readFileSync(indexPath, 'utf8');
  const scriptRegex = /<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*><\/script>/i;
  const styleRegex = /<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/i;

  const escapeInlineScript = (code) => code.replace(/<\/script>/gi, '<\\/script>');

  const normalizeAssetPath = (href) => {
    if (href.startsWith('http://') || href.startsWith('https://')) {
      return null;
    }
    const normalized = href.startsWith('/') ? href.slice(1) : href;
    return path.resolve(path.dirname(indexPath), normalized);
  };

  const replaceAsset = (regex, wrapper) => {
    const match = html.match(regex);
    if (!match) {
      return;
    }
    const assetRel = match[1];
    const assetPath = normalizeAssetPath(assetRel);
    if (!assetPath) {
      console.warn(
        `[copy_build_to_python] Skipped non-local asset ${assetRel}; cannot inline remote resources`
      );
      return;
    }
    if (!existsSync(assetPath)) {
      console.warn(`[copy_build_to_python] Asset referenced in index.html missing: ${assetPath}`);
      return;
    }
    const startIndex = typeof match.index === 'number' ? match.index : html.indexOf(match[0]);
    if (startIndex < 0) {
      console.warn(
        `[copy_build_to_python] Failed to locate asset tag for ${assetRel} after matching; skipping inline`
      );
      return;
    }

    let payload = readFileSync(assetPath, 'utf8');
    // If we inline JS/CSS, fix up relative sourceMappingURL paths so the browser
    // can find the .map files under the `assets/` dir (we copy assets into
    // frontend_build/assets/ and inline JS/CSS into index.html which resides
    // at frontend_build/index.html). Without this rewrite the browser will
    // request "index-<hash>.js.map" relative to index.html (root), which does
    // not exist -> 404. Rewriting to `assets/` keeps the request pointing at
    // the copied file under frontend_build/assets/.
    payload = payload
      .replace(/\/\/\# sourceMappingURL=([^\s'"\n\r]+)/g, '// # sourceMappingURL=assets/$1')
      .replace(/\/\*# sourceMappingURL=([^\*]+)\*\//g, '/*# sourceMappingURL=assets/$1*/');
    const replacement = wrapper(payload);
    html = `${html.slice(0, startIndex)}${replacement}${html.slice(startIndex + match[0].length)}`;
  };

  // Ensure top-level assets' source map paths are correct too. If a JS
  // asset references a map like "//# sourceMappingURL=index-foo.js.map" then
  // the browser will look relative to the JS file. But some environments may
  // try to fetch a top-level map; normalize these to assets/ as a defensive
  // measure to avoid 404s when files are served from the frontend_build root.
  const fixAssetMaps = () => {
    const assetsPath = path.join(destinationDir, 'assets');
    if (!existsSync(assetsPath)) return;
    const files = readdirSync(assetsPath, { withFileTypes: true });
    for (const f of files) {
      if (!f.isFile() || !f.name.endsWith('.js')) continue;
      const p = path.join(assetsPath, f.name);
      let payload = readFileSync(p, 'utf8');
      // Only rewrite mappings that don't already include a path component
      // or which start with '/' so they might be resolved to the wrong place.
      payload = payload.replace(/\/\/\# sourceMappingURL=(?!assets\/)([^\s'"\n\r]+)/g, '// # sourceMappingURL=assets/$1')
                       .replace(/\/\*# sourceMappingURL=(?!assets\/)([^\*]+)\*\//g, '/*# sourceMappingURL=assets/$1*/');
      writeFileSync(p, payload);
    }
    // Also, be defensive: ensure any .map files are also available at the
    // root of frontend_build to satisfy top-level requests that some
    // browsers or server variants may produce (fallback for mis-specified
    // `sourceMappingURL` or non-standard serving arrangements).
    const topLevelMaps = files.filter(f => f.isFile() && f.name.endsWith('.map'));
    for (const m of topLevelMaps) {
      const src = path.join(assetsPath, m.name);
      const dst = path.join(destinationDir, m.name);
      if (!existsSync(dst)) {
        writeFileSync(dst, readFileSync(src));
      }
    }
  };

  replaceAsset(scriptRegex, (code) => `<script type="module">\n${escapeInlineScript(code)}\n<\/script>`);
  replaceAsset(styleRegex, (code) => `<style>\n${code}\n</style>`);

  // Rewrite any sourceMappingURL comments that would cause top-level 404s.
  fixAssetMaps();

  writeFileSync(indexPath, html);
};

const copyAndInline = (destinationDir) => {
  rmSync(destinationDir, { recursive: true, force: true });
  mkdirSync(destinationDir, { recursive: true });
  cpSync(sourceDir, destinationDir, { recursive: true });
  inlineAssets(destinationDir);
  console.log(`[copy_build_to_python] Copied ${sourceDir} -> ${destinationDir} and inlined assets`);
};

targetDirs.forEach((dir) => copyAndInline(dir));
