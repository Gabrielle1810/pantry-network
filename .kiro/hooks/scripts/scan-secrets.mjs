#!/usr/bin/env node
// Hook 3 (R16.3): when a file is saved, scan it for strings that look like API
// keys or for NEXT_PUBLIC_ variables holding secrets, and warn.
//
// Runs on every save, so it self-limits by path: it only scans files we author
// (src/**, common config files, .env.example, .gitignore) and skips generated
// or vendored files (node_modules, .next, package-lock.json) to stay fast and
// quiet. .env.example is scanned but placeholder-looking values are allowed.
import { readFileSync, statSync } from "node:fs";

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function extractPath(raw) {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    return (
      j.filePath || j.path || j.file || j.savedFile ||
      (j.payload && (j.payload.filePath || j.payload.path)) ||
      (j.context && (j.context.filePath || j.context.path)) ||
      null
    );
  } catch {
    const t = raw.trim();
    return t && !t.startsWith("{") ? t : null;
  }
}

const raw = readStdin();
const filePath = extractPath(raw) || process.argv[2] || "";
if (!filePath) {
  console.log("[scan-secrets] no file path provided; skipping.");
  process.exit(0);
}

const norm = filePath.replace(/\\/g, "/");
const base = norm.split("/").pop();

// --- Path gate: skip generated / vendored / lockfiles ---
const EXCLUDE = [/(^|\/)node_modules\//, /(^|\/)\.next\//, /(^|\/)package-lock\.json$/, /(^|\/)\.git\//];
if (EXCLUDE.some((re) => re.test(norm))) {
  console.log(`[scan-secrets] ${base}: excluded path; skipped.`);
  process.exit(0);
}

// Only scan files we author.
const CONFIG_FILES = new Set([
  ".gitignore", ".env.example", "package.json", "next.config.ts",
  "tsconfig.json", "eslint.config.mjs", "vitest.config.mts",
]);
const inSrc = /(^|\/)src\//.test(norm);
const isScannableConfig = CONFIG_FILES.has(base);
const isHookScript = /(^|\/)\.kiro\/hooks\//.test(norm);
if (!inSrc && !isScannableConfig && !isHookScript) {
  console.log(`[scan-secrets] ${base}: outside scan scope (src/**, config files, .kiro/hooks); skipped.`);
  process.exit(0);
}

let content;
try {
  if (statSync(norm).size > 1_000_000) {
    console.log(`[scan-secrets] ${base}: larger than 1 MB; skipped.`);
    process.exit(0);
  }
  content = readFileSync(norm, "utf8");
} catch (e) {
  console.log(`[scan-secrets] ${base}: could not read (${e.message}); skipped.`);
  process.exit(0);
}

const isExample = base === ".env.example";
const findings = [];
const lines = content.split(/\r?\n/);

// Patterns for common real-looking secrets.
const KEY_PATTERNS = [
  { name: "Anthropic API key", re: /sk-ant-[A-Za-z0-9_-]{8,}/ },
  { name: "OpenAI API key", re: /sk-[A-Za-z0-9]{20,}/ },
  { name: "AWS access key id", re: /AKIA[0-9A-Z]{16}/ },
  { name: "Google API key", re: /AIza[0-9A-Za-z_-]{35}/ },
  { name: "GitHub token", re: /gh[pousr]_[A-Za-z0-9]{20,}/ },
  { name: "Slack token", re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: "JWT", re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: "generic private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];

function looksPlaceholder(val) {
  return /^(|change-me|changeme|your[-_].*|placeholder|example|xx+|<.*>|\.{3}|todo|replace[-_].*)$/i.test(val.trim());
}

lines.forEach((line, i) => {
  const n = i + 1;

  // NEXT_PUBLIC_ variable that appears to hold a secret value.
  const pub = line.match(/NEXT_PUBLIC_[A-Z0-9_]*\s*[:=]\s*(.+)$/);
  if (pub) {
    const val = pub[1].replace(/^["'`]|["'`],?$/g, "").trim();
    if (val && !looksPlaceholder(val) && /(key|secret|token|pass|pwd|cred)/i.test(line)) {
      findings.push(`line ${n}: NEXT_PUBLIC_ variable appears to hold a secret (secrets must never be NEXT_PUBLIC_).`);
    }
  }

  for (const p of KEY_PATTERNS) {
    const m = line.match(p.re);
    if (m) {
      // In .env.example, allow obvious placeholders.
      if (isExample && looksPlaceholder(m[0])) continue;
      findings.push(`line ${n}: looks like a ${p.name}.`);
    }
  }
});

if (findings.length) {
  console.error(`[scan-secrets] WARNING in ${norm}:`);
  for (const f of findings) console.error(`  - ${f}`);
  console.error("  If any of these are real secrets, remove them: secrets belong only in untracked .env files.");
  process.exit(2);
}

console.log(`[scan-secrets] ${base}: clean.`);
process.exit(0);
