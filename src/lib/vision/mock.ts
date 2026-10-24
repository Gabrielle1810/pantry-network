// Deterministic mock provider (R6.12). Used by all tests and as the no-key
// fallback so the app runs end to end without any API key (R6.4). Never calls
// the network. Fixtures cover the cases the pipeline must handle.
import type { LabelRead } from "./schema";
import { UnreadableError, type VisionProvider } from "./provider";

function fixture(overrides: Partial<LabelRead>): LabelRead {
  return {
    name: null,
    brand: null,
    size_text: null,
    category: "Uncategorized",
    is_food: true,
    doesnt_expire: false,
    perishable: false,
    date_raw: null,
    date_type: "none",
    expires_on: null,
    date_precision: null,
    date_ambiguous: false,
    date_candidates: [],
    quantity_visible: null,
    name_confidence: 0.9,
    date_confidence: 0.0,
    notes: null,
    ...overrides,
  };
}

/** Named fixtures, keyed so tests and the UI can request a specific scenario. */
export const MOCK_FIXTURES: Record<string, LabelRead> = {
  readable_can: fixture({
    name: "Black beans, canned, 15 oz",
    brand: "Campus Brand",
    size_text: "15 oz",
    category: "Canned Goods",
    date_raw: "BEST BY 06/2027",
    date_type: "best_by",
    expires_on: "2027-06-30",
    date_precision: "month",
    name_confidence: 0.92,
    date_confidence: 0.8,
  }),
  unreadable: fixture({
    name: null,
    name_confidence: 0.1,
    notes: "no_product",
  }),
  ambiguous_date: fixture({
    name: "Tomato sauce, canned, 14 oz",
    category: "Sauces/Pastes/Spread",
    date_raw: "06/12/27",
    date_type: "unlabeled",
    expires_on: null,
    date_ambiguous: true,
    date_candidates: ["2027-06-12", "2027-12-06"],
    date_confidence: 0.5,
  }),
  non_food: fixture({
    name: "Bar soap",
    category: "Hygiene Items",
    is_food: false,
    doesnt_expire: true,
    name_confidence: 0.88,
  }),
  month_only: fixture({
    name: "Pasta, spaghetti, 16 oz",
    category: "Dried Pasta/Grains",
    date_raw: "BB 03/2028",
    date_type: "best_by",
    expires_on: "2028-03-31",
    date_precision: "month",
    date_confidence: 0.7,
  }),
};

const ORDER = Object.keys(MOCK_FIXTURES);

export class MockVisionProvider implements VisionProvider {
  readonly name = "mock" as const;
  private calls = 0;

  constructor(private readonly fixedKey?: keyof typeof MOCK_FIXTURES) {}

  async readLabel(_imageJpegBase64: string): Promise<LabelRead> {
    void _imageJpegBase64;
    const key = this.fixedKey ?? ORDER[this.calls % ORDER.length];
    this.calls += 1;
    const read = MOCK_FIXTURES[key as string];
    if (!read) throw new UnreadableError("mock: unknown fixture");
    // Return a copy so callers can't mutate the shared fixture.
    return { ...read, date_candidates: [...read.date_candidates] };
  }
}
