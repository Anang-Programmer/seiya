import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// "Continue with WeChat". Supabase has no WeChat provider, so the server runs
// the OAuth exchange and then starts a normal Supabase session for an account
// keyed by the WeChat ID. Two kinds of WeChat app are supported:
// - "website": Open Platform Website Application, QR login in any browser
//   (needs a paid, verified developer account).
//   https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html
// - "mp": Official Account web authorization inside the WeChat app. Works with
//   the free sandbox test account (测试号) for demos and testing.
//   https://developers.weixin.qq.com/doc/offiaccount/OA_Web_Apps/Wechat_webpage_authorization.html

export const WECHAT_STATE_COOKIE = "seiya_wx_state";
export const WECHAT_STATE_MAX_AGE = 600; // seconds

const INTERNAL_EMAIL_DOMAIN = process.env.SEIYA_USERNAME_EMAIL_DOMAIN?.trim() || "users.seiya.invalid";

export type WechatAppKind = "website" | "mp";

export interface WechatConfig {
  kind: WechatAppKind;
  appId: string;
  appSecret: string;
  callbackUrl: string;
}

/**
 * website: WECHAT_APP_ID / WECHAT_APP_SECRET.
 * mp (inside WeChat, e.g. the free test account): WECHAT_MP_APP_ID / WECHAT_MP_APP_SECRET.
 * Null until that pair and APP_BASE_URL are set.
 */
export function getWechatConfig(kind: WechatAppKind): WechatConfig | null {
  const prefix = kind === "website" ? "WECHAT" : "WECHAT_MP";
  const appId = process.env[`${prefix}_APP_ID`]?.trim();
  const appSecret = process.env[`${prefix}_APP_SECRET`]?.trim();
  const baseUrl = process.env.APP_BASE_URL?.trim().replace(/\/+$/, "");
  if (!appId || !appSecret || !baseUrl) return null;
  return { kind, appId, appSecret, callbackUrl: `${baseUrl}/api/auth/wechat/callback` };
}

/** WeChat's in-app browser identifies itself as "MicroMessenger". */
export function isWechatBrowser(userAgent: string | null) {
  return /MicroMessenger/i.test(userAgent ?? "");
}

/**
 * Which WeChat app to use for this browser: in-app authorization inside WeChat
 * when configured, otherwise the QR login of the website application.
 */
export function pickWechatConfig(userAgent: string | null): WechatConfig | null {
  const mp = getWechatConfig("mp");
  const website = getWechatConfig("website");
  if (isWechatBrowser(userAgent) && mp) return mp;
  return website;
}

export function newWechatState() {
  return randomBytes(24).toString("base64url");
}

/** QR login page (website) or in-app authorization page (mp). */
export function buildWechatAuthorizeUrl(config: WechatConfig, state: string) {
  const params = new URLSearchParams({
    appid: config.appId,
    redirect_uri: config.callbackUrl,
    response_type: "code",
    scope: config.kind === "website" ? "snsapi_login" : "snsapi_userinfo",
    state,
  });
  const page = config.kind === "website" ? "qrconnect" : "oauth2/authorize";
  return `https://open.weixin.qq.com/connect/${page}?${params.toString()}#wechat_redirect`;
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

  // openid is per WeChat app, so it is namespaced by the AppID; unionid (when the
  // app is bound to an Open Platform account) is the same across apps.
  return { wechatId: unionid || `${config.appId}:${openid}`, nickname };
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
