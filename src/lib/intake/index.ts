// Add-stock logic (Step 3): review-draft rules and the headless add-flow state
// machine shared by the phone camera flow and the typed form. Components only
// render this state and dispatch events (PA.1). Pure; no I/O.
import type { LabelRead } from "@/lib/vision/schema";
import type { ProductCorrection } from "@/lib/corrections";
import { normalizeCategory, categoryGroup } from "@/lib/items/taxonomy";
import { resolveUnit, pluralizeUnit } from "@/lib/items/units";
import { spellOut } from "@/lib/dates";

export type DeliverySource = "donated" | "purchased" | null;
export type DateType = LabelRead["date_type"];

export const MIN_QUANTITY = 1;
export const MAX_QUANTITY = 999;
export const STILL_NO_DATE = "Still no date. Type it, or save without one.";

export interface ReviewDraft {
  name: string;
  brand: string;
  sizeText: string | null;
  category: string;
  unit: string;
  quantity: number;
  expiresOn: string | null;
  dateType: DateType;
  datePrecision: "day" | "month" | null;
  /** True while a two-way numeric date is unresolved. Blocks saving. */
  dateAmbiguous: boolean;
  dateCandidates: string[];
  noExpire: boolean;
  perishable: boolean;
  source: DeliverySource;
}

export function clampQuantity(n: number): number {
  if (!Number.isFinite(n)) return MIN_QUANTITY;
  return Math.min(MAX_QUANTITY, Math.max(MIN_QUANTITY, Math.round(n)));
}

/**
 * Merge an edit into a draft, keeping the date rules consistent: typing a date
 * resolves any ambiguity and clears "doesn't expire"; "doesn't expire" clears
 * the date; quantity is clamped to 1..999; category is normalized.
 */
export function applyEdit(draft: ReviewDraft, patch: Partial<ReviewDraft>): ReviewDraft {
  const next: ReviewDraft = { ...draft, ...patch };
  if (patch.quantity !== undefined) next.quantity = clampQuantity(patch.quantity);
  if (patch.category !== undefined) next.category = normalizeCategory(patch.category);
  if (patch.expiresOn !== undefined) {
    next.expiresOn = patch.expiresOn || null;
    if (next.expiresOn) {
      next.noExpire = false;
      next.dateAmbiguous = false;
      next.dateCandidates = [];
      if (patch.dateType === undefined && draft.dateType === "none") next.dateType = "best_by";
      if (patch.datePrecision === undefined) next.datePrecision = "day";
    }
  }
  if (patch.noExpire === true) {
    next.expiresOn = null;
    next.dateAmbiguous = false;
    next.dateCandidates = [];
  }
  return next;
}

export function emptyDraft(prefill: Partial<ReviewDraft> = {}): ReviewDraft {
  const base: ReviewDraft = {
    name: "",
    brand: "",
    sizeText: null,
    category: "Uncategorized",
    unit: "item",
    quantity: 1,
    expiresOn: null,
    dateType: "none",
    datePrecision: null,
    dateAmbiguous: false,
    dateCandidates: [],
    noExpire: false,
    perishable: false,
    source: null,
  };
  return applyEdit(base, prefill);
}

/**
 * Build the review draft from an AI read. A remembered fix (keyed by the
 * original read) prefills name/brand/category; dates always come from this
 * read, never from a fix (UI9.3). Returns which fields the fix changed so the
 * UI can show "Remembered fix".
 */
export function draftFromRead(
  read: LabelRead,
  remembered: ProductCorrection | null = null,
): { draft: ReviewDraft; rememberedFields: string[] } {
  const rememberedFields: string[] = [];
  const pick = (field: string, fromRead: string, fromFix: string | null | undefined): string => {
    if (fromFix && fromFix !== fromRead) {
      rememberedFields.push(field);
      return fromFix;
    }
    return fromRead;
  };

  const name = pick("name", read.name ?? "", remembered?.name);
  const brand = pick("brand", read.brand ?? "", remembered?.brand);
  const category = pick(
    "category",
    normalizeCategory(read.category),
    remembered?.category ? normalizeCategory(remembered.category) : null,
  );
  const noExpire = read.doesnt_expire;
  const ambiguous = !noExpire && read.date_ambiguous;

  return {
    rememberedFields,
    draft: {
      name,
      brand,
      sizeText: read.size_text,
      category,
      unit: resolveUnit(read.container, category),
      quantity: clampQuantity(read.quantity_visible ?? 1),
      expiresOn: noExpire || ambiguous ? null : read.expires_on,
      dateType: read.date_type,
      datePrecision: read.date_precision,
      dateAmbiguous: ambiguous,
      dateCandidates: ambiguous ? [...read.date_candidates] : [],
      noExpire,
      perishable: read.perishable,
      source: null,
    },
  };
}

/** Pick one of the two ambiguous readings. */
export function chooseDate(draft: ReviewDraft, iso: string): ReviewDraft {
  if (!draft.dateCandidates.includes(iso)) return draft;
  return { ...draft, expiresOn: iso, dateAmbiguous: false, dateCandidates: [], datePrecision: "day" };
}

/** Keep the date Unknown (resolves ambiguity with no date). */
export function keepUnknown(draft: ReviewDraft): ReviewDraft {
  return { ...draft, expiresOn: null, dateAmbiguous: false, dateCandidates: [] };
}

/** Labelled choices for an ambiguous date, month-first (US) reading first. */
export function ambiguousChoices(draft: ReviewDraft): { iso: string; label: string; reading: string }[] {
  return draft.dateCandidates.map((iso, i) => ({
    iso,
    label: spellOut(iso),
    reading: i === 0 ? "Month first (US)" : "Day first",
  }));
}

/**
 * Merge a date-only read ("Photograph the date instead") into the draft. Only
 * the date fields change; name, brand, category, unit and quantity stay.
 */
export function applyDateOnlyRead(draft: ReviewDraft, read: LabelRead): { draft: ReviewDraft; found: boolean } {
  if (read.date_ambiguous && read.date_candidates.length >= 2) {
    return {
      found: true,
      draft: {
        ...draft,
        expiresOn: null,
        dateAmbiguous: true,
        dateCandidates: [...read.date_candidates],
        dateType: read.date_type,
        datePrecision: read.date_precision,
        noExpire: false,
      },
    };
  }
  if (read.expires_on) {
    return {
      found: true,
      draft: {
        ...draft,
        expiresOn: read.expires_on,
        dateAmbiguous: false,
        dateCandidates: [],
        dateType: read.date_type,
        datePrecision: read.date_precision,
        noExpire: false,
      },
    };
  }
  return { found: false, draft };
}

/** Name present, quantity 1..999, and no unresolved ambiguous date. */
export function isSavable(draft: ReviewDraft): boolean {
  return (
    draft.name.trim().length > 0 &&
    Number.isInteger(draft.quantity) &&
    draft.quantity >= MIN_QUANTITY &&
    draft.quantity <= MAX_QUANTITY &&
    !draft.dateAmbiguous
  );
}

export function saveButtonLabel(draft: ReviewDraft): string {
  if (!draft.noExpire && !draft.expiresOn) return "Save without a date";
  return `Save ${draft.quantity} ${pluralizeUnit(draft.unit, draft.quantity)}`;
}

const DATE_ROW_LABEL: Record<DateType, string> = {
  best_by: "Best by",
  use_by: "Use by",
  sell_by: "Sell by",
  unlabeled: "Date",
  none: "Best by",
};

export function dateRowLabel(dateType: DateType): string {
  return DATE_ROW_LABEL[dateType] ?? "Date";
}

/** ISO dates that came from a photo (read or date-only read). */
function photoDatesOf(read: LabelRead): string[] {
  return [read.expires_on, ...read.date_candidates].filter((d): d is string => !!d);
}

/** "photo" when the saved date came from a photo, "typed" when staff typed it. */
export function dateSourceFor(draft: ReviewDraft, photoDates: string[]): "photo" | "typed" | null {
  if (!draft.expiresOn) return null;
  return photoDates.includes(draft.expiresOn) ? "photo" : "typed";
}

/**
 * Fields staff changed relative to the read (after any remembered fix, which
 * does not count as an edit). Choosing one of the photo's own dates is not an
 * edit. Typed entries (no baseline) have no edited fields.
 */
export function computeEditedFields(
  baseline: ReviewDraft | null,
  draft: ReviewDraft,
  photoDates: string[] = [],
): string[] {
  if (!baseline) return [];
  const edited: string[] = [];
  const norm = (s: string) => s.trim().toLowerCase();
  if (norm(draft.name) !== norm(baseline.name)) edited.push("name");
  if (norm(draft.brand) !== norm(baseline.brand)) edited.push("brand");
  if (draft.category !== baseline.category) edited.push("category");
  if (draft.quantity !== baseline.quantity) edited.push("quantity");
  if (draft.unit !== baseline.unit) edited.push("unit");
  if (draft.noExpire !== baseline.noExpire) edited.push("doesnt_expire");
  const dateChanged = draft.expiresOn !== baseline.expiresOn;
  const fromPhoto = draft.expiresOn !== null && photoDates.includes(draft.expiresOn);
  if (dateChanged && !fromPhoto) edited.push("expires_on");
  return edited;
}

/** The POST /api/items body (same shape for phone and typed saves). */
export interface SaveBody {
  idempotencyKey: string;
  batch: {
    name: string;
    brand: string | null;
    size_text: string | null;
    category: string;
    category_group: string | null;
    quantity: number;
    unit: string;
    expires_on: string | null;
    date_type: string | null;
    date_precision: "day" | "month" | null;
    date_source: "photo" | "typed" | null;
    dont_track: boolean;
    doesnt_expire: boolean;
    perishable: boolean;
    source: DeliverySource;
  };
  read: {
    name: string | null;
    brand: string | null;
    category: string | null;
    date_raw: string | null;
    expires_on: string | null;
    name_confidence: number | null;
    date_confidence: number | null;
  } | null;
  editedFields: string[];
}

export function toSaveBody(args: {
  draft: ReviewDraft;
  read: LabelRead | null;
  baseline: ReviewDraft | null;
  photoDates: string[];
  idempotencyKey: string;
}): SaveBody {
  const { draft, read, baseline, photoDates, idempotencyKey } = args;
  const expiresOn = draft.noExpire ? null : draft.expiresOn;
  return {
    idempotencyKey,
    batch: {
      name: draft.name.trim(),
      brand: draft.brand.trim() || null,
      size_text: draft.sizeText,
      category: draft.category,
      category_group: categoryGroup(draft.category),
      quantity: draft.quantity,
      unit: draft.unit,
      expires_on: expiresOn,
      date_type: expiresOn ? draft.dateType : null,
      date_precision: expiresOn ? (draft.datePrecision ?? "day") : null,
      date_source: dateSourceFor({ ...draft, expiresOn }, photoDates),
      dont_track: false,
      doesnt_expire: draft.noExpire,
      perishable: draft.perishable,
      source: draft.source,
    },
    read: read
      ? {
          name: read.name,
          brand: read.brand,
          category: read.category,
          date_raw: read.date_raw,
          expires_on: read.expires_on,
          name_confidence: read.name_confidence,
          date_confidence: read.date_confidence,
        }
      : null,
    editedFields: computeEditedFields(baseline, draft, photoDates),
  };
}

// ---------------------------------------------------------------------------
// Saved summary (the "Saved to Inventory" screen)
// ---------------------------------------------------------------------------

export interface SavedSummary {
  name: string;
  unit: string;
  category: string;
  added: number;
  before: number;
  after: number;
  firstBatch: boolean;
}

export interface DeliveryLine {
  name: string;
  added: number;
  unit: string;
}

export interface SaveResponse {
  product: { name: string; unit: string; category: string };
  totals: { before: number; added: number; after: number; firstBatch: boolean };
}

export function summaryFromResponse(r: SaveResponse): SavedSummary {
  return {
    name: r.product.name,
    unit: r.product.unit,
    category: r.product.category,
    added: r.totals.added,
    before: r.totals.before,
    after: r.totals.after,
    firstBatch: r.totals.firstBatch,
  };
}

/** "Tomato paste: 2 on the shelf + 4 added = 6", or "{name}: 4 added" the first time. */
export function savedLine(s: SavedSummary): string {
  if (s.firstBatch) return `${s.name}: ${s.added} added`;
  return `${s.name}: ${s.before} on the shelf + ${s.added} added = ${s.after}`;
}

/** "+4 cans" */
export function addedPill(s: { added: number; unit: string }): string {
  return `+${s.added} ${pluralizeUnit(s.unit, s.added)}`;
}

// ---------------------------------------------------------------------------
// Headless add-flow state machine (phone)
// ---------------------------------------------------------------------------

export type AddStep = "camera" | "reading" | "review" | "saving" | "saved" | "typing";

export interface AddFlowState {
  step: AddStep;
  /** "label" = whole label; "date" = re-photographing just the date. */
  cameraMode: "label" | "date";
  /** Frozen label photo as a data URL (memory only, never stored). */
  photo: string | null;
  read: LabelRead | null;
  /** The draft as read (after any remembered fix); edits are measured against it. */
  baseline: ReviewDraft | null;
  rememberedFields: string[];
  photoDates: string[];
  draft: ReviewDraft;
  provider: string | null;
  unreadable: boolean;
  note: string | null;
  error: string | null;
  idempotencyKey: string;
  saved: SavedSummary | null;
  delivery: DeliveryLine[];
}

export type AddFlowEvent =
  | { type: "SHUTTER"; photo: string | null }
  | { type: "READ_OK"; read: LabelRead; remembered: ProductCorrection | null; provider: string }
  | { type: "READ_UNREADABLE"; provider: string }
  | { type: "READ_FAILED"; message: string }
  | { type: "DATE_READ"; read: LabelRead | null }
  | { type: "EDIT"; patch: Partial<ReviewDraft> }
  | { type: "CHOOSE_DATE"; iso: string }
  | { type: "KEEP_UNKNOWN" }
  | { type: "PHOTOGRAPH_DATE" }
  | { type: "CANCEL_DATE_PHOTO" }
  | { type: "RETAKE" }
  | { type: "CONFIRM_SAVE" }
  | { type: "SAVE_OK"; summary: SavedSummary }
  | { type: "SAVE_FAILED"; message: string }
  | { type: "TYPE_INSTEAD" }
  | { type: "BACK_TO_CAMERA" }
  | { type: "TYPED_SAVED"; summary: SavedSummary }
  | { type: "ADD_ANOTHER"; idempotencyKey: string };

export function initialAddFlow(idempotencyKey: string, step: "camera" | "typing" = "camera"): AddFlowState {
  return {
    step,
    cameraMode: "label",
    photo: null,
    read: null,
    baseline: null,
    rememberedFields: [],
    photoDates: [],
    draft: emptyDraft(),
    provider: null,
    unreadable: false,
    note: null,
    error: null,
    idempotencyKey,
    saved: null,
    delivery: [],
  };
}

function freshItem(s: AddFlowState): AddFlowState {
  return {
    ...s,
    cameraMode: "label",
    photo: null,
    read: null,
    baseline: null,
    rememberedFields: [],
    photoDates: [],
    draft: emptyDraft(),
    provider: null,
    unreadable: false,
    note: null,
    error: null,
  };
}

function withDelivery(s: AddFlowState, summary: SavedSummary): AddFlowState {
  return {
    ...s,
    step: "saved",
    saved: summary,
    error: null,
    delivery: [...s.delivery, { name: summary.name, added: summary.added, unit: summary.unit }],
  };
}

/**
 * Invariants enforced here, not in the UI: nothing reaches "saving" except
 * CONFIRM_SAVE from "review" with a savable draft (so an unresolved ambiguous
 * date can never be saved); a date-only read only touches the date fields.
 */
export function addFlowReducer(s: AddFlowState, e: AddFlowEvent): AddFlowState {
  switch (e.type) {
    case "SHUTTER":
      if (s.step !== "camera") return s;
      return { ...s, step: "reading", photo: s.cameraMode === "label" ? e.photo : s.photo, error: null, note: null };

    case "READ_OK": {
      if (s.step !== "reading" || s.cameraMode !== "label") return s;
      const { draft, rememberedFields } = draftFromRead(e.read, e.remembered);
      return {
        ...s,
        step: "review",
        read: e.read,
        baseline: draft,
        draft,
        rememberedFields,
        photoDates: photoDatesOf(e.read),
        provider: e.provider,
        unreadable: false,
        note: null,
      };
    }

    case "READ_UNREADABLE":
      if (s.step !== "reading" || s.cameraMode !== "label") return s;
      return {
        ...s,
        step: "review",
        read: null,
        baseline: null,
        draft: emptyDraft(),
        rememberedFields: [],
        photoDates: [],
        provider: e.provider,
        unreadable: true,
        note: null,
      };

    case "READ_FAILED":
      if (s.step !== "reading") return s;
      if (s.cameraMode === "date") return { ...s, step: "review", cameraMode: "label", error: e.message };
      return { ...s, step: "camera", photo: null, error: e.message };

    case "DATE_READ": {
      if (s.step !== "reading" || s.cameraMode !== "date") return s;
      if (!e.read) return { ...s, step: "review", cameraMode: "label", note: STILL_NO_DATE };
      const { draft, found } = applyDateOnlyRead(s.draft, e.read);
      return {
        ...s,
        step: "review",
        cameraMode: "label",
        draft,
        photoDates: found ? [...s.photoDates, ...photoDatesOf(e.read)] : s.photoDates,
        note: found ? null : STILL_NO_DATE,
      };
    }

    case "EDIT":
      if (s.step !== "review") return s;
      return { ...s, draft: applyEdit(s.draft, e.patch), error: null };

    case "CHOOSE_DATE":
      if (s.step !== "review") return s;
      return { ...s, draft: chooseDate(s.draft, e.iso) };

    case "KEEP_UNKNOWN":
      if (s.step !== "review") return s;
      return { ...s, draft: keepUnknown(s.draft) };

    case "PHOTOGRAPH_DATE":
      if (s.step !== "review") return s;
      return { ...s, step: "camera", cameraMode: "date", error: null, note: null };

    case "CANCEL_DATE_PHOTO":
      if (s.step !== "camera" || s.cameraMode !== "date") return s;
      return { ...s, step: "review", cameraMode: "label" };

    case "RETAKE":
      if (s.step !== "review" && !(s.step === "camera" && s.cameraMode === "date")) return s;
      return { ...freshItem(s), step: "camera" };

    case "CONFIRM_SAVE":
      if (s.step !== "review" || !isSavable(s.draft)) return s;
      return { ...s, step: "saving", error: null };

    case "SAVE_OK":
      if (s.step !== "saving") return s;
      return withDelivery(s, e.summary);

    case "SAVE_FAILED":
      if (s.step !== "saving") return s;
      return { ...s, step: "review", error: e.message };

    case "TYPE_INSTEAD":
      if (s.step !== "camera" && s.step !== "review") return s;
      return { ...freshItem(s), step: "typing" };

    case "BACK_TO_CAMERA":
      if (s.step !== "typing") return s;
      return { ...freshItem(s), step: "camera" };

    case "TYPED_SAVED":
      if (s.step !== "typing") return s;
      return withDelivery(s, e.summary);

    case "ADD_ANOTHER":
      if (s.step !== "saved") return s;
      return { ...initialAddFlow(e.idempotencyKey), delivery: s.delivery };

    default:
      return s;
  }
}
