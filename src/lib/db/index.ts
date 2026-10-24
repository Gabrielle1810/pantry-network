// Repository selector (UI13.5, R13.5/R13.6). Returns the Supabase repository
// when BOTH SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set; otherwise the
// in-memory repository (local dev + tests). No code change is needed to switch;
// it is driven purely by the presence of the two env vars.
import { MemoryRepository } from "./memory";
import { SupabaseRepository } from "./supabase";
import type { ItemRepository } from "./types";

export type { ItemRepository, SaveBatchInput, RepositoryName } from "./types";
export { MemoryRepository } from "./memory";
export { SupabaseRepository } from "./supabase";

// A single memory instance per process so seeded data + saves persist across
// requests within the same serverless instance (still resets per instance).
let memorySingleton: MemoryRepository | null = null;

export function getRepository(): ItemRepository {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    return new SupabaseRepository(url, key);
  }
  if (!memorySingleton) memorySingleton = new MemoryRepository();
  return memorySingleton;
}
