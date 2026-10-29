"use client";

// Inventory interactive view (PD.1-PD.10). Receives derived rows (and recent
// history) from the server. Tabs, search, Simple / Full sheet, selection, the
// edit drawer and the Remove / Offer modals are all local state: nothing reloads
// the page. After a save the server data refreshes behind the open UI, rows keep
// the order they were first shown in, and nothing re-mounts or jumps (PG.1).
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { InventoryRow } from "@/lib/db/app-types";
import {
  INVENTORY_TABS,
  expiryCell,
  filterRows,
  inventoryCards,
  keepOrder,
  offerTarget,
  removePreset,
  tabCounts,
  toggleAll,
  toggleOne,
  type HistoryEntry,
  type InventoryTabKey,
  type ProductEdit,
} from "@/lib/inventory";
import { COMMUNITY_LABEL } from "@/lib/labels";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { StatusPill, StockBar, Thumb } from "@/components/ui/primitives";
import { RecordOutModal, type RecordPreset } from "@/components/takeout/RecordOutModal";
import { showRecorded } from "@/components/takeout/recorded";
import { OfferModal } from "@/components/community/CommunityModals";
import { formatUs } from "@/lib/dates";
import { SmartCards } from "./SmartCards";
import { EditDrawer } from "./EditDrawer";
import { FullSheet } from "./FullSheet";
import { postEdit } from "./api";

type View = "simple" | "full";

export function InventoryView({
  rows,
  history,
  today,
  nowIso,
  campusName,
}: {
  rows: InventoryRow[];
  history: Record<string, HistoryEntry[]>;
  today: string;
  nowIso: string;
  campusName: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<InventoryTabKey>("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>("simple");
  const [order] = useState(() => rows.map((r) => r.productId));
  const [picked, setPicked] = useState<string[]>([]);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [record, setRecord] = useState<RecordPreset | null>(null);
  const [offerId, setOfferId] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(false);

  const byId = useMemo(() => new Map(rows.map((r) => [r.productId, r])), [rows]);
  const selected = picked.filter((id) => byId.has(id)); // drops rows that left (campus switch)
  const counts = tabCounts(rows);
  const cards = inventoryCards(rows, today);
  const visible = keepOrder(filterRows(rows, tab, search), order);
  const visibleIds = visible.map((r) => r.productId);
  const allOn = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
  const someOn = !allOn && visibleIds.some((id) => selected.includes(id));
  const drawerRow = drawerId ? byId.get(drawerId) : undefined;
  const modalOpen = !!drawerRow || !!record || offerId !== null;

  async function saveCell(productId: string, edit: ProductEdit): Promise<boolean> {
    setPending((n) => n + 1);
    const r = await postEdit(productId, edit);
    setPending((n) => n - 1);
    setFailed(!r.ok);
    if (!r.ok) {
      toast.show(r.message ?? "That didn't save. Try again.");
      return false;
    }
    if (r.data.dateSkipped) toast.show("Nothing is on the shelf, so the date wasn't added.");
    router.refresh();
    return true;
  }

  function openRemove(ids: string[]) {
    setDrawerId(null);
    setRecord(removePreset(rows, ids));
  }

  function openOffer(ids: string[]) {
    const id = offerTarget(rows, ids);
    if (!id) {
      toast.show(`Nothing selected can be offered. Expired or empty items can't go on ${COMMUNITY_LABEL}.`);
      return;
    }
    setOfferId(id);
  }

  const status = pending > 0 ? "saving" : failed ? "failed" : "saved";

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
          <span className="text-[15px] text-muted">{campusName}</span>
        </div>
        <span
          role="status"
          className={`inline-flex items-center gap-1.5 text-sm font-medium ${status === "failed" ? "text-red" : status === "saving" ? "text-muted" : "text-green"}`}
        >
          <Icon name={status === "failed" ? "triangle-alert" : status === "saving" ? "loader" : "check"} size={15} />
          {status === "failed" ? "Last change not saved" : status === "saving" ? "Saving…" : "All changes saved"}
        </span>
      </header>

      <SmartCards cards={cards} onTab={setTab} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Inventory filters">
          {INVENTORY_TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${
                tab === t.key ? "bg-primary text-white" : "bg-chip text-chip-ink hover:bg-line"
              }`}
            >
              {t.label}
              <span className={`text-xs ${tab === t.key ? "text-white/80" : "text-muted"}`}>{counts[t.key]}</span>
            </button>
          ))}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="inline-flex rounded-xl bg-chip p-1" role="group" aria-label="Table view">
            {(
              [
                ["simple", "Simple", "list"],
                ["full", "Full sheet", "sheet"],
              ] as const
            ).map(([key, label, icon]) => (
              <button
                key={key}
                type="button"
                aria-pressed={view === key}
                onClick={() => setView(key)}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium ${
                  view === key ? "bg-surface text-ink shadow-sm" : "text-chip-ink"
                }`}
              >
                <Icon name={icon} size={15} />
                {label}
              </button>
            ))}
          </div>
          <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded border border-line px-3 sm:flex-none">
            <Icon name="search" size={15} className="flex-none text-muted" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items or brands"
              className="w-full min-w-0 bg-transparent py-2 outline-none sm:w-56"
              aria-label="Search items or brands"
            />
          </label>
        </div>
      </div>

      {view === "full" ? (
        <FullSheet rows={visible} onCommit={saveCell} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">Inventory. Open an item to edit it, or tick items to remove or offer them.</caption>
            <thead className="text-xs text-muted">
              <tr className="border-b border-line">
                <th scope="col" className="w-12 px-1">
                  <label className="grid h-11 w-11 cursor-pointer place-items-center">
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-green"
                      checked={allOn}
                      ref={(el) => {
                        if (el) el.indeterminate = someOn;
                      }}
                      onChange={() => setPicked(toggleAll(selected, visibleIds))}
                      aria-label="Select all shown items"
                    />
                  </label>
                </th>
                <th scope="col" className="px-3 py-3 font-medium">Product</th>
                <th scope="col" className="hidden px-3 py-3 font-medium md:table-cell">Category</th>
                <th scope="col" className="px-3 py-3 font-medium">In stock</th>
                <th scope="col" className="px-3 py-3 font-medium">Expires</th>
                <th scope="col" className="px-3 py-3 font-medium">Status</th>
                <th scope="col" className="hidden px-3 py-3 font-medium lg:table-cell">Last restock</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted">
                    No items match. Try another tab or search.
                  </td>
                </tr>
              ) : (
                visible.map((r) => {
                  const exp = expiryCell(r, today);
                  const on = selected.includes(r.productId);
                  return (
                    <tr
                      key={r.productId}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("input, button, label, a")) return;
                        setDrawerId(r.productId);
                      }}
                      className={`cursor-pointer border-b border-line last:border-0 hover:bg-hover ${on ? "bg-green-soft" : ""}`}
                    >
                      <td className="px-1">
                        <label className="grid h-11 w-11 cursor-pointer place-items-center">
                          <input
                            type="checkbox"
                            className="h-5 w-5 accent-green"
                            checked={on}
                            onChange={() => setPicked(toggleOne(selected, r.productId))}
                            aria-label={`Select ${r.name}`}
                          />
                        </label>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setDrawerId(r.productId)}
                          className="flex min-h-11 items-center gap-2.5 rounded text-left"
                          aria-label={`Edit ${r.name}`}
                        >
                          <Thumb category={r.category} size="sm" />
                          <span className="min-w-0">
                            <span className="block font-semibold">{r.name}</span>
                            <span className="block text-xs text-muted">
                              {r.brand ? `${r.brand} · ` : ""}
                              {r.unit}
                            </span>
                          </span>
                        </button>
                      </td>
                      <td className="hidden px-3 py-2 text-muted md:table-cell">{r.category}</td>
                      <td className="px-3 py-2">
                        <StockBar onShelf={r.onShelf} lastRestock={r.lastRestock} />
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={
                            exp.tone === "red" ? "text-red" : exp.tone === "blue" ? "font-semibold text-blue" : "text-muted"
                          }
                        >
                          {r.expiresOn ? formatUs(r.expiresOn) : exp.text}
                        </span>
                        {exp.note ? <small className="block text-muted">{exp.note}</small> : null}
                      </td>
                      <td className="px-3 py-2">
                        <StatusPill status={r.status} />
                      </td>
                      <td className="hidden px-3 py-2 text-muted lg:table-cell">
                        {r.lastRestockOn ? formatUs(r.lastRestockOn) : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-sm text-muted">
        {view === "simple"
          ? "Open an item to edit it. Switch to Full sheet to see and edit every column from your spreadsheet."
          : "Click any cell to edit it. Changes save on their own."}
      </p>
      <p className="text-sm text-muted">
        Showing {visible.length} of {rows.length} items · sample data
      </p>

      {selected.length > 0 && !modalOpen ? (
        <div
          role="region"
          aria-label="Selected items"
          className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-xl flex-wrap items-center gap-2 rounded-2xl bg-primary px-4 py-2 text-white shadow-lg"
        >
          <b className="mr-auto text-sm">{selected.length} selected</b>
          <button
            type="button"
            onClick={() => openRemove(selected)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold hover:bg-white/10"
          >
            <Icon name="trash" size={15} />
            Remove
          </button>
          <button
            type="button"
            onClick={() => openOffer(selected)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold hover:bg-white/10"
          >
            <Icon name="share-2" size={15} />
            <span className="sm:hidden">Offer</span>
            <span className="hidden sm:inline">Offer on {COMMUNITY_LABEL}</span>
          </button>
          <button
            type="button"
            onClick={() => setPicked([])}
            aria-label="Clear selection"
            className="grid h-11 w-11 place-items-center rounded-lg hover:bg-white/10"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      ) : null}

      {drawerRow ? (
        <EditDrawer
          row={drawerRow}
          history={history[drawerRow.productId] ?? []}
          nowIso={nowIso}
          onClose={() => setDrawerId(null)}
          onRemove={() => openRemove([drawerRow.productId])}
          onSaved={(message) => {
            setDrawerId(null);
            router.refresh();
            toast.show(message);
          }}
        />
      ) : null}
      {record ? (
        <RecordOutModal
          rows={rows}
          preset={record}
          onClose={() => setRecord(null)}
          onRecorded={(info) => {
            setRecord(null);
            setPicked([]);
            router.refresh();
            showRecorded(info, toast, router.refresh);
          }}
        />
      ) : null}
      {offerId !== null ? (
        <OfferModal
          rows={rows}
          preset={{ productId: offerId }}
          requestCampusId={null}
          onClose={() => setOfferId(null)}
          onDone={(message) => {
            setOfferId(null);
            setPicked([]);
            router.refresh();
            toast.show(message);
          }}
        />
      ) : null}
      {toast.node}
    </>
  );
}
