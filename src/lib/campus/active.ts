// Active-campus cookie helper (PC.4). The manager's selected campus is stored in
// a plain cookie (not a secret) and read server-side to scope manager data. The
// student page does NOT use this — it is scoped by its QR token (PI.1).
import { resolveActiveCampus } from "./index";

export const ACTIVE_CAMPUS_COOKIE = "pn_campus";

/** Resolve the active campus id from a cookie value, defaulting to home. */
export function activeCampusFrom(cookieValue: string | undefined | null): string {
  return resolveActiveCampus(cookieValue);
}
