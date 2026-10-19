import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client for privileged Auth admin calls (creating accounts).
// Server-only: SUPABASE_SERVICE_ROLE_KEY must never be exposed to the browser.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY_MISSING");
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
