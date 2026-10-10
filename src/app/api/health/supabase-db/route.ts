import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();

  // Memvalidasi sesi ke Supabase Auth; jangan percaya user ID dari request.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { success: false, stage: "auth", message: "Login required." },
      { status: 401 }
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    // Hindari mengirim detail internal database ke browser.
    console.error("Supabase profile health check failed:", profileError);
    return NextResponse.json(
      {
        success: false,
        stage: "database_query",
        message: "Could not query the signed-in user's profile.",
      },
      { status: 500 }
    );
  }

  if (!profile) {
    return NextResponse.json(
      {
        success: false,
        stage: "profile_lookup",
        message: "No profile row found for the signed-in user.",
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Authenticated database query successful.",
    profileFound: true,
  });
}