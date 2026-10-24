// POST /api/session  — check the PIN, set the signed session cookie (R2.3, R2.6a)
// DELETE /api/session — log out by clearing the cookie (R2.6a)
//
// Thin HTTP shell: all auth logic lives in src/lib/auth (R1.3). The route only
// reads the request, calls lib functions, and sets/clears the cookie.
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  checkPin,
  signSession,
} from "@/lib/auth";

const sessionRequestSchema = z.object({ pin: z.string() });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_pin" }, { status: 401 });
  }

  const parsed = sessionRequestSchema.safeParse(body);
  if (!parsed.success || !checkPin(parsed.data.pin)) {
    // R2.4: reject with 401 and do not set a cookie.
    return NextResponse.json({ ok: false, error: "invalid_pin" }, { status: 401 });
  }

  const token = await signSession();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  // Clear the cookie (R2.6a): same name/path, zero max-age.
  response.cookies.set(SESSION_COOKIE, "", {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: 0,
  });
  return response;
}
