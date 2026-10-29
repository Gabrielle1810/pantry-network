"use client";

// Community modals: Claim, Post an offer, Open a request. Each mounts once when
// opened; steppers, selects and inputs update in place (no re-mount, no jump).
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Modal, btn } from "@/components/ui/Modal";
import { Stepper, Thumb } from "@/components/ui/primitives";
import { CATEGORY_VALUES } from "@/lib/items/taxonomy";
import { pluralizeUnit } from "@/lib/items/units";
import { formatUs } from "@/lib/dates";
import { CAMPUSES, campusName } from "@/lib/campus";
import { availableOf, clampAmount, type OfferView } from "@/lib/community";
import type { InventoryRow } from "@/lib/db/app-types";
import { COMMUNITY_LABEL } from "@/lib/labels";
import { inputCls } from "@/components/add/fields";
import { postCommunity } from "./api";

const units = (n: number, unit: string) => `${n} ${pluralizeUnit(unit, n)}`;

function useSubmit(onDone: (message: string) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(body: Parameters<typeof postCommunity>[0], message: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await postCommunity(body);
    setBusy(false);
    if (r.ok) onDone(message);
    else setError(r.message ?? "That didn't go through. Try again.");
  }
  return { busy, error, run };
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="rounded-xl bg-red-bg px-3 py-2 text-sm text-red">
      {error}
    </p>
  ) : null;
}

// ---------------------------------------------------------------- Claim
export function ClaimModal({
  view,
  rows,
  onClose,
  onDone,
}: {
  view: OfferView;
  rows: InventoryRow[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const o = view.offer;
  const c = CAMPUSES[o.campusId];
  const [qty, setQty] = useState(() => clampAmount(Math.min(o.qty, 24), o.qty));
  const { busy, error, run } = useSubmit(onDone);
  const mine = rows
    .filter((r) => r.category === o.category)
    .sort((a, b) => a.onShelf / Math.max(1, a.lastRestock) - b.onShelf / Math.max(1, b.lastRestock))[0];

  return (
    <Modal
      title={`Claim ${o.name.toLowerCase()}`}
      subtitle={`from ${view.campusName} · ${view.region} · ${view.miles} mi`}
      leading={<Thumb category={o.category} />}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={`${btn.base} ${btn.plain}`} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={`${btn.base} ${btn.dark} min-w-[9rem]`}
            disabled={busy || qty < 1}
            onClick={() =>
              run(
                { action: "claim", offerId: o.id, qty },
                `Claimed ${units(qty, o.unit)}. ${view.campusName} has been told.`,
              )
            }
          >
            {busy ? "Claiming…" : `Claim ${units(qty, o.unit)}`}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {view.chip.kind === "match" && mine ? (
          <p className="flex items-start gap-2 rounded-xl bg-green-soft px-3 py-2 text-sm text-green">
            <Icon name="sparkles" size={15} className="mt-0.5 flex-none" />
            {view.chip.text} ({mine.onShelf} of {mine.lastRestock} {mine.name} left). {units(qty, o.unit)} would refill your shelf
            {qty >= mine.lastRestock * 2 ? " twice over" : ""}.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>
            <b className="block">How many do you need?</b>
            <small className="text-muted">
              Up to {o.qty} available{o.expiresOn ? ` · Best by ${formatUs(o.expiresOn)}` : o.noExpire ? " · Doesn't expire" : ""}
            </small>
          </span>
          <Stepper value={qty} min={1} max={o.qty} label="How many" onChange={(n) => setQty(clampAmount(n, o.qty))} />
        </div>
        <div className="flex flex-col gap-1.5 rounded-xl bg-[#fafbf9] p-3 text-sm">
          <b>Pickup at {view.campusName}</b>
          {c?.place ? (
            <span className="flex items-start gap-2 text-muted">
              <Icon name="map-pin" size={15} className="mt-0.5 flex-none" />
              {c.place}
            </span>
          ) : null}
          {c?.hours ? (
            <span className="flex items-start gap-2 text-muted">
              <Icon name="clock" size={15} className="mt-0.5 flex-none" />
              {c.hours}
            </span>
          ) : null}
          {c?.contact ? (
            <span className="flex items-start gap-2 text-muted">
              <Icon name="user" size={15} className="mt-0.5 flex-none" />
              {c.contact}
            </span>
          ) : null}
        </div>
        <div>
          <h3 className="mb-2 font-semibold">What happens next</h3>
          <ol className="flex flex-col gap-2 text-sm">
            {[
              `${view.campusName} is told right away.`,
              "You agree on a pickup time.",
              "Mark it picked up and both inventories update.",
            ].map((s, i) => (
              <li key={s} className="flex items-center gap-2">
                <b className="grid h-6 w-6 flex-none place-items-center rounded-full bg-chip text-xs">{i + 1}</b>
                {s}
              </li>
            ))}
          </ol>
        </div>
        <ErrorLine error={error} />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Offer
export interface OfferPreset {
  productId: string | null;
  qty?: number;
  requestId?: string | null;
}

export function OfferModal({
  rows,
  preset,
  requestCampusId,
  onClose,
  onDone,
}: {
  rows: InventoryRow[];
  preset: OfferPreset;
  /** Campus whose request this answers (for the hint). */
  requestCampusId: string | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const choices = rows.filter((r) => r.status !== "expired" && availableOf(r) > 0);
  const [productId, setProductId] = useState(() =>
    preset.productId && choices.some((r) => r.productId === preset.productId) ? preset.productId : (choices[0]?.productId ?? ""),
  );
  const item = choices.find((r) => r.productId === productId) ?? null;
  const max = item ? availableOf(item) : 0;
  const [qty, setQty] = useState(() => clampAmount(preset.qty ?? max, max));
  const [note, setNote] = useState("");
  const { busy, error, run } = useSubmit(onDone);
  const shown = clampAmount(qty, max);

  return (
    <Modal
      title="Post an offer"
      subtitle="Nearby campuses see it, closest first. The amount stays on your shelf, set aside, until it's picked up."
      onClose={onClose}
      footer={
        <>
          <button type="button" className={`${btn.base} ${btn.plain}`} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={`${btn.base} ${btn.dark} min-w-[9rem]`}
            disabled={busy || !item || shown < 1}
            onClick={() =>
              item &&
              run(
                { action: "offer", productId: item.productId, qty: shown, note: note.trim() || null, requestId: preset.requestId ?? null },
                `Offer posted: ${units(shown, item.unit)} of ${item.name.toLowerCase()}`,
              )
            }
          >
            {busy ? "Posting…" : item ? `Offer ${units(shown, item.unit)}` : "Offer"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {choices.length === 0 ? (
          <p className="text-sm text-muted">Nothing on your shelves can be offered right now.</p>
        ) : (
          <label className="flex flex-col gap-1 text-sm font-medium text-muted">
            Item
            <select
              value={productId}
              className={inputCls}
              onChange={(e) => {
                const next = choices.find((r) => r.productId === e.target.value);
                setProductId(e.target.value);
                setQty((q) => clampAmount(q, next ? availableOf(next) : 0));
              }}
            >
              {choices.map((r) => (
                <option key={r.productId} value={r.productId}>
                  {r.name} · {availableOf(r)} you can spare
                </option>
              ))}
            </select>
          </label>
        )}
        {item ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              <b className="block">How many can you spare?</b>
              <small className="text-muted">
                {item.expiresOn ? `Best by ${formatUs(item.expiresOn)}` : item.noExpire ? "Doesn't expire" : "No date"}
                {item.reserved ? ` · ${item.reserved} already set aside` : ""}
              </small>
            </span>
            <Stepper value={shown} min={1} max={max} label="How many" onChange={(n) => setQty(clampAmount(n, max))} />
          </div>
        ) : null}
        <label className="flex flex-col gap-1 text-sm font-medium text-muted">
          Note for pickup (optional)
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Like: ask at the front desk" className={inputCls} />
        </label>
        {requestCampusId ? (
          <p className="flex items-start gap-2 rounded-xl bg-green-soft px-3 py-2 text-sm text-green">
            <Icon name="megaphone" size={15} className="mt-0.5 flex-none" />
            This answers {campusName(requestCampusId)}&apos;s request.
          </p>
        ) : null}
        <ErrorLine error={error} />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Request
export function RequestModal({
  preset,
  onClose,
  onDone,
}: {
  preset: { name: string; category: string };
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [name, setName] = useState(preset.name);
  const [category, setCategory] = useState(
    CATEGORY_VALUES.includes(preset.category) ? preset.category : "Canned Goods",
  );
  const [qty, setQty] = useState(12);
  const { busy, error, run } = useSubmit(onDone);

  return (
    <Modal
      title="Open a request"
      subtitle={`Campuses with extra see it on ${COMMUNITY_LABEL} and can offer some.`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={`${btn.base} ${btn.plain}`} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={`${btn.base} ${btn.dark}`}
            disabled={busy || !name.trim()}
            onClick={() => run({ action: "request", name: name.trim(), category, qty }, "Request posted to nearby campuses")}
          >
            {busy ? "Posting…" : "Post request"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium text-muted">
          What do you need?
          <input autoFocus={!preset.name} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Like cereal cups" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-muted">
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
            {CATEGORY_VALUES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <div className="flex items-center justify-between gap-3">
          <b>How many?</b>
          <Stepper value={qty} min={1} max={999} label="How many" onChange={setQty} />
        </div>
        <ErrorLine error={error} />
      </div>
    </Modal>
  );
}
