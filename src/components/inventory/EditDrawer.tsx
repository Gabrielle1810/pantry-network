"use client";

// Inventory edit drawer (PD.7). Mounts once when a row is opened; every field
// is local draft state, so typing never re-mounts it, replays the animation or
// moves the scroll (PG.1). Save sends the draft; the server works out what
// changed. A new "On the shelf" number is written as an "Edited by staff"
// adjustment for the difference, shown in History (PD.7a).
import { useId, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Modal, btn } from "@/components/ui/Modal";
import { StatusPill, StockBar, Thumb } from "@/components/ui/primitives";
import { CategorySelect, Field, SourceField, UnitSelect, inputCls } from "@/components/add/fields";
import type { InventoryRow } from "@/lib/db/app-types";
import type { HistoryEntry, ProductEdit } from "@/lib/inventory";
import type { DeliverySource } from "@/lib/intake";
import { formatUs } from "@/lib/dates";
import { agoLabel } from "@/lib/takeout";
import { postEdit } from "./api";

interface Draft {
  name: string;
  brand: string;
  unit: string;
  category: string;
  onShelf: string;
  expiresOn: string;
  noExpire: boolean;
  source: DeliverySource;
}

const draftOf = (r: InventoryRow): Draft => ({
  name: r.name,
  brand: r.brand ?? "",
  unit: r.unit,
  category: r.category,
  onShelf: String(r.onShelf),
  expiresOn: r.expiresOn ?? "",
  noExpire: r.noExpire,
  source: r.source,
});

export function EditDrawer({
  row,
  history,
  nowIso,
  onClose,
  onSaved,
  onRemove,
}: {
  row: InventoryRow;
  history: HistoryEntry[];
  nowIso: string;
  onClose: () => void;
  onSaved: (message: string) => void;
  onRemove: () => void;
}) {
  const formId = useId();
  const [draft, setDraft] = useState<Draft>(() => draftOf(row));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const onShelf = Number(draft.onShelf);
    if (!draft.name.trim()) return setError("Give the item a name.");
    if (draft.onShelf.trim() === "" || !Number.isInteger(onShelf) || onShelf < 0) {
      return setError("Enter how many are on the shelf (0 or more).");
    }
    const edit: ProductEdit = {
      name: draft.name.trim(),
      brand: draft.brand.trim() || null,
      unit: draft.unit,
      category: draft.category,
      source: draft.source,
      noExpire: draft.noExpire,
      onShelf,
      expiresOn: draft.noExpire ? null : draft.expiresOn || null,
    };
    setSaving(true);
    setError(null);
    const r = await postEdit(row.productId, edit);
    setSaving(false);
    if (!r.ok) return setError(r.message ?? "That didn't save. Try again.");
    if (r.data.status === "unchanged") return onClose();
    onSaved(r.data.dateSkipped ? "Saved. Nothing is on the shelf, so the date wasn't added." : `Saved ${edit.name}`);
  }

  return (
    <Modal
      variant="drawer"
      title={row.name}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          {row.brand ? <span>{row.brand}</span> : null}
          <StatusPill status={row.status} />
        </span>
      }
      leading={<Thumb category={draft.category} />}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={`${btn.base} ${btn.ghostRed} mr-auto`} onClick={onRemove}>
            <Icon name="trash" size={15} />
            Remove…
          </button>
          <button type="button" className={`${btn.base} ${btn.plain}`} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className={`${btn.base} ${btn.dark} min-w-[6rem]`} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={save} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 rounded-xl border border-line p-3">
          <StockBar onShelf={row.onShelf} lastRestock={row.lastRestock} />
          <small className="text-xs text-muted">
            In stock = what is left of the last restock
            {row.reserved ? ` · ${row.reserved} set aside for an offer` : ""}
          </small>
        </div>

        <Field label="Item name">
          <input value={draft.name} onChange={(e) => set({ name: e.target.value })} aria-required="true" className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Brand">
            <input value={draft.brand} onChange={(e) => set({ brand: e.target.value })} placeholder="Optional" className={inputCls} />
          </Field>
          <Field label="Unit">
            <UnitSelect value={draft.unit} onChange={(unit) => set({ unit })} />
          </Field>
        </div>
        <Field label="Category">
          <CategorySelect value={draft.category} onChange={(category) => set({ category })} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="On the shelf">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={draft.onShelf}
              onChange={(e) => set({ onShelf: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Last restock amount">
            <input value={row.lastRestock} readOnly aria-readonly="true" className={`${inputCls} bg-chip text-muted`} />
          </Field>
        </div>
        <p className="-mt-2 text-xs text-muted">A new number is saved as an adjustment in History. Nothing is overwritten.</p>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Best by">
            <input
              type="date"
              value={draft.noExpire ? "" : draft.expiresOn}
              disabled={draft.noExpire}
              onChange={(e) => set({ expiresOn: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Last restock">
            <input
              value={row.lastRestockOn ? formatUs(row.lastRestockOn) : "—"}
              readOnly
              aria-readonly="true"
              className={`${inputCls} bg-chip text-muted`}
            />
          </Field>
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px]">
          <input
            type="checkbox"
            checked={draft.noExpire}
            onChange={(e) => set({ noExpire: e.target.checked })}
            className="h-5 w-5 flex-none accent-green"
          />
          Doesn&apos;t expire (hygiene, foil, etc.)
        </label>
        <SourceField value={draft.source} onChange={(source) => set({ source })} />

        {error ? (
          <p role="alert" className="rounded-xl bg-red-bg px-3 py-2 text-sm text-red">
            {error}
          </p>
        ) : null}

        {history.length ? (
          <section aria-labelledby={`${formId}-h`} className="flex flex-col gap-2 border-t border-line pt-4">
            <h3 id={`${formId}-h`} className="font-semibold">
              History
            </h3>
            <ul className="flex flex-col gap-2 text-sm">
              {history.map((h, i) => (
                <li key={`${h.at}-${i}`} className="flex items-start gap-2">
                  <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-line-2" aria-hidden />
                  <span className="flex-1">{h.text}</span>
                  <small className="flex-none text-xs text-muted">{agoLabel(h.at, nowIso)}</small>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </form>
    </Modal>
  );
}
