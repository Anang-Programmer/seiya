import { NextResponse } from "next/server";
import {
  WECHAT_STATE_COOKIE,
  WECHAT_STATE_MAX_AGE,
  buildWechatAuthorizeUrl,
  getWechatConfig,
  newWechatState,
} from "@/backend/services/wechat-auth.service";

/**
 * Sends the browser to WeChat's QR login page. A random state is kept in an
 * httpOnly cookie and checked on the callback (protects against login CSRF).
 */
export async function GET(request: Request) {
  const config = getWechatConfig();
  if (!config) {
    return NextResponse.redirect(new URL("/?wechat_error=not_configured", request.url));
  }

  const state = newWechatState();
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
