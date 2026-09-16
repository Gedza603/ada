import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { buildCsp } from "@/lib/security/csp";

// Next.js 16 renamed the `middleware.ts` convention to `proxy.ts` (exported
// function `proxy`, nodejs runtime only). Behavior is unchanged from a
// classic Next middleware: it runs on every matched request below.
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = await updateSession(request, requestHeaders);

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("x-nonce", nonce);

  return response;
}

export const config = {
  matcher: [
    // Run on everything except Next's internal assets and common static
    // file extensions. Deliberately broad so a new protected route is
    // covered automatically instead of requiring a matcher update.
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
