/**
 * Builds the per-request Content-Security-Policy. script-src is nonce +
 * 'strict-dynamic' with no 'unsafe-inline' / 'unsafe-eval' in production —
 * see ARCHITECTURE.md §9 for the full discussion of each directive.
 */
export function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV !== "production";

  let supabaseOrigin = "";
  let supabaseWsOrigin = "";
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (rawUrl) {
    try {
      const { host } = new URL(rawUrl);
      supabaseOrigin = `https://${host}`;
      supabaseWsOrigin = `wss://${host}`;
    } catch {
      // Leave both empty; connect-src just omits the Supabase origin.
    }
  }

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", supabaseOrigin, supabaseWsOrigin].filter(Boolean),
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
  };

  const policy = Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(" ")}`)
    .join("; ");

  return isDev ? policy : `${policy}; upgrade-insecure-requests`;
}
