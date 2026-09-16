import { test as base, request, type APIRequestContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

export type Account = { email: string; password: string; id: string; token: string };

const AUTH_DIR = path.join(process.cwd(), "tests", ".auth");

function readAccount(name: "userA" | "userB"): Account {
  const file = path.join(AUTH_DIR, `${name}.account.json`);
  if (!fs.existsSync(file)) {
    throw new Error(
      `Missing ${file}. Run the "setup" project first (auth.setup.ts) — it provisions the two ` +
        "test accounts these fixtures depend on.",
    );
  }
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type Fixtures = {
  userA: Account;
  userB: Account;
  /** A browser Page already signed in as User A (via saved storage state). */
  userAPage: Page;
  /** A browser Page already signed in as User B (via saved storage state). */
  userBPage: Page;
  /** A browser Page with no session at all — a fresh, signed-out visitor. */
  anonPage: Page;
  /** Direct PostgREST access with User A's bearer token — bypasses the app entirely. */
  apiAsUserA: APIRequestContext;
  /** Direct PostgREST access with User B's bearer token. */
  apiAsUserB: APIRequestContext;
  /** Direct PostgREST access with only the anon/publishable key, no bearer token. */
  anonApi: APIRequestContext;
};

export const test = base.extend<Fixtures>({
  userA: async ({}, use) => {
    await use(readAccount("userA"));
  },
  userB: async ({}, use) => {
    await use(readAccount("userB"));
  },
  userAPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: path.join(AUTH_DIR, "userA.state.json"),
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
  userBPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: path.join(AUTH_DIR, "userB.state.json"),
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
  anonPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
  apiAsUserA: async ({ userA }, use) => {
    const ctx = await request.newContext({
      baseURL: `${SUPABASE_URL}/rest/v1`,
      extraHTTPHeaders: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${userA.token}` },
    });
    await use(ctx);
    await ctx.dispose();
  },
  apiAsUserB: async ({ userB }, use) => {
    const ctx = await request.newContext({
      baseURL: `${SUPABASE_URL}/rest/v1`,
      extraHTTPHeaders: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${userB.token}` },
    });
    await use(ctx);
    await ctx.dispose();
  },
  anonApi: async ({}, use) => {
    const ctx = await request.newContext({
      baseURL: `${SUPABASE_URL}/rest/v1`,
      extraHTTPHeaders: { apikey: SUPABASE_ANON_KEY },
    });
    await use(ctx);
    await ctx.dispose();
  },
});

export { expect } from "@playwright/test";
