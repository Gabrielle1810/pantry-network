"use client";

// Take-out page (PH). Cards (Out today, Most taken, Count looks off) and the
// "Out today" feed with All / Students / Staff filters. NO names anywhere: an
// entry shows only "Student scan" or "Staff", product chips with quantities,
// and (for staff) the reason. Everything updates in place; the modals mount once
// when opened and keep their own state while the page data refreshes behind them.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { SmartCardShell, cardAction } from "@/components/ui/SmartCard";
import { btn } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import type { CountCheckView, InventoryRow } from "@/lib/db/app-types";
import { categoryMeta } from "@/lib/items/category-meta";
import {
  agoLabel,
  feedStats,
  filterFeed,
  isWasteReason,
  outTodaySub,
  reasonLabel,
  sourceLabel,
  sumQty,
  type FeedEntry,
  type FeedFilter,
  type LineInput,
  type ReasonCode,
} from "@/lib/takeout";
import { COMMUNITY_SLUG } from "@/lib/labels";
import { postTakeout } from "./api";
import { FixModal } from "./FixModal";
import { RecordOutModal, type RecordPreset, type RecordedInfo } from "./RecordOutModal";
import { showRecorded } from "./recorded";

const SHOWN = 7;
const FILTERS: { key: FeedFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "students", label: "Students" },
  { key: "staff", label: "Staff" },
];

function expiredPreset(rows: InventoryRow[]): RecordPreset {
  const lines: LineInput[] = rows
    .filter((r) => r.status === "expired" && r.onShelf - r.reserved > 0)
    .map((r) => ({ productId: r.productId, qty: r.onShelf - r.reserved }));
  return { lines, reason: "expired" };
}

export function TakeoutView({
  feed,
  rows,
  checks,
  nowIso,
  initialRemove,
}: {
  feed: FeedEntry[];
  rows: InventoryRow[];
  checks: CountCheckView[];
  nowIso: string;
  initialRemove: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [showAll, setShowAll] = useState(false);
  const [record, setRecord] = useState<RecordPreset | null>(() => (initialRemove ? expiredPreset(rows) : null));
  const [fixId, setFixId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const stats = feedStats(
    feed,
    rows.map((r) => ({ productId: r.productId, name: r.name, category: r.category, unit: r.unit, onShelf: r.onShelf })),
  );
  const shown = filterFeed(feed, filter);
  const visible = showAll ? shown : shown.slice(0, SHOWN);
  const fixing = feed.find((e) => e.id === fixId && e.kind === "recorded") ?? null;
  const check = checks[0];

  function openRecord(preset: RecordPreset) {
    // Drop ?remove=expired from the address without navigating, so a refresh doesn't reopen it.
    window.history.replaceState(null, "", "/takeout");
    setRecord(preset);
  }

  function recorded(info: RecordedInfo) {
    setRecord(null);
    router.refresh();
    showRecorded(info, toast, router.refresh);
  }

  async function act(key: string, body: Parameters<typeof postTakeout>[0], done: string) {
    if (busy) return;
    setBusy(key);
    const r = await postTakeout(body);
    setBusy(null);
    router.refresh();
    toast.show(r.ok ? done : (r.message ?? "That didn't go through. Try again."));
  }

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Take-out</h1>
          <span className="text-[15px] text-muted">Everything that left the shelf: student scans and staff removals</span>
        </div>
        <button
          type="button"
          className={`${btn.base} ${btn.dark}`}
          onClick={() => openRecord({ lines: [], reason: "given_out" })}
        >
          <Icon name="minus" size={15} />
          Record items out
        </button>
      </header>

      <section className={`grid gap-4 sm:grid-cols-2 ${check ? "xl:grid-cols-3" : "xl:grid-cols-2"}`}>
        <SmartCardShell
          tone="green"
          icon="arrow-up-right"
          label="Out today"
          title={`${stats.total} item${stats.total === 1 ? "" : "s"} left the shelf`}
          sub={outTodaySub(stats)}
        >
          <Link href="/inventory" className={cardAction.plain}>
            See Inventory
          </Link>
        </SmartCardShell>

        {stats.top ? (
          <SmartCardShell
            tone="blue"
            icon="flame"
            label="Most taken"
            title={`${stats.top.name} · ${stats.top.taken} today`}
            sub={
              stats.top.out
                ? "Already out of stock"
                : `At this pace they run out in about ${stats.top.daysLeft} day${stats.top.daysLeft === 1 ? "" : "s"}`
            }
          >
            <Link
              href={`/${COMMUNITY_SLUG}?request=${encodeURIComponent(stats.top.name)}&category=${encodeURIComponent(stats.top.category)}`}
              className={cardAction.primary}
            >
              Request more
            </Link>
          </SmartCardShell>
        ) : null}

        {check ? (
          <SmartCardShell
            tone="amber"
            icon="scale"
            label="Count looks off"
            title={`${check.name}: you counted ${check.counted}, the system says ${check.system}`}
            sub="Some take-outs were probably not scanned"
          >
            <button
              type="button"
              className={cardAction.primary}
              disabled={busy !== null}
              onClick={() =>
                act(`use-${check.id}`, { action: "recount", checkId: check.id, useCounted: true }, `${check.name} count set to ${check.counted}`)
              }
            >
              Use {check.counted}
            </button>
            <button
              type="button"
              className={cardAction.plain}
              disabled={busy !== null}
              onClick={() =>
                act(`keep-${check.id}`, { action: "recount", checkId: check.id, useCounted: false }, `Kept ${check.system}. We'll ask again after the next count`)
              }
            >
              Keep {check.system}
            </button>
          </SmartCardShell>
        ) : null}
      </section>

      <section className="rounded-lg border border-line bg-surface" aria-labelledby="out-today">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="out-today" className="text-lg font-semibold">
              Out today
            </h2>
            <div className="flex gap-1" role="tablist" aria-label="Who took it">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  role="tab"
                  aria-selected={filter === f.key}
                  onClick={() => setFilter(f.key)}
                  className={`min-h-11 rounded-full px-3.5 text-sm font-medium ${
                    filter === f.key ? "bg-primary text-white" : "bg-chip text-chip-ink hover:bg-line"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-sm text-muted">
            <Icon name="eye-off" size={15} />
            No names are ever recorded for students
          </span>
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-1 px-4 py-12 text-muted">
            <Icon name="inbox" size={22} />
            <b className="text-ink">Nothing here yet</b>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {visible.map((e) => (
              <FeedRow
                key={`${e.kind}-${e.id}`}
                entry={e}
                nowIso={nowIso}
                busy={busy !== null}
                onFix={() => setFixId(e.id)}
                onHeld={(accept) =>
                  act(`held-${e.id}`, { action: "held", heldId: e.id, accept }, accept ? "Accepted. Stock updated." : "Discarded. Stock unchanged.")
                }
              />
            ))}
          </ul>
        )}

        {shown.length > SHOWN ? (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="min-h-11 w-full border-t border-line px-4 text-sm font-semibold text-green hover:bg-green-soft"
          >
            {showAll ? "Show less" : `Show all ${shown.length} entries`}
          </button>
        ) : null}

        <Link
          href="/poster"
          className="flex min-h-11 items-center justify-center gap-2 border-t border-line px-4 text-sm text-muted hover:bg-hover"
        >
          <Icon name="printer" size={15} />
          Poster lost or damaged? Reprint the QR poster
        </Link>
      </section>

      {record ? (
        <RecordOutModal rows={rows} preset={record} onClose={() => setRecord(null)} onRecorded={recorded} />
      ) : null}
      {fixing ? (
        <FixModal
          entry={fixing}
          rows={rows}
          nowIso={nowIso}
          onClose={() => setFixId(null)}
          onDone={(message) => {
            setFixId(null);
            router.refresh();
            toast.show(message);
          }}
        />
      ) : null}
      {toast.node}
    </>
  );
}

function FeedRow({
  entry,
  nowIso,
  busy,
  onFix,
  onHeld,
}: {
  entry: FeedEntry;
  nowIso: string;
  busy: boolean;
  onFix: () => void;
  onHeld: (accept: boolean) => void;
}) {
  const held = entry.kind === "held";
  const reason = reasonLabel(entry.reason);
  const total = sumQty(entry.lines);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <span className="inline-flex w-28 flex-none items-center gap-1.5 text-sm text-muted">
        <Icon name="clock" size={14} />
        {agoLabel(entry.at, nowIso)}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {entry.source === "student" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-chip px-2.5 py-1 text-xs font-medium text-chip-ink">
            <Icon name="qr-code" size={12} />
            {sourceLabel(entry)}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-blue-bg px-2.5 py-1 text-xs font-medium text-blue">
            {sourceLabel(entry)}
          </span>
        )}
        {entry.lines.map((l) => {
          const m = categoryMeta(l.category);
          return (
            <span key={l.productId} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs" style={{ background: m.bg }}>
              {l.name}
              <b style={{ color: m.fg }}>×{l.qty}</b>
            </span>
          );
        })}
        {reason ? (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
              isWasteReason(entry.reason as ReasonCode) ? "bg-red-bg text-red" : "bg-chip text-chip-ink"
            }`}
          >
            {reason}
          </span>
        ) : null}
        {held ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-bg px-2.5 py-1 text-xs font-medium text-amber">
            <Icon name="hourglass" size={12} />
            Held for review · {total} item{total === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
      {held ? (
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => onHeld(true)} className={`${btn.base} ${btn.dark}`}>
            Accept
          </button>
          <button type="button" disabled={busy} onClick={() => onHeld(false)} className={`${btn.base} ${btn.plain}`}>
            Discard
          </button>
        </div>
      ) : (
        <button type="button" onClick={onFix} className="min-h-11 rounded px-2 text-sm font-semibold text-green hover:bg-green-soft">
          Fix
        </button>
      )}
    </li>
  );
}
