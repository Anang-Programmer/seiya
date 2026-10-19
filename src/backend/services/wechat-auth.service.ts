import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// "Continue with WeChat" (WeChat Open Platform, Website Application, QR login).
// Supabase has no WeChat provider, so the server runs the OAuth exchange and
// then starts a normal Supabase session for an account keyed by the WeChat ID.
// Docs: https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html

export const WECHAT_STATE_COOKIE = "seiya_wx_state";
export const WECHAT_STATE_MAX_AGE = 600; // seconds

const INTERNAL_EMAIL_DOMAIN = process.env.SEIYA_USERNAME_EMAIL_DOMAIN?.trim() || "users.seiya.invalid";

export interface WechatConfig {
  appId: string;
  appSecret: string;
  callbackUrl: string;
}

/** Null until WECHAT_APP_ID, WECHAT_APP_SECRET and APP_BASE_URL are set. */
export function getWechatConfig(): WechatConfig | null {
  const appId = process.env.WECHAT_APP_ID?.trim();
  const appSecret = process.env.WECHAT_APP_SECRET?.trim();
  const baseUrl = process.env.APP_BASE_URL?.trim().replace(/\/+$/, "");
  if (!appId || !appSecret || !baseUrl) return null;
  return { appId, appSecret, callbackUrl: `${baseUrl}/api/auth/wechat/callback` };
}

export function newWechatState() {
  return randomBytes(24).toString("base64url");
}

/** WeChat's QR-code login page for the website application. */
export function buildWechatAuthorizeUrl(config: WechatConfig, state: string) {
  const params = new URLSearchParams({
    appid: config.appId,
    redirect_uri: config.callbackUrl,
    response_type: "code",
    scope: "snsapi_login",
    state,
  });
  return `https://open.weixin.qq.com/connect/qrconnect?${params.toString()}#wechat_redirect`;
}

export class WechatAuthError extends Error {
  constructor(
    readonly reason: "denied" | "state" | "exchange" | "profile" | "session",
    message: string
  ) {
    super(message);
    this.name = "WechatAuthError";
  }
}

// WeChat answers JSON (sometimes labelled text/plain); errors come as {errcode, errmsg}.
async function wechatGet(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new WechatAuthError("exchange", `WeChat returned an unreadable response (HTTP ${res.status}).`);
  }
  if (!res.ok || (typeof data.errcode === "number" && data.errcode !== 0)) {
    throw new WechatAuthError("exchange", `WeChat error ${String(data.errcode ?? res.status)}: ${String(data.errmsg ?? "request failed")}`);
  }
  return data;
}

export interface WechatIdentity {
  /** unionid when available (same person across the company's WeChat apps), else openid. */
  wechatId: string;
  nickname: string | null;
}

export async function exchangeWechatCode(config: WechatConfig, code: string): Promise<WechatIdentity> {
  const token = await wechatGet(
    `https://api.weixin.qq.com/sns/oauth2/access_token?${new URLSearchParams({
      appid: config.appId,
      secret: config.appSecret,
      code,
      grant_type: "authorization_code",
    }).toString()}`
  );
  const accessToken = typeof token.access_token === "string" ? token.access_token : "";
  const openid = typeof token.openid === "string" ? token.openid : "";
  if (!accessToken || !openid) throw new WechatAuthError("exchange", "WeChat did not return an access token.");

  let nickname: string | null = null;
  let unionid = typeof token.unionid === "string" ? token.unionid : "";
  try {
    const profile = await wechatGet(
      `https://api.weixin.qq.com/sns/userinfo?${new URLSearchParams({ access_token: accessToken, openid, lang: "en" }).toString()}`
    );
    nickname = typeof profile.nickname === "string" && profile.nickname.trim() ? profile.nickname.trim().slice(0, 100) : null;
    if (!unionid && typeof profile.unionid === "string") unionid = profile.unionid;
  } catch {
    // The profile is optional; the account can still be created from the ID.
  }

  return { wechatId: unionid || openid, nickname };
}

/** Deterministic internal address for a WeChat account (never deliverable). */
export function wechatEmail(wechatId: string) {
  const digest = createHash("sha256").update(`wechat:${wechatId}`).digest("hex").slice(0, 32);
  return `wx-${digest}@${INTERNAL_EMAIL_DOMAIN}`;
}

/**
 * Finds or creates the Seiya account for this WeChat ID and starts a session on
 * the cookie-bound client. generateLink creates the user on first use; the
 * one-time token is verified server-side, so no email is ever sent.
 */
export async function signInWithWechat(admin: SupabaseClient, supabase: SupabaseClient, identity: WechatIdentity) {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: wechatEmail(identity.wechatId),
    options: { data: { full_name: identity.nickname || "WeChat user", auth_provider: "wechat" } },
  });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) throw new WechatAuthError("session", error?.message || "Could not prepare the sign-in.");

  const { error: verifyError } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (verifyError) throw new WechatAuthError("session", verifyError.message);
}
