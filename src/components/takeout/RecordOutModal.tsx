"use client";

// "Record items out". No name field (no-names rule). The modal mounts once;
// + / −, the reason chips and "Add an item" only change local state, so nothing
// re-mounts, replays an animation, shifts layout or jumps scroll (PG.2).
import { useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Modal, btn } from "@/components/ui/Modal";
import { Stepper, Thumb } from "@/components/ui/primitives";
import type { InventoryRow } from "@/lib/db/app-types";
import { formatUs } from "@/lib/dates";
import {
  REASONS,
  REASON_NOTE,
  addLine,
  dropLine,
  recordLabel,
  setLineQty,
  sumQty,
  type LineInput,
  type ReasonCode,
} from "@/lib/takeout";
import { newKey } from "@/components/add/api";
import { postTakeout } from "./api";

export interface RecordPreset {
  lines: LineInput[];
  reason: ReasonCode;
}

export interface RecordedInfo {
  reason: ReasonCode;
  groupId: string | null;
  offerIds: string[];
  count: number;
}

const capOf = (r: InventoryRow | undefined) => (r ? Math.max(0, r.onShelf - r.reserved) : 0);

export function RecordOutModal({
  rows,
  preset,
  onClose,
  onRecorded,
}: {
  rows: InventoryRow[];
  preset: RecordPreset;
  onClose: () => void;
  onRecorded: (info: RecordedInfo) => void;
}) {
  const [lines, setLines] = useState<LineInput[]>(preset.lines);
  const [reason, setReason] = useState<ReasonCode>(preset.reason);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attemptKey = useRef(newKey());
  const byId = useMemo(() => new Map(rows.map((r) => [r.productId, r])), [rows]);

  const total = sumQty(lines);
  const addable = rows.filter((r) => capOf(r) > 0 && !lines.some((l) => l.productId === r.productId));

  async function submit() {
    if (busy || total === 0) return;
    setBusy(true);
    setError(null);
    const r = await postTakeout({
      action: "record",
      reason,
      lines: lines.filter((l) => l.qty > 0),
      idempotencyKey: attemptKey.current,
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.message ?? "Nothing was recorded. The amounts may have changed, so check them and try again.");
      return;
    }
    onRecorded({
      reason,
      groupId: r.data.groupId ?? null,
      offerIds: r.data.offerIds ?? [],
      count: sumQty(r.data.lines ?? lines),
    });
  }

  return (
    <Modal
      title="Record items out"
      subtitle="Stock goes down right away. You can undo for 10 seconds."
      onClose={onClose}
      footer={
        <>
          <button type="button" className={`${btn.base} ${btn.plain}`} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={`${btn.base} ${btn.red} min-w-[10.5rem]`}
            disabled={busy || total === 0}
            onClick={submit}
          >
            <Icon name="trash" size={15} />
            {busy ? "Recording…" : recordLabel(total)}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
          {lines.length === 0 ? (
            <li className="px-3 py-4 text-sm text-muted">Add the items that left the shelf.</li>
          ) : null}
          {lines.map((l) => {
            const r = byId.get(l.productId);
            const cap = capOf(r);
            return (
              <li key={l.productId} className="flex items-center gap-2 px-3 py-2">
                <Thumb category={r?.category ?? ""} size="sm" />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm">{r?.name ?? "Item"}</b>
                  <small className="block truncate text-xs text-muted">
                    {r?.brand ? `${r.brand}` : r?.unit}
                    {r?.expiresOn ? ` · ${r.status === "expired" ? "expired" : "best by"} ${formatUs(r.expiresOn)}` : ""}
                  </small>
                </span>
                <Stepper
                  value={l.qty}
                  min={0}
                  max={cap}
                  label={`${r?.name ?? "Item"} quantity`}
                  onChange={(q) => setLines((ls) => setLineQty(ls, l.productId, q, cap))}
                />
                <small className="w-12 flex-none text-xs text-muted">of {cap}</small>
                <button
                  type="button"
                  aria-label={`Remove ${r?.name ?? "item"} from this list`}
                  className="grid h-11 w-11 flex-none place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink"
                  onClick={() => setLines((ls) => dropLine(ls, l.productId))}
                >
                  <Icon name="x" size={16} />
                </button>
              </li>
            );
          })}
          <li className="px-3 py-2">
            <label className="flex min-h-11 items-center gap-2 text-sm text-muted">
              <Icon name="plus" size={16} />
              <span className="sr-only">Add an item</span>
              <select
                value=""
                onChange={(e) => {
                  const id = e.target.value;
                  if (id) setLines((ls) => addLine(ls, id, capOf(byId.get(id))));
                }}
                className="min-h-11 flex-1 bg-transparent outline-none"
              >
                <option value="">Add an item…</option>
                {addable.map((r) => (
                  <option key={r.productId} value={r.productId}>
                    {r.name} ({capOf(r)} on the shelf)
                  </option>
                ))}
              </select>
            </label>
          </li>
        </ul>

        <fieldset>
          <legend className="mb-2 text-[15px] font-semibold">Why are they leaving the shelf?</legend>
          <div className="flex flex-wrap gap-2">
            {REASONS.map((o) => {
              const on = reason === o.code;
              return (
                <label
                  key={o.code}
                  className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-green ${
                    on ? "border-primary bg-primary text-white" : "border-line-2 bg-surface hover:bg-hover"
                  }`}
                >
                  <input type="radio" name="reason" className="sr-only" checked={on} onChange={() => setReason(o.code)} />
                  {on ? <Icon name="check" size={14} /> : null}
                  {o.label}
                </label>
              );
            })}
          </div>
        </fieldset>

        {reason === "moved_to_community" ? (
          <p className="flex items-start gap-2 rounded-xl bg-green-soft px-3 py-2 text-sm text-green">
            <Icon name="info" size={15} className="mt-0.5 flex-none" />
            These stay on your shelf, set aside for an offer. They leave your stock only when the pickup is marked done.
          </p>
        ) : (
          <p className="flex items-start gap-2 rounded-xl bg-chip px-3 py-2 text-sm text-chip-ink">
            <Icon name="info" size={15} className="mt-0.5 flex-none" />
            {REASON_NOTE}
          </p>
        )}

        {error ? (
          <p role="alert" className="rounded-xl bg-red-bg px-3 py-2 text-sm text-red">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
