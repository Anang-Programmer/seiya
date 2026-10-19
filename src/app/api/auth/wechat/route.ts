import { NextResponse, connection } from "next/server";
import { getWechatConfig } from "@/backend/services/wechat-auth.service";

/** Tells the login screen whether to show "Continue with WeChat". */
export async function GET() {
  // Read the env at request time, not at build time.
  await connection();
  return NextResponse.json({ enabled: getWechatConfig() !== null });
}
