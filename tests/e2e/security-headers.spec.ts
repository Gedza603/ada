import { test, expect } from "@playwright/test";

function directive(csp: string, name: string): string {
  return (
    csp
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${name} `)) ?? ""
  );
}

test.describe("security headers", () => {
  for (const path of ["/", "/login", "/signup", "/dashboard"]) {
    test(`${path} sets the required security headers`, async ({ request, baseURL }) => {
      const response = await request.get(`${baseURL}${path}`, { maxRedirects: 0 });
      const headers = response.headers();

      expect(headers["x-frame-options"]).toBe("DENY");
      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["referrer-policy"]).toBeTruthy();
      expect(headers["permissions-policy"]).toBeTruthy();

      const csp = headers["content-security-policy"];
      expect(csp).toBeTruthy();

      const scriptSrc = directive(csp, "script-src");
      expect(scriptSrc).toContain("'nonce-");
      expect(scriptSrc).toContain("'strict-dynamic'");
      expect(scriptSrc).not.toContain("'unsafe-inline'");

      expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
      expect(directive(csp, "object-src")).toBe("object-src 'none'");

      const connectSrc = directive(csp, "connect-src");
      expect(connectSrc).toContain("'self'");
      expect(connectSrc).toMatch(/https:\/\/[a-z0-9]+\.supabase\.co/);
    });
  }
});
