import { NextResponse, type NextRequest } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const EXTENSION_ORIGIN = /^(chrome|moz)-extension:\/\//;

/**
 * CSRF guard for /api/*: a state-changing request that carries an `Origin`
 * must come from the app's own host. Bearer-token requests and the
 * extension's origins are exempt; a request with no `Origin` (non-browser
 * clients, same-origin GET-like navigations) passes, since browsers always
 * send `Origin` on cross-site POST/PUT/PATCH/DELETE.
 */
export function proxy(req: NextRequest) {
  if (SAFE_METHODS.has(req.method)) return NextResponse.next();
  const origin = req.headers.get("origin");
  if (!origin) return NextResponse.next();
  if (req.headers.get("authorization")?.startsWith("Bearer ")) {
    return NextResponse.next();
  }
  if (EXTENSION_ORIGIN.test(origin)) return NextResponse.next();
  try {
    if (new URL(origin).host === req.headers.get("host")) {
      return NextResponse.next();
    }
  } catch {
    // Unparseable Origin (e.g. "null"): fall through to reject.
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export const config = { matcher: "/api/:path*" };
