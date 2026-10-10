
import { NextResponse } from "next/server";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      {
        success: false,
        message: "Supabase environment variables are missing.",
      },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/auth/v1/health`,
      {
        headers: {
          apikey: supabaseKey,
        },
        cache: "no-store",
      }
    );

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          message: "Supabase health check failed.",
          status: response.status,
          details: result,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Supabase Auth connection successful!",
      service: result?.name,
      version: result?.version,
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Could not connect to Supabase.",
      },
      { status: 502 }
    );
  }
}
