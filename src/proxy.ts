// Request guard (Next.js 16 `proxy`, formerly `middleware`; Node.js runtime).
//
// 1. Staff session (R2.6). Protected pages redirect to /pin when the session
//    cookie is missing or invalid; protected APIs return 401. /pin and
//    /api/session are always reachable.
// 2. Student links. /s/<token> is public, but a wrong token — including a plain
//    campus id like /s/harbor — must be a real HTTP 404 that shows nothing. The
//    page itself streams (status fixed at 200 once it starts), so the check runs
//    here, before rendering, as the Next.js docs recommend. The page keeps its
//    own check as a backstop.
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getAppRepository } from "@/lib/db";
import { todayInTz } from "@/lib/dates";
import { studentTokenStatus } from "@/lib/student/page-data";

// Manager APIs. /api/session and the public /api/student/* are not listed.
const PROTECTED_API_PREFIXES = [
  "/api/vision",
  "/api/items",
  "/api/inventory",
  "/api/campus",
  "/api/seed",
  "/api/takeout",
  "/api/community",
];

// Manager pages. The public student page (/s/[token]) is not listed.
const PROTECTED_PAGE_PREFIXES = [
  "/intake",
  "/inventory",
  "/add",
  "/takeout",
  "/community",
  "/settings",
  "/help",
  "/poster",
];

const matches = (prefixes: string[], pathname: string) =>
  prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

const NOT_FOUND_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Link not found · Pantry Network</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f5f2;color:#111714;font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:24px"><main><h1 style="font-size:24px;margin:0 0 8px">This link doesn't work</h1><p style="color:#5e6a63;margin:0">Please scan the QR poster at the pantry again.</p></main></body></html>`;

function studentNotFound() {
  return new NextResponse(NOT_FOUND_HTML, {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/s" || pathname.startsWith("/s/")) {
    const token = decodeURIComponent(pathname.slice(3).split("/")[0] ?? "");
    const status = await studentTokenStatus(getAppRepository(todayInTz()), token);
    // "unknown" = the lookup failed; let the page's own check decide.
    if (status === "invalid") return studentNotFound();
    return NextResponse.next();
  }

  const isApi = matches(PROTECTED_API_PREFIXES, pathname);
  if (!isApi && !matches(PROTECTED_PAGE_PREFIXES, pathname)) return NextResponse.next();

  if (await verifySession(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (isApi) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.redirect(new URL("/pin", request.url));
}

// Only run on the routes this guards (keeps it off static assets).
export const config = {
  matcher: [
    "/s/:path*",
    "/intake/:path*",
    "/inventory/:path*",
    "/add/:path*",
    "/takeout/:path*",
    "/community/:path*",
    "/settings/:path*",
    "/help/:path*",
    "/poster/:path*",
    "/api/takeout/:path*",
    "/api/community/:path*",
    "/api/vision/:path*",
    "/api/items/:path*",
    "/api/inventory/:path*",
    "/api/campus/:path*",
    "/api/seed/:path*",
  ],
};
