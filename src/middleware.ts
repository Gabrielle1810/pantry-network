// Session guard (R2.6). Runs in the Edge runtime, so it uses the Web Crypto
// based verifySession from src/lib/auth (no Node 'crypto', no SDK).
//
// Protected pages (the intake flow) redirect to /pin when the session cookie
// is missing or invalid. Protected API routes return 401 instead, so a fetch
// gets a clean status rather than an HTML redirect. The /pin page and
// /api/session itself are always reachable (otherwise you could never log in).
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

// API prefixes that require a valid session (manager APIs). /api/session is
// excluded so login/logout is reachable; public student APIs (added later) are
// also excluded by not listing them here.
const PROTECTED_API_PREFIXES = ["/api/vision", "/api/items", "/api/inventory", "/api/campus"];

// Page prefixes that require a valid session.
const PROTECTED_PAGE_PREFIXES = ["/intake"];

function isProtectedApi(pathname: string): boolean {
  return PROTECTED_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isProtectedPage(pathname: string): boolean {
  return PROTECTED_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const needsAuth = isProtectedApi(pathname) || isProtectedPage(pathname);
  if (!needsAuth) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const valid = await verifySession(token);
  if (valid) return NextResponse.next();

  if (isProtectedApi(pathname)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Protected page without a session → redirect to the PIN gate (R2.6).
  const loginUrl = new URL("/pin", request.url);
  return NextResponse.redirect(loginUrl);
}

// Only run the middleware on the routes it actually guards. The matcher keeps
// it off static assets and unprotected pages for speed.
export const config = {
  matcher: [
    "/intake/:path*",
    "/api/vision/:path*",
    "/api/items/:path*",
    "/api/inventory/:path*",
    "/api/campus/:path*",
  ],
};
