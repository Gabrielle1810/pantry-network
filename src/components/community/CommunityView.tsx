"use client";

// Community page (PJ), formerly "Share". Recommendation cards, pending pickups,
// and three tabs: Available to claim (region + category filters, smart chips),
// Your offers, Requests. Every label uses COMMUNITY_LABEL. Modals mount once and
// update in place; the page data refreshes behind them after each action.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { SmartCardShell, cardAction } from "@/components/ui/SmartCard";
import { btn } from "@/components/ui/Modal";
import { Thumb } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { formatUs } from "@/lib/dates";
import { pluralizeUnit } from "@/lib/items/units";
import { COMMUNITY_LABEL } from "@/lib/labels";
import type { CommunitySnapshot } from "@/lib/db/app-types";
import {
  COMMUNITY_SUBTITLE,
  REGION_OPTIONS,
  availableOffers,
  categoryGroups,
  myOffers,
  pickupViews,
  recommendations,
  requestViews,
  type CommunityTab,
  type RecommendationAction,
  type RegionFilter,
} from "@/lib/community";
import { inputCls } from "@/components/add/fields";
import { postCommunity } from "./api";
import { ClaimModal, OfferModal, RequestModal, type OfferPreset } from "./CommunityModals";

type ModalState =
  | { kind: "claim"; offerId: string }
  | { kind: "offer"; preset: OfferPreset }
  | { kind: "request"; preset: { name: string; category: string } }
  | null;

const units = (n: number, unit: string) => `${n} ${pluralizeUnit(unit, n)}`;
const dateText = (expiresOn: string | null, noExpire: boolean) =>
  noExpire ? "Doesn't expire" : expiresOn ? `Best by ${formatUs(expiresOn)}` : "No date";

export function CommunityView({
  campusId,
  data,
  todayIso,
  initialModal,
}: {
  campusId: string;
  data: CommunitySnapshot;
  todayIso: string;
  initialModal: ModalState;
}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<CommunityTab>("available");
  const [region, setRegion] = useState<RegionFilter>("all");
  const [group, setGroup] = useState<string>("all");
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [modal, setModal] = useState<ModalState>(initialModal);
  const [busy, setBusy] = useState<string | null>(null);

  const { rows, offers, requests, pickups } = data;
  const allAvailable = availableOffers({ activeCampus: campusId, rows, offers });
  const visible = availableOffers({ activeCampus: campusId, rows, offers, region, group });
  const mine = myOffers(campusId, offers, pickups);
  const reqs = requestViews(campusId, requests, rows);
  const pending = pickupViews(campusId, pickups);
  const recs = recommendations({ activeCampus: campusId, rows, offers, requests, todayIso, dismissed });
  const claimView = modal?.kind === "claim" ? allAvailable.find((v) => v.offer.id === modal.offerId) ?? null : null;
  const offerRequest = modal?.kind === "offer" && modal.preset.requestId ? requests.find((r) => r.id === modal.preset.requestId) : null;

  function open(next: ModalState) {
    window.history.replaceState(null, "", window.location.pathname); // don't reopen on refresh
    setModal(next);
  }

  function done(message: string, nextTab?: CommunityTab) {
    setModal(null);
    if (nextTab) setTab(nextTab);
    router.refresh();
    toast.show(message);
  }

  function runRec(a: RecommendationAction) {
    if (a.kind === "claim") open({ kind: "claim", offerId: a.offerId });
    else if (a.kind === "offer") open({ kind: "offer", preset: { productId: a.productId, qty: a.qty, requestId: a.requestId ?? null } });
    else if (a.kind === "dismiss") setDismissed((s) => new Set(s).add(a.key));
    else setTab(a.tab);
  }

  async function act(key: string, body: Parameters<typeof postCommunity>[0], message: (d: Awaited<ReturnType<typeof postCommunity>>["data"]) => string) {
    if (busy) return;
    setBusy(key);
    const r = await postCommunity(body);
    setBusy(null);
    router.refresh();
    toast.show(r.ok ? message(r.data) : (r.message ?? "That didn't go through. Try again."));
  }

  const tabs: { key: CommunityTab; label: string; n: number }[] = [
    { key: "available", label: "Available to claim", n: visible.length },
    { key: "mine", label: "Your offers", n: mine.length },
    { key: "requests", label: "Requests", n: reqs.length },
  ];

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{COMMUNITY_LABEL}</h1>
          <span className="text-[15px] text-muted">{COMMUNITY_SUBTITLE}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`${btn.base} ${btn.plain}`} onClick={() => open({ kind: "request", preset: { name: "", category: "Canned Goods" } })}>
            <Icon name="megaphone" size={15} />
            Open a request
          </button>
          <button type="button" className={`${btn.base} ${btn.dark}`} onClick={() => open({ kind: "offer", preset: { productId: null } })}>
            <Icon name="plus" size={15} />
            Post an offer
          </button>
        </div>
      </header>

      {pending.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {pending.map((p) => (
            <li
              key={p.pickup.id}
              className={`flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 ${
                p.direction === "incoming" ? "border-green-line bg-green-soft" : "border-line bg-surface"
              }`}
            >
              <Icon name="truck" size={18} className={p.direction === "incoming" ? "text-green" : "text-muted"} />
              <span className="min-w-0 flex-1 text-sm">
                <b>{p.direction === "incoming" ? "Pickup pending:" : "Being picked up:"}</b> {p.text}
                {p.direction === "incoming" && p.hours ? <span className="text-muted"> · {p.hours}</span> : null}
              </span>
              {p.direction === "incoming" ? (
                <button
                  type="button"
                  className={`${btn.base} ${btn.dark}`}
                  disabled={busy !== null}
                  onClick={() =>
                    act(`pickup-${p.pickup.id}`, { action: "pickup", pickupId: p.pickup.id }, (d) =>
                      d.moved ? `Inventory updated: +${units(d.moved, d.product?.unit ?? p.pickup.unit)}` : "Nothing was left to move",
                    )
                  }
                >
                  Mark picked up
                </button>
              ) : (
                <small className="text-muted">Still set aside on your shelf</small>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {recs.length > 0 ? (
        <section className={`grid gap-4 sm:grid-cols-2 ${recs.length >= 3 ? "xl:grid-cols-3" : ""}`}>
          {recs.map((r) => (
            <SmartCardShell key={r.key} tone={r.tone} icon={r.icon} label={r.label} title={r.title} sub={r.sub} highlight={r.highlight}>
              {r.actions.map((a) => (
                <button key={a.label} type="button" className={a.primary ? cardAction.primary : cardAction.plain} onClick={() => runRec(a.action)}>
                  {a.label}
                </button>
              ))}
            </SmartCardShell>
          ))}
        </section>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line">
        <div className="flex gap-1" role="tablist" aria-label={`${COMMUNITY_LABEL} sections`}>
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px inline-flex min-h-11 items-center gap-1.5 border-b-2 px-3 text-sm font-semibold ${
                tab === t.key ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t.label}
              <span className="rounded-full bg-chip px-1.5 text-xs text-chip-ink">{t.n}</span>
            </button>
          ))}
        </div>
        {tab === "available" ? (
          <div className="flex flex-wrap gap-2 pb-2">
            <label className="flex items-center gap-1 text-sm">
              <span className="sr-only">Distance</span>
              <select value={region} onChange={(e) => setRegion(e.target.value as RegionFilter)} className={`${inputCls} w-auto`}>
                {REGION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1 text-sm">
              <span className="sr-only">Category</span>
              <select value={group} onChange={(e) => setGroup(e.target.value)} className={`${inputCls} w-auto`}>
                <option value="all">All categories</option>
                {categoryGroups().map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </div>

      {tab === "available" ? (
        visible.length === 0 ? (
          <Empty text="No offers match these filters" />
        ) : (
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((v) => (
              <div key={v.offer.id} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
                <div className="flex items-start gap-3">
                  <Thumb category={v.offer.category} />
                  <div className="min-w-0">
                    <b className="block">{v.offer.name}</b>
                    <small className="text-muted">
                      {units(v.offer.qty, v.offer.unit)} · {dateText(v.offer.expiresOn, v.offer.noExpire)}
                    </small>
                  </div>
                </div>
                <Chip kind={v.chip.kind} icon={v.chip.icon} text={v.chip.text} />
                <div className="mt-auto flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <b className="block truncate text-sm">{v.campusName}</b>
                    <small className="text-muted">
                      {v.miles} mi · {v.region}
                    </small>
                  </span>
                  <button
                    type="button"
                    className={`${btn.base} ${v.chip.kind === "match" ? btn.dark : btn.plain}`}
                    onClick={() => open({ kind: "claim", offerId: v.offer.id })}
                  >
                    Claim
                  </button>
                </div>
              </div>
            ))}
          </section>
        )
      ) : null}

      {tab === "mine" ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {mine.map((m) => (
            <div key={m.offer.id} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
              <div className="flex items-start gap-3">
                <Thumb category={m.offer.category} />
                <div className="min-w-0">
                  <b className="block">{m.offer.name}</b>
                  <small className="text-muted">
                    {m.status === "open" ? `${units(m.offer.qty, m.offer.unit)} offered` : "All claimed"} · {dateText(m.offer.expiresOn, m.offer.noExpire)}
                  </small>
                </div>
              </div>
              <Chip kind={m.status === "open" ? "fact" : "match"} icon={m.status === "open" ? "radio" : "check"} text={m.chip} />
              {m.claimedBy.length > 0 && m.status === "open" ? (
                <small className="text-muted">
                  Claimed so far: {m.claimedBy.map((c) => `${c.qty} by ${c.campusName}`).join(", ")}
                </small>
              ) : null}
              <div className="mt-auto flex items-center justify-between gap-3">
                <small className="text-muted">{m.offer.note ? `Note: ${m.offer.note}` : "Set aside on your shelf"}</small>
                {m.status === "open" ? (
                  <button
                    type="button"
                    className={`${btn.base} ${btn.plain}`}
                    disabled={busy !== null}
                    onClick={() => act(`w-${m.offer.id}`, { action: "withdraw", offerId: m.offer.id }, () => "Offer withdrawn. Those items are back to normal.")}
                  >
                    Withdraw
                  </button>
                ) : null}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => open({ kind: "offer", preset: { productId: null } })}
            className="flex min-h-40 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line-2 bg-surface p-4 text-center hover:bg-hover"
          >
            <Icon name="plus" size={20} />
            <b>Post an offer</b>
            <small className="text-muted">Extra food? Nearby campuses will see it.</small>
          </button>
        </section>
      ) : null}

      {tab === "requests" ? (
        reqs.length === 0 ? (
          <Empty text="No requests yet" />
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {reqs.map((v) => (
              <li key={v.request.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Thumb category={v.request.category} size="sm" />
                <div className="min-w-0 flex-1">
                  <b className="block">
                    {v.campusName} needs {v.request.qty} {v.request.name.toLowerCase()}
                  </b>
                  <small className="text-muted">{v.where}</small>
                </div>
                {v.mine ? (
                  <span className="rounded-full bg-blue-bg px-2.5 py-1 text-xs font-medium text-blue">Open</span>
                ) : v.request.offered ? (
                  <span className="rounded-full bg-green-bg px-2.5 py-1 text-xs font-medium text-green">You offered {v.request.offered}</span>
                ) : v.match ? (
                  <button
                    type="button"
                    className={`${btn.base} ${btn.dark}`}
                    onClick={() =>
                      open({ kind: "offer", preset: { productId: v.match!.productId, qty: v.request.qty, requestId: v.request.id } })
                    }
                  >
                    Offer some
                  </button>
                ) : (
                  <small className="text-muted">Nothing on your shelf matches</small>
                )}
              </li>
            ))}
          </ul>
        )
      ) : null}

      {modal?.kind === "claim" && claimView ? (
        <ClaimModal view={claimView} rows={rows} onClose={() => setModal(null)} onDone={(m) => done(m)} />
      ) : null}
      {modal?.kind === "offer" ? (
        <OfferModal
          rows={rows}
          preset={modal.preset}
          requestCampusId={offerRequest?.campusId ?? null}
          onClose={() => setModal(null)}
          onDone={(m) => done(m, "mine")}
        />
      ) : null}
      {modal?.kind === "request" ? (
        <RequestModal preset={modal.preset} onClose={() => setModal(null)} onDone={(m) => done(m, "requests")} />
      ) : null}
      {toast.node}
    </>
  );
}

function Chip({ kind, icon, text }: { kind: "match" | "fact"; icon: string; text: string }) {
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        kind === "match" ? "bg-green-bg text-green" : "bg-chip text-chip-ink"
      }`}
    >
      <Icon name={icon} size={12} />
      {text}
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-line bg-surface px-4 py-12 text-muted">
      <Icon name="search-x" size={22} />
      <b className="text-ink">{text}</b>
    </div>
  );
}
