import { test as setup, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const AUTH_DIR = path.join(process.cwd(), "tests", ".auth");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const RUN_ID = Date.now();

/**
 * Provisions the two accounts every other spec depends on, entirely through
 * the app's real /signup flow — no service-role key is used anywhere in
 * this test suite. This requires "Confirm email" to be OFF for this
 * project (see ARCHITECTURE.md §3.2): signUp() must return an active
 * session immediately, or this fails with a timeout waiting for /dashboard.
 */
async function provision(page: Page, name: "userA" | "userB") {
  const email = `g.zabulis2009+habitly-${name}-${RUN_ID}@gmail.com`;
  const password = `TestPass!${RUN_ID}${name}`;

  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /create account/i }).click();

  await expect(
    page,
    'Signup did not reach /dashboard. If this times out, check that Supabase → Authentication → ' +
      'Providers → Email → "Confirm email" is OFF for this project.',
  ).toHaveURL(/\/dashboard$/, { timeout: 15_000 });

  await page.context().storageState({ path: path.join(AUTH_DIR, `${name}.state.json`) });

  // Independently obtain a bearer token via the password grant, for the
  // direct-PostgREST tests — not reused from the browser session cookie.
  const tokenResponse = await page.request.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      data: { email, password },
    },
  );
  expect(tokenResponse.ok(), `Password grant failed for ${name}`).toBeTruthy();
  const tokenBody = await tokenResponse.json();

  fs.writeFileSync(
    path.join(AUTH_DIR, `${name}.account.json`),
    JSON.stringify(
      { email, password, id: tokenBody.user.id, token: tokenBody.access_token },
      null,
      2,
    ),
  );
}

setup("provision User A and User B", async ({ browser }) => {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const contextA = await browser.newContext();
  await provision(await contextA.newPage(), "userA");
  await contextA.close();

  const contextB = await browser.newContext();
  await provision(await contextB.newPage(), "userB");
  await contextB.close();
});
