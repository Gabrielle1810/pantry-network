// Take-out rules (PH): reasons, quantity clamping, the feed, its stats, and the
// "Fix" math. Pure. A feed entry is a group of ledger rows; it carries only a
// source ("Student scan" / "Staff"), products with quantities, and (for staff) a
// reason. There is no name field anywhere (no-names rule, PO.5).
import type { HeldRec, LedgerRec } from "@/lib/db/store";
import { localDateOf } from "@/lib/dates";
import { COMMUNITY_LABEL } from "@/lib/labels";

// ---- reasons (stored as stable codes; labels may be renamed) ----
export type ReasonCode = "expired" | "damaged" | "given_out" | "moved_to_community" | "other";

export const REASONS: { code: ReasonCode; label: string }[] = [
  { code: "expired", label: "Expired" },
  { code: "damaged", label: "Damaged" },
  { code: "given_out", label: "Given out by hand" },
  { code: "moved_to_community", label: `Moved to ${COMMUNITY_LABEL}` },
  { code: "other", label: "Other" },
];

export function isReasonCode(v: string | null | undefined): v is ReasonCode {
  return REASONS.some((r) => r.code === v);
}

export function reasonLabel(code: string | null): string | null {
  return REASONS.find((r) => r.code === code)?.label ?? null;
}

/** Red styling for reasons that count as food wasted. */
export function isWasteReason(code: string | null): boolean {
  return code === "expired" || code === "damaged";
}

export const REASON_NOTE = `Expired and damaged items count as food wasted in your report. Given out and moved to ${COMMUNITY_LABEL} count as food used.`;

// ---- lines ----
export interface LineInput {
  productId: string;
  qty: number;
}

/** Sum duplicate products and drop anything that isn't a positive whole number. */
export function mergeLines(lines: LineInput[]): LineInput[] {
  const sum = new Map<string, number>();
  for (const l of lines) {
    if (!Number.isInteger(l.qty) || l.qty <= 0) continue;
    sum.set(l.productId, (sum.get(l.productId) ?? 0) + l.qty);
  }
  return [...sum.entries()].map(([productId, qty]) => ({ productId, qty }));
}

/**
 * Merge lines, then cap each at what is available (on shelf minus reserved).
 * Products with no availability entry are dropped, so unknown ids never apply.
 */
export function clampLines(lines: LineInput[], available: Map<string, number>): LineInput[] {
  const out: LineInput[] = [];
  for (const l of mergeLines(lines)) {
    const cap = available.get(l.productId);
    if (cap === undefined) continue;
    const qty = Math.min(l.qty, Math.max(0, cap));
    if (qty > 0) out.push({ productId: l.productId, qty });
  }
  return out;
}

export function sumQty(lines: { qty: number }[]): number {
  return lines.reduce((n, l) => n + l.qty, 0);
}

export function recordLabel(n: number): string {
  return `Record ${n} item${n === 1 ? "" : "s"}`;
}

// ---- feed ----
export interface FeedLine {
  productId: string;
  name: string;
  category: string;
  qty: number;
}

export interface FeedEntry {
  /** Group id for recorded entries, held-submission id for held ones. */
  id: string;
  kind: "recorded" | "held";
  /** ISO timestamp. */
  at: string;
  source: "student" | "staff";
  /** Staff removals only. */
  reason: ReasonCode | null;
  lines: FeedLine[];
}

const FEED_KINDS = new Set(["takeout", "removal", "fix"]);

/**
 * Today's feed (campus time zone), newest first. Rows of one group are netted
 * per product, so a "fix" row (positive delta) lowers the entry's quantity and
 * an entry netted to zero disappears. Held student submissions are included
 * (any date) until staff accept or discard them.
 */
export function buildFeed(args: {
  ledger: LedgerRec[];
  products: Map<string, { name: string; category: string }>;
  held: HeldRec[];
  todayIso: string;
  tz?: string;
}): FeedEntry[] {
  const { ledger, products, held, todayIso, tz } = args;
  const groups = new Map<string, LedgerRec[]>();
  for (const r of ledger) {
    if (!r.groupId || r.source === "system" || !FEED_KINDS.has(r.kind)) continue;
    groups.set(r.groupId, [...(groups.get(r.groupId) ?? []), r]);
  }

  const entries: FeedEntry[] = [];
  for (const [id, rows] of groups) {
    const first = [...rows].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))[0];
    if (localDateOf(first.createdAt, tz) !== todayIso) continue;
    const net = new Map<string, number>();
    for (const r of rows) net.set(r.productId, (net.get(r.productId) ?? 0) - r.delta);
    const lines: FeedLine[] = [];
    for (const [productId, qty] of net) {
      const p = products.get(productId);
      if (p && qty > 0) lines.push({ productId, name: p.name, category: p.category, qty });
    }
    if (lines.length === 0) continue;
    const reason = rows.find((r) => r.kind !== "fix")?.reason ?? null;
    entries.push({
      id,
      kind: "recorded",
      at: first.createdAt,
      source: first.source === "student" ? "student" : "staff",
      reason: isReasonCode(reason) ? reason : null,
      lines,
    });
  }

  for (const h of held) {
    if (h.status !== "held") continue;
    const lines: FeedLine[] = [];
    for (const l of h.lines) {
      const p = products.get(l.productId);
      if (p && l.qty > 0) lines.push({ productId: l.productId, name: p.name, category: p.category, qty: l.qty });
    }
    if (lines.length > 0) {
      entries.push({ id: h.id, kind: "held", at: h.createdAt, source: "student", reason: null, lines });
    }
  }

  return entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

export type FeedFilter = "all" | "students" | "staff";

export function filterFeed(feed: FeedEntry[], filter: FeedFilter): FeedEntry[] {
  if (filter === "all") return feed;
  const want = filter === "students" ? "student" : "staff";
  return feed.filter((e) => e.source === want);
}

/** "Student scan" or "Staff". Never a person. */
export function sourceLabel(e: Pick<FeedEntry, "source">): string {
  return e.source === "student" ? "Student scan" : "Staff";
}

// ---- stats for the smart cards ----
export interface StatsRow {
  productId: string;
  name: string;
  category: string;
  unit: string;
  onShelf: number;
}

export interface FeedStats {
  total: number;
  byStudents: number;
  byStaff: number;
  /** Staff removals by reason code. */
  reasons: Partial<Record<ReasonCode, number>>;
  top: { productId: string; name: string; category: string; taken: number; daysLeft: number; out: boolean } | null;
}

export function feedStats(feed: FeedEntry[], rows: StatsRow[]): FeedStats {
  const recorded = feed.filter((e) => e.kind === "recorded");
  let byStudents = 0;
  let byStaff = 0;
  const reasons: Partial<Record<ReasonCode, number>> = {};
  const taken = new Map<string, number>();
  for (const e of recorded) {
    const n = sumQty(e.lines);
    if (e.source === "student") {
      byStudents += n;
      for (const l of e.lines) taken.set(l.productId, (taken.get(l.productId) ?? 0) + l.qty);
    } else {
      byStaff += n;
      if (e.reason) reasons[e.reason] = (reasons[e.reason] ?? 0) + n;
    }
  }
  let top: FeedStats["top"] = null;
  for (const [productId, n] of taken) {
    const row = rows.find((r) => r.productId === productId);
    if (!row) continue;
    if (!top || n > top.taken) {
      top = {
        productId,
        name: row.name,
        category: row.category,
        taken: n,
        daysLeft: row.onShelf > 0 ? Math.max(1, Math.ceil(row.onShelf / n)) : 0,
        out: row.onShelf === 0,
      };
    }
  }
  return { total: byStudents + byStaff, byStudents, byStaff, reasons, top };
}

/** "31 taken by students · 6 removed by staff (2 expired, 2 given out by hand)" */
export function outTodaySub(s: FeedStats): string {
  const parts = Object.entries(s.reasons)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([code, n]) => `${n} ${(reasonLabel(code) ?? code).toLowerCase()}`);
  return `${s.byStudents} taken by students · ${s.byStaff} removed by staff${parts.length ? ` (${parts.join(", ")})` : ""}`;
}

// ---- Fix ----
export interface FixChange {
  productId: string;
  /** Positive puts units back on the shelf; negative takes more off. */
  delta: number;
}

/**
 * Turn an edited entry into ledger changes. Each product's new quantity is
 * clamped to 0..(current + still available), and the change is the difference.
 */
export function planFix(current: FeedLine[], requested: LineInput[], available: Map<string, number>): FixChange[] {
  const want = new Map(mergeLinesAllowZero(requested));
  const changes: FixChange[] = [];
  for (const line of current) {
    const asked = want.get(line.productId) ?? 0;
    const max = line.qty + Math.max(0, available.get(line.productId) ?? 0);
    const next = Math.min(Math.max(0, asked), max);
    if (next !== line.qty) changes.push({ productId: line.productId, delta: line.qty - next });
  }
  return changes;
}

function mergeLinesAllowZero(lines: LineInput[]): [string, number][] {
  const sum = new Map<string, number>();
  for (const l of lines) {
    if (!Number.isInteger(l.qty) || l.qty < 0) continue;
    sum.set(l.productId, (sum.get(l.productId) ?? 0) + l.qty);
  }
  return [...sum.entries()];
}

// ---- Record items out: modal line helpers (no UI logic in components) ----
export function setLineQty(lines: LineInput[], productId: string, qty: number, cap: number): LineInput[] {
  const next = Math.min(Math.max(0, Math.round(qty)), Math.max(0, cap));
  return lines.map((l) => (l.productId === productId ? { ...l, qty: next } : l));
}

export function addLine(lines: LineInput[], productId: string, cap: number): LineInput[] {
  if (cap <= 0 || lines.some((l) => l.productId === productId)) return lines;
  return [...lines, { productId, qty: 1 }];
}

export function dropLine(lines: LineInput[], productId: string): LineInput[] {
  return lines.filter((l) => l.productId !== productId);
}

/**
 * "Just now", "43 min ago", "1 hour ago". `nowIso` is passed in (not read from
 * the clock) so the server render and the client render print the same text.
 */
export function agoLabel(atIso: string, nowIso: string): string {
  const minutes = Math.max(0, Math.round((Date.parse(nowIso) - Date.parse(atIso)) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

/** How long Undo is offered after recording, in ms. */
export const UNDO_MS = 10_000;
/** Server-side limit on undo, so it can't be used to erase old history. */
export const UNDO_SERVER_WINDOW_MS = 2 * 60_000;
