import { test, expect } from "./fixtures";

// Sequential: each step depends on the state left by the previous one.
test.describe.serial("habit CRUD (User A)", () => {
  const habitName = "Read 30 minutes";
  const editedName = "Read 45 minutes";

  test("User A can create a habit", async ({ userAPage }) => {
    await userAPage.goto("/dashboard");
    await userAPage.getByText("+ Add a habit").click();
    await userAPage.getByLabel("Name").fill(habitName);
    await userAPage.getByRole("button", { name: "Add habit" }).click();

    await expect(userAPage.getByRole("link", { name: habitName })).toBeVisible();
  });

  test("User A can see the habit after reloading", async ({ userAPage }) => {
    await userAPage.goto("/dashboard");
    await expect(userAPage.getByRole("link", { name: habitName })).toBeVisible();
  });

  test("User A can edit the habit", async ({ userAPage }) => {
    await userAPage.goto("/dashboard");
    await userAPage.getByRole("link", { name: habitName }).click();
    await expect(userAPage).toHaveURL(/\/habits\/[0-9a-f-]{36}$/);

    await userAPage.locator("#edit-name").fill(editedName);
    await userAPage.getByRole("button", { name: "Save changes" }).click();
    await expect(userAPage.getByText("Saved ✓")).toBeVisible();

    await userAPage.goto("/dashboard");
    await expect(userAPage.getByRole("link", { name: editedName })).toBeVisible();
  });

  test("User A can mark the habit complete for today", async ({ userAPage }) => {
    await userAPage.goto("/dashboard");
    const toggle = userAPage.getByRole("button", { name: /mark today complete/i });
    await toggle.click();
    await expect(
      userAPage.getByRole("button", { name: /mark today complete: completed/i }),
    ).toBeVisible();
  });

  test("User A can delete the habit", async ({ userAPage }) => {
    await userAPage.goto("/dashboard");
    userAPage.once("dialog", (dialog) => dialog.accept());
    await userAPage.getByRole("button", { name: "Delete" }).click();

    await expect(userAPage.getByRole("link", { name: editedName })).toHaveCount(0);
  });
});
