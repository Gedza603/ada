import { test, expect } from "./fixtures";

// Direct PostgREST calls with User B's own bearer token against User A's
// data — bypasses the Next.js app entirely, so this is a test of Postgres
// RLS itself (supabase/migrations/0002_rls.sql), not of the UI.
// See SECURITY_TESTS.md and ARCHITECTURE.md §4.3.
test.describe.serial("cross-account isolation — direct API", () => {
  const habitName = `API-ISOLATION-${Date.now()}`;
  let habitId = "";

  test("User A creates a habit via the API", async ({ apiAsUserA }) => {
    const response = await apiAsUserA.post("/habits", {
      data: { name: habitName, color: "#4F46E5" },
      headers: { Prefer: "return=representation" },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    habitId = body[0].id;
    expect(habitId).toBeTruthy();
  });

  test("User B cannot read User A's habit by id", async ({ apiAsUserB }) => {
    const response = await apiAsUserB.get(`/habits?select=*&id=eq.${habitId}`);
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  test("User B's own habit list never includes User A's rows", async ({
    apiAsUserB,
    userB,
  }) => {
    const response = await apiAsUserB.get("/habits?select=id,user_id");
    const rows = (await response.json()) as { id: string; user_id: string }[];
    for (const row of rows) {
      expect(row.user_id).toBe(userB.id);
    }
    expect(rows.some((row) => row.id === habitId)).toBe(false);
  });

  test("User B cannot modify User A's habit", async ({ apiAsUserB, apiAsUserA }) => {
    const patch = await apiAsUserB.patch(`/habits?id=eq.${habitId}`, {
      data: { name: "HACKED" },
      headers: { Prefer: "return=representation" },
    });
    const patched = (await patch.json().catch(() => [])) as unknown[];
    expect(Array.isArray(patched) ? patched.length : 0).toBe(0);

    const verify = await apiAsUserA.get(`/habits?select=name&id=eq.${habitId}`);
    const rows = (await verify.json()) as { name: string }[];
    expect(rows[0]?.name).toBe(habitName);
  });

  test("User B cannot delete User A's habit", async ({ apiAsUserB, apiAsUserA }) => {
    const del = await apiAsUserB.delete(`/habits?id=eq.${habitId}`, {
      headers: { Prefer: "return=representation" },
    });
    const deleted = (await del.json().catch(() => [])) as unknown[];
    expect(Array.isArray(deleted) ? deleted.length : 0).toBe(0);

    const verify = await apiAsUserA.get(`/habits?select=id&id=eq.${habitId}`);
    expect((await verify.json()).length).toBe(1);
  });

  test("User B cannot insert a completion against User A's habit, however user_id is spoofed", async ({
    apiAsUserB,
    userA,
    userB,
  }) => {
    const asVictim = await apiAsUserB.post("/habit_completions", {
      data: { habit_id: habitId, user_id: userA.id, completed_date: "2024-01-01" },
    });
    expect(asVictim.ok()).toBeFalsy();

    const asSelf = await apiAsUserB.post("/habit_completions", {
      data: { habit_id: habitId, user_id: userB.id, completed_date: "2024-01-01" },
    });
    expect(asSelf.ok()).toBeFalsy();
  });

  test("no bearer token at all: the habit is unreachable via the anon key alone", async ({
    anonApi,
  }) => {
    const response = await anonApi.get(`/habits?select=*&id=eq.${habitId}`);
    if (response.status() === 200) {
      expect(await response.json()).toEqual([]);
    } else {
      expect(response.status()).toBe(401);
    }
  });

  test("cleanup: User A deletes the habit", async ({ apiAsUserA }) => {
    const response = await apiAsUserA.delete(`/habits?id=eq.${habitId}`);
    expect(response.ok()).toBeTruthy();
  });
});
