import { NextResponse, connection } from "next/server";
import { getWechatConfig, isWechatBrowser, pickWechatConfig } from "@/backend/services/wechat-auth.service";

/**
 * Tells the login screen whether "Continue with WeChat" works in this browser.
 * openInWechat: only the in-app (test/official account) login is configured,
 * so the user must open the site inside WeChat.
 */
export async function GET(request: Request) {
  // Read the env at request time, not at build time.
  await connection();
  const userAgent = request.headers.get("user-agent");
  const enabled = pickWechatConfig(userAgent) !== null;
  const openInWechat = !enabled && !isWechatBrowser(userAgent) && getWechatConfig("mp") !== null;
  return NextResponse.json({ enabled, openInWechat });
}
