// Headless auth for the staff PIN gate (R2). No React, no Next imports here so
// it stays unit-testable in Node and usable from both the Edge middleware and
// Node route handlers. Uses Web Crypto (crypto.subtle), available in Node 18+
// and the Edge runtime, so the same code signs/verifies in both places.
//
// The session token is a stateless, signed HMAC envelope (design.md §2.1):
//   base64url(payloadJson) + "." + base64url(HMAC-SHA256(payloadJson, SECRET))
// The signing key is SESSION_SECRET and is NEVER derived from STAFF_PIN
// (R2.3a: the PIN may be shared publicly with testers).

export const SESSION_COOKIE = "pn_session";

/** 12 hours, in seconds (R2.3). */
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

/** Cookie options shared by the route that sets the session (design.md §2.1). */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
};

export interface SessionPayload {
  /** Unix epoch seconds at which the token expires. */
  exp: number;
}

// --- base64url helpers (no Buffer, so this runs in the Edge runtime too) ---

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function requireSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set; cannot sign or verify sessions.");
  }
  return secret;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return new Uint8Array(sig);
}

/**
 * Constant-time comparison of two byte arrays. Returns false (never short
 * circuits on length) so a timing observer learns nothing about where a
 * mismatch occurred (R2.5).
 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  // XOR-accumulate over the longer length; a length mismatch forces a 1 bit.
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Constant-time string comparison built on {@link timingSafeEqual}. Used for
 * the PIN check (R2.5).
 */
export function constantTimeStringEqual(a: string, b: string): boolean {
  return timingSafeEqual(encoder.encode(a), encoder.encode(b));
}

/**
 * Compare a submitted PIN against STAFF_PIN in constant time (R2.2, R2.5).
 * Returns false when STAFF_PIN is unset so a misconfigured server never grants
 * access.
 */
export function checkPin(submitted: string): boolean {
  const expected = process.env.STAFF_PIN;
  if (!expected) return false;
  return constantTimeStringEqual(submitted, expected);
}

/**
 * Produce a signed session token valid for 12 hours by default (R2.3). The
 * expiry is embedded in the payload and re-checked on verify, so the token is
 * stateless.
 */
export async function signSession(
  nowSeconds: number = Math.floor(Date.now() / 1000),
  ttlSeconds: number = SESSION_MAX_AGE_SECONDS,
): Promise<string> {
  const secret = requireSecret();
  const payload: SessionPayload = { exp: nowSeconds + ttlSeconds };
  const payloadJson = JSON.stringify(payload);
  const encodedPayload = toBase64Url(encoder.encode(payloadJson));
  const signature = await hmac(secret, encodedPayload);
  return `${encodedPayload}.${toBase64Url(signature)}`;
}

/**
 * Verify a session token: the signature must match (constant-time) and the
 * embedded expiry must be in the future (R2.3, R2.5). Any malformed, tampered,
 * or expired token returns false and never throws.
 */
export async function verifySession(
  token: string | undefined | null,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!token) return false;
  const secret = process.env.SESSION_SECRET;
  if (!secret) return false;

  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return false;

  const encodedPayload = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);

  let expected: Uint8Array;
  let provided: Uint8Array;
  try {
    expected = await hmac(secret, encodedPayload);
    provided = fromBase64Url(providedSig);
  } catch {
    return false;
  }

  if (!timingSafeEqual(expected, provided)) return false;

  // Signature is valid; now the payload can be trusted enough to read exp.
  try {
    const payload = JSON.parse(decoder.decode(fromBase64Url(encodedPayload))) as SessionPayload;
    if (typeof payload.exp !== "number") return false;
    return payload.exp > nowSeconds;
  } catch {
    return false;
  }
}
