"use client";

// Inventory interactive view (PD.5/PD.6). Receives derived rows from the server
// and handles tabs + search + the Simple table entirely in local state — no page
// reload, no re-fetch on tab/search (PA.2/PG.1). The edit drawer, Full sheet, and
// remove flow are later Step-2 tasks; this delivers the smart cards + list.
import { useState } from "react";
import type { InventoryRow } from "@/lib/db/app-types";
import {
  INVENTORY_TABS,
  tabCounts,
  filterRows,
  inventoryCards,
  expiryCell,
  type InventoryTabKey,
} from "@/lib/inventory";
import { Icon } from "@/components/ui/Icon";
import { SmartCards } from "./SmartCards";
import { StatusPill, StockBar, Thumb } from "@/components/ui/primitives";

export function InventoryView({
  rows,
  today,
  campusName,
}: {
  rows: InventoryRow[];
  today: string;
  campusName: string;
}) {
  const [tab, setTab] = useState<InventoryTabKey>("all");
  const [search, setSearch] = useState("");

  const counts = tabCounts(rows);
  const cards = inventoryCards(rows, today);
  const visible = filterRows(rows, tab, search);

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
          <span className="text-[15px] text-muted">{campusName}</span>
        </div>
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green">
          <Icon name="check" size={15} />
          All changes saved
        </span>
      </header>

      <SmartCards cards={cards} />

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
        <label className="flex min-h-11 items-center gap-2 rounded border border-line px-3">
          <Icon name="search" size={15} className="text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items or brands"
            className="w-56 max-w-full bg-transparent py-2 outline-none"
            aria-label="Search items or brands"
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">In stock</th>
              <th className="px-4 py-3 font-medium">Expires</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Last restock</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  No items match. Try another tab or search.
                </td>
              </tr>
            ) : (
              visible.map((r) => {
                const exp = expiryCell(r, today);
                return (
                  <tr key={r.productId} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Thumb category={r.category} size="sm" />
                        <span className="min-w-0">
                          <span className="block font-semibold">{r.name}</span>
                          <span className="block text-xs text-muted">
                            {r.brand ? `${r.brand} · ` : ""}
                            {r.unit}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted">{r.category}</td>
                    <td className="px-4 py-3">
                      <StockBar onShelf={r.onShelf} lastRestock={r.lastRestock} />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={exp.tone === "red" ? "text-red" : exp.tone === "blue" ? "font-semibold text-blue" : "text-muted"}
                      >
                        {exp.text}
                      </span>
                      {exp.note ? <small className="block text-muted">{exp.note}</small> : null}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-muted">{r.lastRestockOn ?? "—"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-muted">
        Showing {visible.length} of {rows.length} items · sample data
      </p>
    </>
  );
}
