import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

function hashPin(pin: string, userId: string): string {
  return createHash("sha256").update(`${userId}:${pin}:seiya-dual-key-salt`).digest("hex");
}

export async function setUserPin(supabase: SupabaseClient, userId: string, pin: string) {
  const pinHash = hashPin(pin, userId);
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("user_pins")
    .upsert({
      user_id: userId,
      pin_hash: pinHash,
      updated_at: now,
    });

  return { success: !error, error };
}

export async function verifyUserPin(supabase: SupabaseClient, userId: string, pin: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_pins")
    .select("pin_hash")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return false;

  const expected = hashPin(pin, userId);
  return data.pin_hash === expected;
}

// Five wrong PINs within 15 minutes lock PIN checks for that user, matching the
// dual-key plan deletion RPC. Process-local, like the agent request limiter.
const PIN_FAILURE_WINDOW_MS = 15 * 60_000;
const MAX_PIN_FAILURES = 5;
const pinFailures = new Map<string, number[]>();

function recentPinFailures(userId: string, now: number): number[] {
  const recent = (pinFailures.get(userId) ?? []).filter((at) => now - at < PIN_FAILURE_WINDOW_MS);
  if (recent.length) pinFailures.set(userId, recent);
  else pinFailures.delete(userId);
  return recent;
}

export type PinCheck = "valid" | "invalid" | "locked";

/** PIN check with brute-force protection; use this for every user-facing PIN prompt. */
export async function checkUserPin(supabase: SupabaseClient, userId: string, pin: string): Promise<PinCheck> {
  const now = Date.now();
  const failures = recentPinFailures(userId, now);
  if (failures.length >= MAX_PIN_FAILURES) return "locked";

  if (await verifyUserPin(supabase, userId, pin)) {
    pinFailures.delete(userId);
    return "valid";
  }
  pinFailures.set(userId, [...failures, now]);
  return failures.length + 1 >= MAX_PIN_FAILURES ? "locked" : "invalid";
}

export const PIN_LOCKED_MESSAGE = "Too many wrong PIN attempts. Please wait 15 minutes and try again.";

export async function hasUserPin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_pins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  return Boolean(!error && data);
}
