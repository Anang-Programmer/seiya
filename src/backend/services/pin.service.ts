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

export async function hasUserPin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_pins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  return Boolean(!error && data);
}
