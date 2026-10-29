"use client";

// Full sheet (PD.10): every spreadsheet column, editable in place. Text, number
// and date cells save when you leave them (or press Enter); selects save on
// change. Each cell keeps its own value while the page refreshes behind it, so
// nothing re-mounts and focus stays where it is (PG.1). "Composition" and the
// last restock date are read-only. Quantity goes through the same adjustment
// path as the drawer: an "Edited by staff" entry, never an overwrite (PD.7a).
import { useState } from "react";
import type { InventoryRow } from "@/lib/db/app-types";
import type { ProductEdit } from "@/lib/inventory";
import { CATEGORY_VALUES, UNCATEGORIZED } from "@/lib/items/taxonomy";
import { formatUs } from "@/lib/dates";

type Commit = (productId: string, edit: ProductEdit) => Promise<boolean>;

const cellCls =
  "min-h-11 w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 text-sm outline-none hover:border-line-2 focus:border-green focus:bg-surface";

/** A cell's own value, reset whenever the saved value changes (no re-mount). */
function useCellValue(saved: string) {
  const [value, setValue] = useState(saved);
  const [seen, setSeen] = useState(saved);
  if (saved !== seen) {
    setSeen(saved);
    setValue(saved);
  }
  return [value, setValue] as const;
}

function InputCell({
  saved,
  label,
  type = "text",
  toEdit,
  commit,
  className = "",
}: {
  saved: string;
  label: string;
  type?: "text" | "number" | "date";
  /** null = invalid; the cell goes back to the saved value. */
  toEdit: (value: string) => ProductEdit | null;
  commit: (edit: ProductEdit) => Promise<boolean>;
  className?: string;
}) {
  const [value, setValue] = useCellValue(saved);
  async function save() {
    if (value === saved) return;
    const edit = toEdit(value);
    if (!edit || !(await commit(edit))) setValue(saved);
  }
  return (
    <input
      type={type}
      inputMode={type === "number" ? "numeric" : undefined}
      min={type === "number" ? 0 : undefined}
      value={value}
      aria-label={label}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setValue(saved);
      }}
      className={`${cellCls} ${className}`}
    />
  );
}

function SelectCell({
  saved,
  label,
  options,
  toEdit,
  commit,
}: {
  saved: string;
  label: string;
  options: { value: string; label: string }[];
  toEdit: (value: string) => ProductEdit;
  commit: (edit: ProductEdit) => Promise<boolean>;
}) {
  const [value, setValue] = useCellValue(saved);
  return (
    <select
      value={value}
      aria-label={label}
      onChange={async (e) => {
        const next = e.target.value;
        setValue(next);
        if (!(await commit(toEdit(next)))) setValue(saved);
      }}
      className={cellCls}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const CATEGORY_OPTIONS = [...CATEGORY_VALUES, UNCATEGORIZED].map((c) => ({ value: c, label: c }));
const SOURCE_OPTIONS = [
  { value: "donated", label: "Donated" },
  { value: "purchased", label: "Purchased" },
  { value: "", label: "Not set" },
];

const COLUMNS = [
  "Item Name",
  "Category",
  "Composition",
  "Brand",
  "Expiration Date",
  "Date of Last Restock",
  "Quantity",
  "Unit of Measure",
  "Purchased/Donated",
];

export function FullSheet({ rows, onCommit }: { rows: InventoryRow[]; onCommit: Commit }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
        <caption className="sr-only">Full inventory sheet. Each cell can be edited and saves on its own.</caption>
        <thead className="text-xs text-muted">
          <tr className="border-b border-line bg-[#fafbf9]">
            <th scope="col" className="w-10 px-2 py-2 text-center font-medium">
              #
            </th>
            {COLUMNS.map((c) => (
              <th key={c} scope="col" className="px-2 py-2 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={COLUMNS.length + 1} className="px-4 py-10 text-center text-muted">
                No items match. Try another tab or search.
              </td>
            </tr>
          ) : (
            rows.map((r, i) => {
              const commit = (edit: ProductEdit) => onCommit(r.productId, edit);
              const label = (col: string) => `${col}, ${r.name}`;
              return (
                <tr key={r.productId} className="border-b border-line last:border-0">
                  <td className="px-2 text-center text-xs text-muted">{i + 2}</td>
                  <td className="min-w-48 px-1">
                    <InputCell
                      saved={r.name}
                      label={label("Item name")}
                      toEdit={(v) => (v.trim() ? { name: v.trim() } : null)}
                      commit={commit}
                      className="font-semibold"
                    />
                  </td>
                  <td className="min-w-44 px-1">
                    <SelectCell
                      saved={r.category}
                      label={label("Category")}
                      options={CATEGORY_OPTIONS}
                      toEdit={(v) => ({ category: v })}
                      commit={commit}
                    />
                  </td>
                  <td className="px-2 text-muted">{r.categoryGroup ?? "—"}</td>
                  <td className="min-w-32 px-1">
                    <InputCell saved={r.brand ?? ""} label={label("Brand")} toEdit={(v) => ({ brand: v.trim() || null })} commit={commit} />
                  </td>
                  <td className="min-w-40 px-1">
                    {r.noExpire ? (
                      <span className="px-2 text-muted">Doesn&apos;t expire</span>
                    ) : (
                      <InputCell
                        saved={r.expiresOn ?? ""}
                        label={label("Expiration date")}
                        type="date"
                        toEdit={(v) => ({ expiresOn: v || null })}
                        commit={commit}
                      />
                    )}
                  </td>
                  <td className="px-2 text-muted">{r.lastRestockOn ? formatUs(r.lastRestockOn) : "—"}</td>
                  <td className="w-24 px-1">
                    <InputCell
                      saved={String(r.onShelf)}
                      label={label("Quantity on the shelf")}
                      type="number"
                      toEdit={(v) => {
                        const n = Number(v);
                        return v.trim() !== "" && Number.isInteger(n) && n >= 0 ? { onShelf: n } : null;
                      }}
                      commit={commit}
                    />
                  </td>
                  <td className="min-w-28 px-1">
                    <InputCell saved={r.unit} label={label("Unit")} toEdit={(v) => (v.trim() ? { unit: v.trim() } : null)} commit={commit} />
                  </td>
                  <td className="min-w-36 px-1">
                    <SelectCell
                      saved={r.source ?? ""}
                      label={label("Purchased or donated")}
                      options={SOURCE_OPTIONS}
                      toEdit={(v) => ({ source: v === "donated" || v === "purchased" ? v : null })}
                      commit={commit}
                    />
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
