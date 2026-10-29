// Loads what the public student page may show, from a QR token. Returns null for
// anything that isn't a real campus token — including a plain campus id like
// "harbor" — so the page can render a real 404 and never show the list.
import type { AppRepository } from "@/lib/db/app-types";
import { studentAvailable } from "./index";

/** Seeded tokens are 24 random bytes in base64url (32 chars). Campus ids never match. */
export const STUDENT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,128}$/;

export function isWellFormedToken(token: string | null | undefined): token is string {
  return typeof token === "string" && STUDENT_TOKEN_PATTERN.test(token);
}

export interface StudentPageItem {
  productId: string;
  name: string;
  unit: string;
  category: string;
  /** On the shelf minus anything set aside for Community. */
  available: number;
  useSoon: boolean;
}

export interface StudentPageData {
  campusName: string;
  items: StudentPageItem[];
}

/**
 * Proxy-side check for /s/<token>, run before the page renders so a bad link
 * gets a real HTTP 404. "unknown" means the lookup itself failed; the proxy
 * then lets the request through and the page's own check still applies.
 */
export async function studentTokenStatus(
  repo: Pick<AppRepository, "getCampusByToken">,
  token: string,
): Promise<"valid" | "invalid" | "unknown"> {
  if (!isWellFormedToken(token)) return "invalid";
  try {
    return (await repo.getCampusByToken(token)) ? "valid" : "invalid";
  } catch {
    return "unknown";
  }
}

export async function loadStudentPage(
  repo: Pick<AppRepository, "getCampusByToken" | "listStudentInventory">,
  token: string,
  todayIso: string,
): Promise<StudentPageData | null> {
  if (!isWellFormedToken(token)) return null;
  const campus = await repo.getCampusByToken(token);
  if (!campus) return null;
  const rows = await repo.listStudentInventory(campus.id, todayIso);
  return {
    campusName: campus.name,
    items: rows.map((r) => ({
      productId: r.productId,
      name: r.name,
      unit: r.unit,
      category: r.category,
      available: studentAvailable(r),
      useSoon: r.status === "soon",
    })),
  };
}
