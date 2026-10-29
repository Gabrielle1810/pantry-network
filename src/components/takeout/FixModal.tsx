"use client";

// "Fix this entry": change quantities or delete. Stock moves by the difference
// through ledger rows. Shows only "Student scan" / "Staff", never a person.
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Modal, btn } from "@/components/ui/Modal";
import { Stepper, Thumb } from "@/components/ui/primitives";
import type { InventoryRow } from "@/lib/db/app-types";
import { agoLabel, reasonLabel, sourceLabel, type FeedEntry, type LineInput } from "@/lib/takeout";
import { postTakeout } from "./api";

export function FixModal({
  entry,
  rows,
  nowIso,
  onClose,
  onDone,
}: {
  entry: FeedEntry;
  rows: InventoryRow[];
  nowIso: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [lines, setLines] = useState<LineInput[]>(entry.lines.map((l) => ({ productId: l.productId, qty: l.qty })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byId = new Map(rows.map((r) => [r.productId, r]));
  const maxFor = (id: string, current: number) => {
    const r = byId.get(id);
    return current + (r ? Math.max(0, r.onShelf - r.reserved) : 0);
  };

  async function run(body: Parameters<typeof postTakeout>[0], done: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await postTakeout(body);
    setBusy(false);
    if (!r.ok) setError(r.message ?? "That didn't go through. Try again.");
    else onDone(done);
  }

  const reason = reasonLabel(entry.reason);

  return (
    <Modal
      title="Fix this entry"
      subtitle={`${sourceLabel(entry)}${reason ? ` · ${reason}` : ""} · ${agoLabel(entry.at, nowIso)}`}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className={`${btn.base} ${btn.ghostRed} mr-auto`}
            disabled={busy}
            onClick={() => run({ action: "delete", groupId: entry.id }, "Entry deleted and stock put back")}
          >
            <Icon name="trash" size={15} />
            Delete entry
          </button>
          <button type="button" className={`${btn.base} ${btn.plain}`} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={`${btn.base} ${btn.dark}`}
            disabled={busy}
            onClick={() => run({ action: "fix", groupId: entry.id, lines }, "Entry fixed and stock adjusted")}
          >
            Save
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
          {entry.lines.map((original) => {
            const l = lines.find((x) => x.productId === original.productId)!;
            return (
              <li key={original.productId} className="flex items-center gap-2 px-3 py-2">
                <Thumb category={original.category} size="sm" />
                <b className="min-w-0 flex-1 truncate text-sm">{original.name}</b>
                <Stepper
                  value={l.qty}
                  min={0}
                  max={maxFor(original.productId, original.qty)}
                  label={`${original.name} quantity`}
                  onChange={(q) =>
                    setLines((ls) => ls.map((x) => (x.productId === original.productId ? { ...x, qty: q } : x)))
                  }
                />
              </li>
            );
          })}
        </ul>
        <p className="flex items-start gap-2 rounded-xl bg-chip px-3 py-2 text-sm text-chip-ink">
          <Icon name="info" size={15} className="mt-0.5 flex-none" />
          Stock is adjusted by the difference.
        </p>
        {error ? (
          <p role="alert" className="rounded-xl bg-red-bg px-3 py-2 text-sm text-red">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
