import { Button } from "@/components/ui/button";

/**
 * A same-origin POST form, not a link — logout must never be triggerable by
 * a GET request (CSRF-via-GET / link-prefetch logout). See ARCHITECTURE.md
 * §5, vulnerability #15.
 */
export function SignOutButton() {
  return (
    <form action="/auth/signout" method="post">
      <Button type="submit" variant="ghost">
        Sign out
      </Button>
    </form>
  );
}
