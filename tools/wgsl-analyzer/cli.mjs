#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { WgslReflect } = require("wgsl_reflect");

const [, , filePath] = process.argv;

if (!filePath) {
  console.error("Usage: wgsl-analyzer <wgsl-file>");
  process.exit(64);
}

const absolutePath = resolve(filePath);
let source = "";
try {
  source = readFileSync(absolutePath, "utf8");
} catch (err) {
  console.error(`Unable to read ${absolutePath}:`, err?.message ?? err);
  process.exit(66);
}

try {
  const parser = new WgslReflect(source);
  const entries = parser.entry ?? parser.entryPoints ?? {};
  const entryCount = [entries.vertex, entries.fragment, entries.compute]
    .filter(Array.isArray)
    .reduce((acc, arr) => acc + arr.length, 0);
  console.log(`WGSL OK \u2022 ${entryCount} entry point(s) \u2022 ${absolutePath}`);
  process.exit(0);
} catch (err) {
  console.error(`WGSL validation failed for ${absolutePath}:`, err?.message ?? err);
  if (err?.stack) {
    console.error(err.stack);
  }
  process.exit(1);
}
