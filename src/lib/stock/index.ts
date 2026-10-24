// Derived stock (PB.1, PB.2). Stock is NEVER a stored mutable number: a
// product's on-shelf quantity is the sum of its intake batches plus the sum of
// its ledger deltas (take-outs/removals are negative; community_in is positive),
// floored at 0. Consumption is attributed oldest-batch-first (FIFO). All pure.

export interface Batch {
  id: string;
  /** Normalized product identity (campus-scoped). */
  productKey: string;
  quantity: number;
  /** ISO date the batch arrived. FIFO orders by this, then createdAt. */
  receivedOn: string;
  createdAt: string;
  expiresOn: string | null;
}

export type LedgerKind =
  | "takeout"
  | "removal"
  | "fix"
  | "recount"
  | "community_out"
  | "community_in";

export interface Ledger {
  id: string;
  productKey: string;
  /** Signed change to on-shelf. Negative leaves the shelf. */
  delta: number;
  kind: LedgerKind;
  at: string;
  createdAt: string;
}

/** Total units added by intake batches for a product. */
export function batchTotal(batches: Batch[]): number {
  return batches.reduce((sum, b) => sum + b.quantity, 0);
}

/**
 * Derive on-shelf quantity = sum(batches) + sum(ledger deltas), floored at 0
 * (PB.1). Callers pass only the rows for a single productKey (or mixed rows;
 * both are summed by key-agnostic totals — keep inputs scoped per product).
 */
export function deriveOnShelf(batches: Batch[], ledger: Ledger[]): number {
  const added = batchTotal(batches);
  const net = ledger.reduce((sum, l) => sum + l.delta, 0);
  return Math.max(0, added + net);
}

/** Quantity of the most recent intake batch — the "last restock amount" (PB.4). */
export function lastRestockAmount(batches: Batch[]): number {
  if (batches.length === 0) return 0;
  const sorted = sortFIFO(batches);
  return sorted[sorted.length - 1].quantity;
}

/** The soonest (earliest) non-null expiry across a product's batches, or null. */
export function soonestExpiry(batches: Batch[]): string | null {
  const dates = batches.map((b) => b.expiresOn).filter((d): d is string => !!d);
  if (dates.length === 0) return null;
  return dates.sort()[0];
}

/** Oldest first: by receivedOn, then createdAt as a tiebreak. */
export function sortFIFO(batches: Batch[]): Batch[] {
  return [...batches].sort((a, b) => {
    if (a.receivedOn !== b.receivedOn) return a.receivedOn < b.receivedOn ? -1 : 1;
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  });
}

export interface BatchConsumption {
  batchId: string;
  consumed: number;
}

/**
 * Attribute a consumed quantity to batches oldest-first (PB.2). Returns how much
 * came from each batch; the sum of `consumed` is min(qty, available on shelf by
 * batch totals). Does not mutate inputs. Used so removals/take-outs can respect
 * batch expiry order; the ledger still carries the single net delta.
 */
export function consumeFIFO(batches: Batch[], qty: number): BatchConsumption[] {
  const out: BatchConsumption[] = [];
  let remaining = Math.max(0, qty);
  for (const b of sortFIFO(batches)) {
    if (remaining <= 0) break;
    const take = Math.min(b.quantity, remaining);
    if (take > 0) {
      out.push({ batchId: b.id, consumed: take });
      remaining -= take;
    }
  }
  return out;
}
