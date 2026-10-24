import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { MOCK_FIXTURES } from "@/lib/vision/mock";
import type { LabelRead } from "@/lib/vision/schema";
import {
  addFlowReducer,
  applyDateOnlyRead,
  applyEdit,
  chooseDate,
  computeEditedFields,
  draftFromRead,
  emptyDraft,
  initialAddFlow,
  isSavable,
  saveButtonLabel,
  savedLine,
  toSaveBody,
  type AddFlowEvent,
  type SavedSummary,
} from "./index";

const can = MOCK_FIXTURES.readable_can;

describe("draftFromRead", () => {
  it("prefills from the read; unit from the container", () => {
    const { draft, rememberedFields } = draftFromRead(can);
    expect(draft.name).toBe(can.name);
    expect(draft.category).toBe("Canned Goods");
    expect(draft.unit).toBe("can");
    expect(draft.quantity).toBe(1);
    expect(draft.expiresOn).toBe(can.expires_on);
    expect(rememberedFields).toEqual([]);
  });

  it("UI9.2 applies a remembered fix to name/brand/category but never to dates", () => {
    const fix = { name: "Black beans", brand: "Goya", category: "Canned Goods" };
    const { draft, rememberedFields } = draftFromRead(can, fix);
    expect(draft.name).toBe("Black beans");
    expect(draft.brand).toBe("Goya");
    expect(rememberedFields).toEqual(["name", "brand"]); // category already matched
    expect(draft.expiresOn).toBe(can.expires_on);
    expect(draft.datePrecision).toBe(can.date_precision);
  });

  it("UI9.4 a remembered fix alone is not an edit", () => {
    const fix = { name: "Black beans", brand: "Goya", category: null };
    const { draft } = draftFromRead(can, fix);
    expect(computeEditedFields(draft, draft, [])).toEqual([]);
    expect(computeEditedFields(draft, applyEdit(draft, { name: "Pinto beans" }), [])).toEqual(["name"]);
  });
});

describe("ambiguous dates", () => {
  const ambiguous = MOCK_FIXTURES.ambiguous_date;

  it("R8.15 is not savable until a reading is chosen", () => {
    const { draft } = draftFromRead(ambiguous);
    expect(draft.expiresOn).toBeNull();
    expect(draft.dateAmbiguous).toBe(true);
    expect(isSavable(draft)).toBe(false);
    const chosen = chooseDate(draft, ambiguous.date_candidates[0]);
    expect(isSavable(chosen)).toBe(true);
    expect(chosen.expiresOn).toBe("2027-06-12");
  });

  it("choosing one of the photo's own readings is a photo date, not an edit", () => {
    const { draft: baseline } = draftFromRead(ambiguous);
    const chosen = chooseDate(baseline, ambiguous.date_candidates[1]);
    const body = toSaveBody({ draft: chosen, read: ambiguous, baseline, photoDates: ambiguous.date_candidates, idempotencyKey: "k" });
    expect(body.batch.date_source).toBe("photo");
    expect(body.editedFields).not.toContain("expires_on");
  });
});

describe("applyDateOnlyRead (Photograph the date instead)", () => {
  it("fills only the date fields and keeps name, brand, category and quantity", () => {
    const start = applyEdit(emptyDraft(), { name: "Tomato paste", brand: "Hunt's", category: "Sauces/Pastes/Spread", quantity: 4 });
    const dateRead: LabelRead = { ...MOCK_FIXTURES.unreadable, name: "IGNORED", expires_on: "2026-11-02", date_type: "best_by", date_precision: "day" };
    const { draft, found } = applyDateOnlyRead(start, dateRead);
    expect(found).toBe(true);
    expect(draft.expiresOn).toBe("2026-11-02");
    expect(draft.name).toBe("Tomato paste");
    expect(draft.brand).toBe("Hunt's");
    expect(draft.category).toBe("Sauces/Pastes/Spread");
    expect(draft.quantity).toBe(4);
  });

  it("reports nothing found when the close-up has no date", () => {
    const start = applyEdit(emptyDraft(), { name: "Rice" });
    expect(applyDateOnlyRead(start, MOCK_FIXTURES.unreadable)).toEqual({ draft: start, found: false });
  });
});

describe("saving", () => {
  it("UI16.3 'Save without a date' stores expires_on = null", () => {
    const draft = applyEdit(emptyDraft(), { name: "Rice", quantity: 3, unit: "bag" });
    expect(saveButtonLabel(draft)).toBe("Save without a date");
    const body = toSaveBody({ draft, read: null, baseline: null, photoDates: [], idempotencyKey: "k" });
    expect(body.batch.expires_on).toBeNull();
    expect(body.batch.date_source).toBeNull();
  });

  it("doesn't expire forces a null date and labels by unit", () => {
    const draft = applyEdit(applyEdit(emptyDraft(), { name: "Soap", unit: "bar", quantity: 2, expiresOn: "2027-01-01" }), { noExpire: true });
    expect(saveButtonLabel(draft)).toBe("Save 2 bars");
    expect(toSaveBody({ draft, read: null, baseline: null, photoDates: [], idempotencyKey: "k" }).batch.expires_on).toBeNull();
  });

  it("a typed date is date_source 'typed'; clamps quantity to 1..999", () => {
    const draft = applyEdit(emptyDraft(), { name: "Corn", unit: "can", quantity: 5000, expiresOn: "2027-02-01" });
    expect(draft.quantity).toBe(999);
    const body = toSaveBody({ draft, read: null, baseline: null, photoDates: [], idempotencyKey: "k" });
    expect(body.batch.date_source).toBe("typed");
    expect(body.batch.date_type).toBe("best_by");
  });

  it("savedLine shows the totals math, or just the amount the first time", () => {
    const s: SavedSummary = { name: "Tomato paste", unit: "can", category: "Sauces/Pastes/Spread", added: 4, before: 2, after: 6, firstBatch: false };
    expect(savedLine(s)).toBe("Tomato paste: 2 on the shelf + 4 added = 6");
    expect(savedLine({ ...s, before: 0, after: 4, firstBatch: true })).toBe("Tomato paste: 4 added");
  });
});

describe("P8 add-flow reducer invariants", () => {
  const summary: SavedSummary = { name: "X", unit: "can", category: "Canned Goods", added: 1, before: 0, after: 1, firstBatch: true };
  const fixtures = Object.values(MOCK_FIXTURES);
  const eventArb: fc.Arbitrary<AddFlowEvent> = fc.oneof(
    fc.constant<AddFlowEvent>({ type: "SHUTTER", photo: "data:x" }),
    fc.constantFrom(...fixtures).map<AddFlowEvent>((read) => ({ type: "READ_OK", read, remembered: null, provider: "mock" })),
    fc.constant<AddFlowEvent>({ type: "READ_UNREADABLE", provider: "mock" }),
    fc.constant<AddFlowEvent>({ type: "READ_FAILED", message: "x" }),
    fc.option(fc.constantFrom(...fixtures), { nil: null }).map<AddFlowEvent>((read) => ({ type: "DATE_READ", read })),
    fc.integer({ min: -10, max: 2000 }).map<AddFlowEvent>((quantity) => ({ type: "EDIT", patch: { quantity } })),
    fc.string({ maxLength: 4 }).map<AddFlowEvent>((name) => ({ type: "EDIT", patch: { name } })),
    fc.boolean().map<AddFlowEvent>((noExpire) => ({ type: "EDIT", patch: { noExpire } })),
    fc.constantFrom(null, "2026-11-01").map<AddFlowEvent>((expiresOn) => ({ type: "EDIT", patch: { expiresOn } })),
    fc.constant<AddFlowEvent>({ type: "CHOOSE_DATE", iso: "2027-06-12" }),
    fc.constant<AddFlowEvent>({ type: "KEEP_UNKNOWN" }),
    fc.constant<AddFlowEvent>({ type: "PHOTOGRAPH_DATE" }),
    fc.constant<AddFlowEvent>({ type: "CANCEL_DATE_PHOTO" }),
    fc.constant<AddFlowEvent>({ type: "RETAKE" }),
    fc.constant<AddFlowEvent>({ type: "CONFIRM_SAVE" }),
    fc.constant<AddFlowEvent>({ type: "SAVE_OK", summary }),
    fc.constant<AddFlowEvent>({ type: "SAVE_FAILED", message: "x" }),
    fc.constant<AddFlowEvent>({ type: "TYPE_INSTEAD" }),
    fc.constant<AddFlowEvent>({ type: "BACK_TO_CAMERA" }),
    fc.constant<AddFlowEvent>({ type: "TYPED_SAVED", summary }),
    fc.constant<AddFlowEvent>({ type: "ADD_ANOTHER", idempotencyKey: "k2" }),
  );

  it("never reaches 'saving' without CONFIRM_SAVE from a savable review; dates stay consistent", () => {
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 40 }), (events) => {
        let s = initialAddFlow("k");
        for (const e of events) {
          const next = addFlowReducer(s, e);
          if (next.step === "saving" && s.step !== "saving") {
            expect(e.type).toBe("CONFIRM_SAVE");
            expect(s.step).toBe("review");
            expect(isSavable(s.draft)).toBe(true);
            expect(next.draft.dateAmbiguous).toBe(false);
          }
          expect(next.draft.quantity).toBeGreaterThanOrEqual(1);
          expect(next.draft.quantity).toBeLessThanOrEqual(999);
          if (next.draft.noExpire) expect(next.draft.expiresOn).toBeNull();
          s = next;
        }
      }),
    );
  });

  it("a date-only read keeps the item already on screen", () => {
    let s = initialAddFlow("k");
    s = addFlowReducer(s, { type: "SHUTTER", photo: "data:label" });
    s = addFlowReducer(s, { type: "READ_OK", read: { ...can, expires_on: null, date_type: "none" }, remembered: null, provider: "mock" });
    s = addFlowReducer(s, { type: "EDIT", patch: { quantity: 4 } });
    s = addFlowReducer(s, { type: "PHOTOGRAPH_DATE" });
    expect(s.cameraMode).toBe("date");
    s = addFlowReducer(s, { type: "SHUTTER", photo: "data:date" });
    expect(s.photo).toBe("data:label"); // the label photo stays on the review
    s = addFlowReducer(s, { type: "DATE_READ", read: MOCK_FIXTURES.month_only });
    expect(s.step).toBe("review");
    expect(s.draft.name).toBe(can.name);
    expect(s.draft.quantity).toBe(4);
    expect(s.draft.expiresOn).toBe(MOCK_FIXTURES.month_only.expires_on);
  });
});
