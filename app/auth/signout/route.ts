import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST only (no GET handler exported): logout must never be triggerable by
// a GET request — no link-prefetch or CSRF-via-GET logout.
// See ARCHITECTURE.md §5 (#15).
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url));
}
