#!/usr/bin/env node
// Hook 1 (R16.1): when a file under src/lib/dates or src/lib/vision is saved,
// run the related Vitest files. Reads the saved file path from the hook's
// stdin JSON (falling back to argv), maps it to its module directory, and runs
// `vitest run <dir>`. If the module has no tests yet, Vitest exits cleanly.
import { spawnSync } from "node:child_process";

function readStdin() {
  try {
    const fs = require("node:fs");
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function extractPath(raw) {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    return (
      j.filePath ||
      j.path ||
      j.file ||
      j.savedFile ||
      (j.payload && (j.payload.filePath || j.payload.path)) ||
      (j.context && (j.context.filePath || j.context.path)) ||
      null
    );
  } catch {
    // Not JSON: treat the whole thing as a path if it looks like one.
    const t = raw.trim();
    return t && !t.startsWith("{") ? t : null;
  }
}

const createRequire = (await import("node:module")).createRequire;
const require = createRequire(import.meta.url);

const raw = readStdin();
const filePath = extractPath(raw) || process.argv[2] || "";
const norm = filePath.replace(/\\/g, "/");

const m = norm.match(/src\/lib\/(dates|vision)\b/);
if (!m) {
  console.log(`[run-related-tests] ${filePath || "(no path)"} is not under src/lib/dates or src/lib/vision; nothing to run.`);
  process.exit(0);
}

const dir = `src/lib/${m[1]}`;
console.log(`[run-related-tests] change in ${dir} → running: npx vitest run ${dir}`);

const res = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["vitest", "run", dir, "--passWithNoTests"],
  { stdio: "inherit", cwd: process.cwd() }
);
process.exit(res.status ?? 0);
