#!/usr/bin/env node
// Hook 2 (R16.2): when .gitignore is saved, warn if it would ignore the .kiro
// folder. The hackathon requires .kiro to be committed to the public repo.
// Checks both for a literal `.kiro` rule and, authoritatively, by asking git
// whether `.kiro/` is currently ignored.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

let warned = false;

// 1) Literal scan of .gitignore for a .kiro rule (ignores comments).
try {
  const text = readFileSync(".gitignore", "utf8");
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const rule = t.replace(/^!/, "").replace(/^\//, "").replace(/\/$/, "");
    if (rule === ".kiro" || rule.startsWith(".kiro/")) {
      console.error(`[check-gitignore] WARNING: .gitignore contains a rule that targets .kiro ("${t}"). The .kiro folder MUST stay committed.`);
      warned = true;
    }
  }
} catch (e) {
  console.error(`[check-gitignore] could not read .gitignore: ${e.message}`);
}

// 2) Authoritative check: does git actually ignore .kiro right now?
const res = spawnSync("git", ["check-ignore", "-q", ".kiro"], { cwd: process.cwd() });
// exit 0 => path IS ignored; 1 => not ignored; other => error (e.g. no git).
if (res.status === 0) {
  console.error("[check-gitignore] WARNING: git reports that .kiro is IGNORED. Remove the rule so .kiro is committed.");
  warned = true;
}

if (warned) {
  // Exit 2 so the warning is surfaced prominently; this is advisory.
  process.exit(2);
}
console.log("[check-gitignore] OK: .kiro is not ignored.");
process.exit(0);
