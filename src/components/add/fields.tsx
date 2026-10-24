"use client";

// Small labelled form controls shared by the edit sheet and the typed form.
// 44 px targets, visible focus, real radio inputs behind segmented buttons.
import { useId } from "react";
import { CATEGORY_VALUES, UNCATEGORIZED } from "@/lib/items/taxonomy";
import { UNIT_OPTIONS } from "@/lib/items/units";
import type { DeliverySource } from "@/lib/intake";

export const inputCls =
  "min-h-11 w-full rounded-[10px] border border-line-2 bg-surface px-3 text-base font-normal text-ink outline-none focus:border-green disabled:bg-chip disabled:text-muted";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-muted">
      {label}
      {children}
    </label>
  );
}

export function Segmented<T extends string | null>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-sm font-medium text-muted">{legend}</legend>
      <div className="grid gap-1 rounded-xl bg-chip p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <label
            key={o.label}
            className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-2 text-center text-sm font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-green ${
              value === o.value ? "bg-surface text-ink shadow-sm" : "text-chip-ink"
            }`}
          >
            <input type="radio" name={name} className="sr-only" checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const SOURCE_OPTIONS: { value: DeliverySource; label: string }[] = [
  { value: "donated", label: "Donated" },
  { value: "purchased", label: "Purchased" },
  { value: null, label: "Not set" },
];

export function SourceField({ value, onChange }: { value: DeliverySource; onChange: (v: DeliverySource) => void }) {
  return <Segmented legend="Source" options={SOURCE_OPTIONS} value={value} onChange={onChange} />;
}

export function UnitSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const units: string[] = (UNIT_OPTIONS as readonly string[]).includes(value) ? [...UNIT_OPTIONS] : [value, ...UNIT_OPTIONS];
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      {units.map((u) => (
        <option key={u}>{u}</option>
      ))}
    </select>
  );
}

export function CategorySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      {[...CATEGORY_VALUES, UNCATEGORIZED].map((c) => (
        <option key={c}>{c}</option>
      ))}
    </select>
  );
}
