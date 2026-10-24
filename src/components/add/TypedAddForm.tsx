"use client";

// Typed Add stock form: the whole of Add stock on desktop (no camera, no upload,
// no picture anywhere) and "Type it instead" on a phone. Saves through the same
// API and rules as the camera flow.
import { useState } from "react";
import { Stepper } from "@/components/ui/primitives";
import {
  applyEdit,
  emptyDraft,
  isSavable,
  saveButtonLabel,
  toSaveBody,
  type ReviewDraft,
  type SavedSummary,
} from "@/lib/intake";
import { CategorySelect, Field, Segmented, SourceField, UnitSelect, inputCls } from "./fields";
import { saveStock } from "./api";

type DateMode = "date" | "none" | "noexpire";

const DATE_MODES: { value: DateMode; label: string }[] = [
  { value: "date", label: "Has a date" },
  { value: "none", label: "No date" },
  { value: "noexpire", label: "Doesn't expire" },
];

export function TypedAddForm({
  variant,
  prefill,
  idempotencyKey,
  onSaved,
  header,
}: {
  variant: "desktop" | "phone";
  prefill: Partial<ReviewDraft> | null;
  idempotencyKey: string;
  onSaved: (summary: SavedSummary) => void;
  header?: React.ReactNode;
}) {
  const [draft, setDraft] = useState<ReviewDraft>(() => emptyDraft(prefill ?? {}));
  const [dateMode, setDateMode] = useState<DateMode>(prefill?.noExpire ? "noexpire" : "date");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const edit = (patch: Partial<ReviewDraft>) => setDraft((d) => applyEdit(d, patch));
  const effective: ReviewDraft =
    dateMode === "noexpire"
      ? applyEdit(draft, { noExpire: true })
      : dateMode === "none"
        ? { ...draft, expiresOn: null, noExpire: false }
        : { ...draft, noExpire: false };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!effective.name.trim()) {
      setError("Give the item a name.");
      return;
    }
    if (!isSavable(effective)) return;
    setSaving(true);
    setError(null);
    const result = await saveStock(toSaveBody({ draft: effective, read: null, baseline: null, photoDates: [], idempotencyKey }));
    setSaving(false);
    if (result.ok) onSaved(result.summary);
    else setError(result.message);
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className={variant === "desktop" ? "flex flex-col gap-4 rounded-lg border border-line bg-surface p-5" : "flex flex-1 flex-col gap-4"}
    >
      {header}
      <Field label="Item name">
        <input
          autoFocus={!prefill?.name}
          value={draft.name}
          onChange={(e) => edit({ name: e.target.value })}
          placeholder="Like black beans"
          aria-required="true"
          className={inputCls}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Brand">
          <input value={draft.brand} onChange={(e) => edit({ brand: e.target.value })} placeholder="Optional" className={inputCls} />
        </Field>
        <Field label="Unit">
          <UnitSelect value={draft.unit} onChange={(unit) => edit({ unit })} />
        </Field>
      </div>
      <Field label="Category">
        <CategorySelect value={draft.category} onChange={(category) => edit({ category })} />
      </Field>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-muted">How many?</span>
        <Stepper value={draft.quantity} onChange={(quantity) => edit({ quantity })} label="How many" />
      </div>
      <Segmented legend="Best by" options={DATE_MODES} value={dateMode} onChange={setDateMode} />
      {dateMode === "date" ? (
        <Field label="Best by date (optional)">
          <input
            type="date"
            value={draft.expiresOn ?? ""}
            onChange={(e) => edit({ expiresOn: e.target.value || null })}
            className={inputCls}
          />
        </Field>
      ) : null}
      <SourceField value={draft.source} onChange={(source) => edit({ source })} />
      {error ? (
        <p role="alert" className="rounded-xl bg-red-bg px-3 py-2 text-sm text-red">
          {error}
        </p>
      ) : null}
      {variant === "phone" ? <div className="flex-1" /> : null}
      <button
        type="submit"
        disabled={saving}
        className="min-h-14 w-full rounded-2xl bg-primary text-[17px] font-semibold text-white disabled:opacity-45"
      >
        {saving ? "Saving…" : saveButtonLabel(effective)}
      </button>
    </form>
  );
}
