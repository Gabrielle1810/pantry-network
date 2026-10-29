// Repository selector (R13.5/R13.6). Supabase when BOTH SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are set; otherwise the in-memory repository seeded
// with the two live campuses (local dev + tests). Switching needs no code change.
import { getMemoryAppRepository } from "./app-memory";
import { SupabaseAppRepository } from "./app-supabase";
import type { AppRepository } from "./app-types";

export type {
  AppRepository,
  InventoryRow,
  IntakeInput,
  IntakeResult,
  CampusInfo,
  CommunitySnapshot,
  CompletePickupResult,
  CountCheckView,
  CreateOfferInput,
  CreateRequestInput,
  RecordOutInput,
  RecordOutResult,
  StudentTakeoutInput,
  StudentTakeoutResult,
} from "./app-types";
export { MemoryAppRepository, getMemoryAppRepository, resetMemoryAppRepository } from "./app-memory";
export { SupabaseAppRepository } from "./app-supabase";

/** `todayIso` anchors the memory repo's relative seed dates (PB.6). */
export function getAppRepository(todayIso: string): AppRepository {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) return new SupabaseAppRepository(url, key);
  return getMemoryAppRepository(todayIso);
}
