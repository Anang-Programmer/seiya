import type { SupabaseClient } from "@supabase/supabase-js";

// PINs are hashed, checked and rate-limited inside Postgres (set_user_pin,
// verify_user_pin; see 20261020090000_dual_key_db_enforcement.sql). Five wrong
// PINs within 15 minutes lock every PIN check for that user, across requests
// and server instances. pin_hash is not readable through the API.

export type PinCheck = "valid" | "invalid" | "locked";

export type SetPinResult =
  | { success: true }
  | { success: false; reason: "current_pin_required" | "invalid_pin" | "locked" | "error" };

/** Sets the signed-in user's PIN; changing an existing PIN needs the current one. */
export async function setUserPin(
  supabase: SupabaseClient,
  pin: string,
  currentPin: string | null
): Promise<SetPinResult> {
  const { data, error } = await supabase.rpc("set_user_pin", {
    p_pin: pin,
    p_current_pin: currentPin,
  });

  if (error) return { success: false, reason: "error" };

  const result = data as { ok?: boolean; reason?: string } | null;
  if (result?.ok) return { success: true };

  const reason = result?.reason;
  return {
    success: false,
    reason: reason === "current_pin_required" || reason === "locked" ? reason : "invalid_pin",
  };
}

/** PIN check with brute-force protection; use this for every user-facing PIN prompt. */
export async function checkUserPin(supabase: SupabaseClient, pin: string): Promise<PinCheck> {
  const { data, error } = await supabase.rpc("verify_user_pin", { p_pin: pin });
  if (error) return "invalid";
  return data === "valid" || data === "locked" ? data : "invalid";
}

export const PIN_LOCKED_MESSAGE = "Too many wrong PIN attempts. Please wait 15 minutes and try again.";

/** Maps the ok=false reason of the PIN-checking decision RPCs. */
export function pinFailure(reason: unknown): { code: "PIN_REQUIRED" | "INVALID_PIN" | "PIN_LOCKED"; status: number; message: string } {
  if (reason === "locked") return { code: "PIN_LOCKED", status: 429, message: PIN_LOCKED_MESSAGE };
  if (reason === "pin_required") {
    return { code: "PIN_REQUIRED", status: 401, message: "Enter your 6-digit security PIN to approve." };
  }
  return { code: "INVALID_PIN", status: 401, message: "Invalid 6-digit security PIN." };
}

export async function hasUserPin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_pins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  return Boolean(!error && data);
}
