// Community rules (PJ), formerly "Share". Pure: smart chips, the offers a campus
// can claim, recommendation cards, request matching, and the views for "Your
// offers", "Requests" and pending pickups. Stock moves live in AppService.
import { CAMPUSES, distanceMiles, campusName } from "@/lib/campus";
import { CATEGORY_META, categoryMeta } from "@/lib/items/category-meta";
import { pluralizeUnit } from "@/lib/items/units";
import { daysUntil, monthNameOf } from "@/lib/dates";
import type { InventoryRow } from "@/lib/db/app-types";
import type { OfferRec, PickupRec, RequestRec } from "@/lib/db/store";
import { COMMUNITY_LABEL } from "@/lib/labels";

export interface ChipView {
  text: string;
  kind: "match" | "fact";
  icon: string;
  /** Lower ranks sort first. */
  rank: number;
}

/** What a staff member can act on for a product: on shelf minus reserved. */
export function availableOf(r: Pick<InventoryRow, "onShelf" | "reserved">): number {
  return Math.max(0, r.onShelf - r.reserved);
}

/** The smart chip on an offer, from the claiming campus's point of view. */
export function matchChip(offer: OfferRec, activeCampus: string, rows: InventoryRow[], offers: OfferRec[]): ChipView {
  const mine = rows.filter((r) => r.category === offer.category);
  if (mine.some((r) => r.status === "out")) return { text: "You're out of this", kind: "match", icon: "sparkles", rank: 0 };
  if (mine.some((r) => r.status === "low")) return { text: "You're running low", kind: "match", icon: "sparkles", rank: 1 };
  if (offer.noExpire) return { text: "Doesn't expire", kind: "fact", icon: "infinity", rank: 3 };
  if (distanceMiles(activeCampus, offer.campusId) <= 10) return { text: "Closest to you", kind: "fact", icon: "map-pin", rank: 2 };
  const same = offers.find((o) => o.id !== offer.id && o.campusId === offer.campusId && o.status === "open" && o.qty > 0);
  if (same && offer.qty < 100) {
    return { text: `Same pickup as the ${same.name.toLowerCase()}`, kind: "fact", icon: "route", rank: 4 };
  }
  if (offer.qty >= 60) return { text: `Big batch · ${offer.qty} ${pluralizeUnit(offer.unit, offer.qty)}`, kind: "fact", icon: "layers", rank: 4 };
  if (offer.expiresOn) return { text: `Lasts until ${monthNameOf(offer.expiresOn)}`, kind: "fact", icon: "clock", rank: 4 };
  return { text: "Shelf stable", kind: "fact", icon: "package", rank: 5 };
}

export interface OfferView {
  offer: OfferRec;
  chip: ChipView;
  miles: number;
  campusName: string;
  region: string;
  group: string;
}

export type RegionFilter = "all" | "10" | "25" | "60";

export const REGION_OPTIONS: { value: RegionFilter; label: string }[] = [
  { value: "all", label: "All of Massachusetts" },
  { value: "10", label: "Within 10 mi" },
  { value: "25", label: "Within 25 mi" },
  { value: "60", label: "Within 60 mi" },
];

/** Category groups for the filter, in taxonomy order. */
export function categoryGroups(): string[] {
  return [...new Set(Object.values(CATEGORY_META).map((m) => m.group))];
}

/** Open offers from OTHER campuses, ranked by chip then distance, then filtered. */
export function availableOffers(args: {
  activeCampus: string;
  rows: InventoryRow[];
  offers: OfferRec[];
  region?: RegionFilter;
  group?: string | "all";
}): OfferView[] {
  const { activeCampus, rows, offers, region = "all", group = "all" } = args;
  return offers
    .filter((o) => o.status === "open" && o.qty > 0 && o.campusId !== activeCampus)
    .map((offer) => ({
      offer,
      chip: matchChip(offer, activeCampus, rows, offers),
      miles: distanceMiles(activeCampus, offer.campusId),
      campusName: campusName(offer.campusId),
      region: CAMPUSES[offer.campusId]?.region ?? "",
      group: categoryMeta(offer.category).group,
    }))
    .filter((v) => region === "all" || v.miles <= Number(region))
    .filter((v) => group === "all" || v.group === group)
    .sort((a, b) => a.chip.rank - b.chip.rank || a.miles - b.miles || a.offer.name.localeCompare(b.offer.name));
}

function words(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length >= 3)
      .map((w) => w.replace(/s$/, "")),
  );
}

/**
 * The active campus's product that best answers a request: same category or a
 * shared word in the name, something left to give, not expired. Most to give wins ties.
 */
export function matchRequest(request: Pick<RequestRec, "name" | "category">, rows: InventoryRow[]): InventoryRow | null {
  const want = words(request.name);
  let best: { row: InventoryRow; score: number } | null = null;
  for (const row of rows) {
    if (row.status === "expired" || availableOf(row) <= 0) continue;
    const shared = [...words(row.name)].filter((w) => want.has(w)).length;
    const score = (row.category === request.category ? 2 : 0) + shared;
    if (score < 2 && shared === 0) continue;
    if (!best || score > best.score || (score === best.score && availableOf(row) > availableOf(best.row))) best = { row, score };
  }
  return best?.row ?? null;
}

function inDays(iso: string, todayIso: string): string {
  const n = daysUntil(iso, todayIso);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n < 0) return `${-n} days ago`;
  return `in ${n} days`;
}

export type RecommendationAction =
  | { kind: "claim"; offerId: string }
  | { kind: "offer"; productId: string; qty?: number; requestId?: string }
  | { kind: "dismiss"; key: string }
  | { kind: "tab"; tab: CommunityTab };

export interface RecommendationView {
  key: "claim" | "offer" | "need";
  tone: "green" | "blue" | "amber";
  icon: string;
  label: string;
  title: string;
  sub: string;
  highlight?: boolean;
  actions: { label: string; primary?: boolean; action: RecommendationAction }[];
}

export type CommunityTab = "available" | "mine" | "requests";

export function recommendations(args: {
  activeCampus: string;
  rows: InventoryRow[];
  offers: OfferRec[];
  requests: RequestRec[];
  todayIso: string;
  dismissed?: Set<string>;
}): RecommendationView[] {
  const { activeCampus, rows, offers, requests, todayIso, dismissed = new Set() } = args;
  const out: RecommendationView[] = [];

  const best = availableOffers({ activeCampus, rows, offers }).find((v) => v.chip.kind === "match");
  if (best) {
    out.push({
      key: "claim",
      tone: "green",
      icon: "hand-heart",
      label: "You could claim",
      highlight: true,
      title: `${best.campusName} is offering ${best.offer.qty} ${best.offer.name.toLowerCase()}`,
      sub: `${best.chip.text} · ${best.miles} mi away`,
      actions: [{ label: "Claim", primary: true, action: { kind: "claim", offerId: best.offer.id } }],
    });
  }

  const offeredIds = new Set(offers.filter((o) => o.campusId === activeCampus && o.status === "open" && o.productId).map((o) => o.productId!));
  const soon = rows
    .filter((r) => r.status === "soon" && r.expiresOn && availableOf(r) > 0 && !offeredIds.has(r.productId))
    .sort((a, b) => (a.expiresOn! < b.expiresOn! ? -1 : 1))[0];
  if (soon && !dismissed.has("offer")) {
    const n = availableOf(soon);
    out.push({
      key: "offer",
      tone: "blue",
      icon: "send",
      label: "You could offer",
      title: `Your ${soon.name.toLowerCase()} expires ${inDays(soon.expiresOn!, todayIso)}`,
      sub: `${n} ${pluralizeUnit(soon.unit, n)} · offer them before they go to waste`,
      actions: [
        { label: "Offer", primary: true, action: { kind: "offer", productId: soon.productId } },
        { label: "Not now", action: { kind: "dismiss", key: "offer" } },
      ],
    });
  }

  for (const r of requests) {
    if (r.campusId === activeCampus || r.offered) continue;
    const match = matchRequest(r, rows);
    if (!match) continue;
    const c = CAMPUSES[r.campusId];
    out.push({
      key: "need",
      tone: "amber",
      icon: "megaphone",
      label: "Someone needs",
      title: `${campusName(r.campusId)} needs ${r.qty} ${r.name.toLowerCase()}`,
      sub: `You have ${availableOf(match)} · ${c?.region ?? ""} · ${distanceMiles(activeCampus, r.campusId)} mi`,
      actions: [
        { label: "Offer some", primary: true, action: { kind: "offer", productId: match.productId, qty: r.qty, requestId: r.id } },
        { label: "View request", action: { kind: "tab", tab: "requests" } },
      ],
    });
    break;
  }
  return out;
}

// ---- "Your offers" ----
export interface MyOfferView {
  offer: OfferRec;
  status: "open" | "claimed";
  chip: string;
  claimedBy: { campusName: string; qty: number }[];
}

export function myOffers(activeCampus: string, offers: OfferRec[], pickups: PickupRec[]): MyOfferView[] {
  const others = Object.keys(CAMPUSES).length - 1;
  return offers
    .filter((o) => o.campusId === activeCampus && (o.status === "open" || o.status === "claimed"))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((offer) => {
      const claimedBy = pickups
        .filter((p) => p.offerId === offer.id)
        .map((p) => ({ campusName: campusName(p.toCampus), qty: p.qty }));
      const status = offer.status === "open" && offer.qty > 0 ? "open" : "claimed";
      return {
        offer,
        status,
        claimedBy,
        chip: status === "open" ? `Visible to ${others} campuses` : `Claimed by ${[...new Set(claimedBy.map((c) => c.campusName))].join(", ") || "another campus"}`,
      };
    });
}

// ---- Requests ----
export interface RequestView {
  request: RequestRec;
  mine: boolean;
  campusName: string;
  where: string;
  match: InventoryRow | null;
}

export function requestViews(activeCampus: string, requests: RequestRec[], rows: InventoryRow[]): RequestView[] {
  return [...requests]
    .sort((a, b) => Number(b.campusId === activeCampus) - Number(a.campusId === activeCampus) || (a.createdAt < b.createdAt ? 1 : -1))
    .map((request) => {
      const mine = request.campusId === activeCampus;
      return {
        request,
        mine,
        campusName: campusName(request.campusId),
        where: mine
          ? `Your request · nearby campuses can offer`
          : `${CAMPUSES[request.campusId]?.region ?? ""} · ${distanceMiles(activeCampus, request.campusId)} mi`,
        match: mine ? null : matchRequest(request, rows),
      };
    });
}

// ---- Pickups ----
export interface PickupView {
  pickup: PickupRec;
  /** "incoming": this campus collects it (and marks it picked up). */
  direction: "incoming" | "outgoing";
  text: string;
  hours: string;
}

export function pickupViews(activeCampus: string, pickups: PickupRec[]): PickupView[] {
  return pickups
    .filter((p) => p.status === "pending" && (p.toCampus === activeCampus || p.fromCampus === activeCampus))
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    .map((pickup) => {
      const incoming = pickup.toCampus === activeCampus;
      const units = `${pickup.qty} ${pluralizeUnit(pickup.unit, pickup.qty)}`;
      return {
        pickup,
        direction: incoming ? "incoming" : "outgoing",
        text: incoming
          ? `${units} of ${pickup.name.toLowerCase()} from ${campusName(pickup.fromCampus)}`
          : `${campusName(pickup.toCampus)} is picking up ${units} of ${pickup.name.toLowerCase()}`,
        hours: CAMPUSES[pickup.fromCampus]?.hours ?? "",
      };
    });
}

/** Clamp a claim/offer amount to 1..max (whole units). */
export function clampAmount(n: number, max: number): number {
  if (!Number.isFinite(n) || max < 1) return 0;
  return Math.min(Math.max(1, Math.round(n)), max);
}

export const COMMUNITY_SUBTITLE = `Claim food nearby, offer what you can spare`;
export const COMMUNITY_TITLE = COMMUNITY_LABEL;
