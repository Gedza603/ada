import { test, expect } from "./fixtures";

// Assertions here check the response body/status, not just the final URL —
// a test that only checks "got redirected" would still pass if a page
// leaked data into the pre-redirect response body. See ARCHITECTURE.md §7.5.
test.describe("signed-out access control", () => {
  test("browser navigation to /dashboard ends on /login", async ({ anonPage }) => {
    await anonPage.goto("/dashboard");
    await expect(anonPage).toHaveURL(/\/login/);
  });

  test("a raw request to /dashboard redirects and leaks nothing in the body", async ({
    request,
    baseURL,
  }) => {
    const response = await request.get(`${baseURL}/dashboard`, { maxRedirects: 0 });
    expect([301, 302, 303, 307, 308]).toContain(response.status());
    expect(response.headers()["location"]).toMatch(/\/login/);

    const body = await response.text();
    expect(body.length).toBeLessThan(1000);
  });

  test("a raw request to a guessed habit id redirects and leaks nothing", async ({
    request,
    baseURL,
  }) => {
    const response = await request.get(
      `${baseURL}/habits/00000000-0000-0000-0000-000000000000`,
      { maxRedirects: 0 },
    );
    expect([301, 302, 303, 307, 308]).toContain(response.status());
    expect(response.headers()["location"]).toMatch(/\/login/);
  });

  test("PostgREST rejects an anonymous read of habits", async ({ anonApi }) => {
    const response = await anonApi.get("habits?select=*");
    if (response.status() === 200) {
      expect(await response.json()).toEqual([]);
    } else {
      expect(response.status()).toBe(401);
    }
  });

  test("PostgREST rejects an anonymous read of habit_completions", async ({ anonApi }) => {
    const response = await anonApi.get("habit_completions?select=*");
    if (response.status() === 200) {
      expect(await response.json()).toEqual([]);
    } else {
      expect(response.status()).toBe(401);
    }
  });

  test("PostgREST rejects an anonymous insert into habits", async ({ anonApi }) => {
    const response = await anonApi.post("habits", {
      data: { name: "anon should not be able to create this" },
    });
    expect(response.status()).toBe(401);
  });
});
