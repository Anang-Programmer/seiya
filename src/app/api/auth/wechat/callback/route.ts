import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  WECHAT_STATE_COOKIE,
  WechatAuthError,
  exchangeWechatCode,
  getWechatConfig,
  signInWithWechat,
} from "@/backend/services/wechat-auth.service";

/**
 * WeChat redirects here after the QR scan with ?code&state. The code is
 * exchanged server-side (the AppSecret never reaches the browser), then the
 * Supabase session cookie is set and the user lands on the app: new accounts
 * continue to Choose Your Path, existing ones to their dashboard.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const fail = (reason: string) => {
    const res = NextResponse.redirect(new URL(`/?wechat_error=${reason}`, url));
    res.cookies.delete({ name: WECHAT_STATE_COOKIE, path: "/api/auth/wechat" });
    return res;
  };

  const config = getWechatConfig();
  if (!config) return fail("not_configured");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  // WeChat sends no code when the user taps "cancel" on the phone.
  if (!code) return fail("denied");

  const cookieStore = await cookies();
  const expected = cookieStore.get(WECHAT_STATE_COOKIE)?.value;
  if (!state || !expected || state !== expected) return fail("state");

  try {
    const identity = await exchangeWechatCode(config, code);
    const supabase = await createClient();
    await signInWithWechat(createAdminClient(), supabase, identity);

    const res = NextResponse.redirect(new URL("/", url));
    res.cookies.delete({ name: WECHAT_STATE_COOKIE, path: "/api/auth/wechat" });
    return res;
  } catch (error) {
    console.error("[auth/wechat]", error instanceof Error ? error.message : error);
    return fail(error instanceof WechatAuthError ? error.reason : "session");
  }
}
