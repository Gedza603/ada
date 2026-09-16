import { test, expect } from "./fixtures";

// The required two-user test, driven through the UI. See SECURITY_TESTS.md.
test.describe.serial("cross-account isolation — UI", () => {
  const habitName = `A-SECRET-HABIT-${Date.now()}`;
  let habitId = "";

  test("User A creates a private habit", async ({ userAPage }) => {
    await userAPage.goto("/dashboard");
    await userAPage.getByText("+ Add a habit").click();
    await userAPage.getByLabel("Name").fill(habitName);
    await userAPage.getByRole("button", { name: "Add habit" }).click();

    const link = userAPage.getByRole("link", { name: habitName });
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    habitId = href?.split("/").pop() ?? "";
    expect(habitId).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("User B's dashboard never shows User A's habit name", async ({ userBPage }) => {
    await userBPage.goto("/dashboard");
    await expect(userBPage.locator("body")).not.toContainText(habitName);
  });

  test("User B navigating directly to User A's habit URL gets Not Found, not the habit", async ({
    userBPage,
  }) => {
    const response = await userBPage.goto(`/habits/${habitId}`);
    expect(response?.status()).toBe(404);
    await expect(userBPage.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(userBPage.locator("body")).not.toContainText(habitName);
  });
});
