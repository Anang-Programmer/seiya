import { NextResponse } from "next/server";
import {
  WECHAT_STATE_COOKIE,
  WECHAT_STATE_MAX_AGE,
  buildWechatAuthorizeUrl,
  getWechatConfig,
  isWechatBrowser,
  newWechatState,
  pickWechatConfig,
} from "@/backend/services/wechat-auth.service";

/**
 * Sends the browser to WeChat's QR login page. A random state is kept in an
 * httpOnly cookie and checked on the callback (protects against login CSRF).
 */
export async function GET(request: Request) {
  const userAgent = request.headers.get("user-agent");
  const config = pickWechatConfig(userAgent);
  if (!config) {
    const reason = !isWechatBrowser(userAgent) && getWechatConfig("mp") ? "open_in_wechat" : "not_configured";
    return NextResponse.redirect(new URL(`/?wechat_error=${reason}`, request.url));
  }

  // The cookie remembers which WeChat app started the login (website / mp).
  const state = `${config.kind}.${newWechatState()}`;
  const response = NextResponse.redirect(buildWechatAuthorizeUrl(config, state));
  response.cookies.set(WECHAT_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/wechat",
    maxAge: WECHAT_STATE_MAX_AGE,
  });
  return response;
}
