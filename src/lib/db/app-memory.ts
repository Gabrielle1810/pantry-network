// In-memory repository: AppService over a MemoryStore seeded with the two live
// campuses. Local dev and tests. Per-process; resets per serverless instance.
import { AppService } from "./service";
import { MemoryStore } from "./store-memory";

export class MemoryAppRepository extends AppService {
  constructor(todayIso: string, nowMs: number = Date.now()) {
    super(new MemoryStore(todayIso, nowMs));
  }
}

// Kept on globalThis so pages, API routes and hot reloads in `next dev` all see
// the same data (each can otherwise load its own copy of this module).
interface Holder {
  repo: MemoryAppRepository | null;
  day: string | null;
}
const holder = ((globalThis as unknown as { __pantryMemory?: Holder }).__pantryMemory ??= { repo: null, day: null });

/** Process-level singleton, re-seeded if the day rolls over (relative dates). */
export function getMemoryAppRepository(todayIso: string): MemoryAppRepository {
  if (!holder.repo || holder.day !== todayIso) {
    holder.repo = new MemoryAppRepository(todayIso);
    holder.day = todayIso;
  }
  return holder.repo;
}

/** Drop the in-memory data so the next request re-seeds it (Settings > Reset). */
export function resetMemoryAppRepository(): void {
  holder.repo = null;
  holder.day = null;
}
