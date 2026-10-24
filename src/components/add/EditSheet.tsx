"use client";

// "Edit all details" bottom sheet. Mounts once when opened (the open animation
// plays once); every edit inside updates the draft in place with no re-mount
// or scroll jump (PG.1). Escape or the backdrop closes it.
import { Icon } from "@/components/ui/Icon";
import type { ReviewDraft } from "@/lib/intake";
import { CategorySelect, Field, SourceField, UnitSelect, inputCls } from "./fields";

export function EditSheet({
  draft,
  focus,
  onChange,
  onClose,
}: {
  draft: ReviewDraft;
  focus: "name" | "date";
  onChange: (patch: Partial<ReviewDraft>) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div aria-hidden className="fixed inset-0 z-50 bg-ink/30 motion-safe:animate-fade-in" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-sheet-title"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[90dvh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-3xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] motion-safe:animate-sheet-in"
      >
        <span aria-hidden className="mx-auto h-1.5 w-10 rounded-full bg-line-2" />
        <h2 id="edit-sheet-title" className="text-lg font-semibold">
          Edit details
        </h2>
        <Field label="Name">
          <input
            autoFocus={focus === "name"}
            value={draft.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Like black beans"
            className={inputCls}
          />
        </Field>
        <Field label="Brand">
          <input value={draft.brand} onChange={(e) => onChange({ brand: e.target.value })} placeholder="Optional" className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Best by">
            <input
              type="date"
              autoFocus={focus === "date"}
              value={draft.expiresOn ?? ""}
              disabled={draft.noExpire}
              onChange={(e) => onChange({ expiresOn: e.target.value || null })}
              className={inputCls}
            />
          </Field>
          <Field label="Unit">
            <UnitSelect value={draft.unit} onChange={(unit) => onChange({ unit })} />
          </Field>
        </div>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            className="h-5 w-5 accent-[#1e7a46]"
            checked={draft.noExpire}
            onChange={(e) => onChange({ noExpire: e.target.checked })}
          />
          Doesn&apos;t expire (hygiene, foil, etc.)
        </label>
        <Field label="Category">
          <CategorySelect value={draft.category} onChange={(category) => onChange({ category })} />
        </Field>
        <SourceField value={draft.source} onChange={(source) => onChange({ source })} />
        <p className="flex items-start gap-2 text-sm text-muted">
          <Icon name="sparkles" size={15} className="mt-0.5 flex-none" />
          Fixes are remembered for the next time this label is read.
        </p>
        <button type="button" onClick={onClose} className="min-h-12 w-full rounded-2xl bg-primary font-semibold text-white">
          Done
        </button>
      </div>
    </>
  );
}
