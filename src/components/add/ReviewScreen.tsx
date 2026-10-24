"use client";

// Review after a read (screenshots 2 and 3), plus the states without a
// screenshot: ambiguous date, doesn't expire, unreadable. Renders the draft and
// dispatches events; every rule lives in src/lib/intake.
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Chip, Stepper } from "@/components/ui/primitives";
import { expiryChip, expiryStatus } from "@/lib/expiry";
import { formatUs } from "@/lib/dates";
import {
  ambiguousChoices,
  dateRowLabel,
  isSavable,
  saveButtonLabel,
  type AddFlowEvent,
  type AddFlowState,
  type ReviewDraft,
} from "@/lib/intake";
import { Badge, Corners, PhoneHeader } from "./PhoneFrame";
import { EditSheet } from "./EditSheet";
import { inputCls } from "./fields";

export function ReviewScreen({
  state,
  dispatch,
  today,
  onSave,
}: {
  state: AddFlowState;
  dispatch: (e: AddFlowEvent) => void;
  today: string;
  onSave: () => void;
}) {
  const d = state.draft;
  // Unreadable reads open straight into the name editor.
  const [editingTitle, setEditingTitle] = useState(() => d.name.trim() === "");
  const [sheet, setSheet] = useState<null | "name" | "date">(null);

  const edit = (patch: Partial<ReviewDraft>) => dispatch({ type: "EDIT", patch });
  const saving = state.step === "saving";
  const dated = !!d.expiresOn;
  const settled = dated || d.noExpire;
  const chip = expiryChip(expiryStatus(d.expiresOn, today));
  const canPhotographDate = !!state.read && !settled && !d.dateAmbiguous;

  const subtitle = state.unreadable
    ? "We couldn't read this label. Type the name below."
    : d.dateAmbiguous
      ? "The date can be read two ways. Pick the right one."
      : !settled
        ? "We couldn't find a date on the label"
        : null;

  return (
    <>
      <PhoneHeader action={{ label: "Retake", onClick: () => dispatch({ type: "RETAKE" }) }} />

      <div className="relative aspect-[6/5] w-full overflow-hidden rounded-[28px] bg-[#e7e2d7]">
        {state.photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- in-memory data URL, never stored
          <img src={state.photo} alt="The label you photographed" className="h-full w-full object-cover" />
        ) : null}
        <Corners />
      </div>
      <Badge tone={settled ? "green" : "amber"} label={settled ? "Label read" : "No date found yet"} />

      <div className="flex flex-col items-center gap-1 text-center">
        {editingTitle ? (
          <div className="flex w-full flex-col gap-2 text-left">
            <label className="flex flex-col gap-1 text-sm font-medium text-muted">
              Name
              <input autoFocus value={d.name} onChange={(e) => edit({ name: e.target.value })} placeholder="Like black beans" className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-muted">
              Brand
              <input value={d.brand} onChange={(e) => edit({ brand: e.target.value })} placeholder="Optional" className={inputCls} />
            </label>
            {d.name.trim() ? (
              <button type="button" onClick={() => setEditingTitle(false)} className="min-h-11 self-end rounded px-3 font-semibold text-green">
                Done
              </button>
            ) : null}
          </div>
        ) : (
          <button type="button" onClick={() => setEditingTitle(true)} className="inline-flex min-h-11 items-center gap-2 text-2xl font-bold">
            <span>
              {d.name || "Name the item"}
              {d.brand ? ` · ${d.brand}` : ""}
            </span>
            <Icon name="pencil" size={18} className="text-muted" />
            <span className="sr-only">Edit name and brand</span>
          </button>
        )}
        {subtitle ? <p className="text-muted">{subtitle}</p> : null}
        {state.rememberedFields.length > 0 ? (
          <Chip tone="green">
            <Icon name="sparkles" size={13} />
            Remembered fix
          </Chip>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap gap-2">
          {d.noExpire ? (
            <Chip>
              <Icon name="infinity" size={13} />
              Doesn&apos;t expire
            </Chip>
          ) : d.dateAmbiguous ? (
            <Chip tone="amber">
              <Icon name="calendar" size={13} />
              Check the date
            </Chip>
          ) : !dated ? (
            <Chip tone="amber">
              <Icon name="calendar" size={13} />
              No date found
            </Chip>
          ) : (
            <Chip tone={chip.tone}>
              <Icon name="clock" size={13} />
              {chip.text}
            </Chip>
          )}
          <Chip>
            <Icon name="tag" size={13} />
            {d.category}
          </Chip>
        </div>

        {d.noExpire ? null : d.dateAmbiguous ? (
          <div className="flex flex-col gap-2">
            <span className="text-muted">Which date is printed?</span>
            {ambiguousChoices(d).map((c) => (
              <button
                key={c.iso}
                type="button"
                onClick={() => dispatch({ type: "CHOOSE_DATE", iso: c.iso })}
                className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-line-2 px-3 text-left hover:bg-hover"
              >
                <b>{c.label}</b>
                <small className="text-muted">{c.reading}</small>
              </button>
            ))}
            <button type="button" onClick={() => dispatch({ type: "KEEP_UNKNOWN" })} className="min-h-11 self-start font-semibold text-green">
              Keep Unknown
            </button>
          </div>
        ) : (
          <div className="flex min-h-11 items-center justify-between gap-3">
            <span className="text-muted">{dateRowLabel(d.dateType)}</span>
            {dated ? (
              <span className="flex items-center gap-2">
                <b className="text-[17px]">{formatUs(d.expiresOn)}</b>
                <button type="button" onClick={() => setSheet("date")} className="min-h-11 px-1 font-semibold text-green">
                  Edit
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setSheet("date")} className="min-h-11 font-semibold text-amber">
                Unknown · add it
              </button>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <span className="text-muted">How many?</span>
          <Stepper value={d.quantity} onChange={(quantity) => edit({ quantity })} label="How many" />
        </div>

        {!settled && !d.dateAmbiguous ? (
          <p className="flex items-start gap-2 text-sm text-muted">
            <Icon name="info" size={15} className="mt-0.5 flex-none" />
            Dates are optional. Add one later from Inventory if you find it.
          </p>
        ) : null}
      </div>

      {state.note ? (
        <p role="status" className="rounded-xl bg-amber-bg px-3 py-2 text-sm text-amber">
          {state.note}
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="rounded-xl bg-red-bg px-3 py-2 text-sm text-red">
          {state.error}
        </p>
      ) : null}
      {state.provider === "mock" ? <p className="text-center text-xs text-muted">Demo mode: sample reads</p> : null}

      <div className="flex-1" />
      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={onSave}
          disabled={!isSavable(d) || saving}
          className="min-h-14 w-full rounded-2xl bg-primary text-[17px] font-semibold text-white disabled:opacity-45"
        >
          {saving ? "Saving…" : saveButtonLabel(d)}
        </button>
        {canPhotographDate ? (
          <button type="button" onClick={() => dispatch({ type: "PHOTOGRAPH_DATE" })} className="min-h-11 px-2 text-muted underline">
            Photograph the date instead
          </button>
        ) : (
          <button type="button" onClick={() => setSheet("name")} className="min-h-11 px-2 text-muted underline">
            Edit all details
          </button>
        )}
      </div>

      {sheet ? <EditSheet draft={d} focus={sheet} onChange={edit} onClose={() => setSheet(null)} /> : null}
    </>
  );
}
