/**
 * Validates a client-supplied redirect target (the `next` query param) so
 * it can only ever point at an internal, same-origin path. Blocks open
 * redirects such as `?next=https://evil.com`, `?next=//evil.com`, and
 * `?next=/\evil.com`. See ARCHITECTURE.md §5, vulnerability #12.
 */
const SAFE_PATH_RE = /^\/(?!\/)[A-Za-z0-9\-._~!$&'()*+,;=:@/%?#[\]]*$/;

export function safeRedirect(raw: string | null | undefined, fallback = "/dashboard"): string {
  if (!raw) return fallback;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return fallback;
  }

  if (decoded.includes("\\")) return fallback;
  if (/[\r\n\t\0]/.test(decoded)) return fallback;
  if (!SAFE_PATH_RE.test(decoded)) return fallback;

  return decoded;
}
