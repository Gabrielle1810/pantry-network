// Supabase repository: AppService over a SupabaseStore. Server-only.
import { AppService } from "./service";
import { SupabaseStore } from "./store-supabase";

export class SupabaseAppRepository extends AppService {
  constructor(url: string, serviceRoleKey: string) {
    super(new SupabaseStore(url, serviceRoleKey));
  }
}
