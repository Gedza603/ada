import { test, expect } from "./fixtures";

test.describe("authentication", () => {
  test("a new user can sign up, reach the dashboard, and sign out", async ({ page }) => {
    const email = `g.zabulis2009+habitly-signup-${Date.now()}@gmail.com`;
    const password = `SignupPass!${Date.now()}`;

    await page.goto("/signup");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: /create account/i }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Your habits" })).toBeVisible();

    await page.getByRole("button", { name: /sign out/i }).click();
    await expect(page).toHaveURL("/");

    // After logout, the dashboard must be inaccessible again.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("a user can log in with valid credentials", async ({ page, userA }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(userA.email);
    await page.getByLabel("Password").fill(userA.password);
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("login fails with a generic error for a wrong password", async ({ page, userA }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(userA.email);
    await page.getByLabel("Password").fill("definitely-wrong-password");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.getByText("Invalid email or password.")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("login fails with the SAME generic error for a non-existent email (no enumeration)", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(`no-such-user-${Date.now()}@gmail.com`);
    await page.getByLabel("Password").fill("whatever-password-123");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.getByText("Invalid email or password.")).toBeVisible();
  });

  test("a signed-out visitor cannot access /dashboard", async ({ anonPage }) => {
    await anonPage.goto("/dashboard");
    await expect(anonPage).toHaveURL(/\/login/);
  });
});
