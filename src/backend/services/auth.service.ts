import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SignInInput,
  SignUpInput,
} from "@/backend/validators/auth";

// Supabase Auth needs an email, so each username maps to a deterministic
// internal address. The reserved `.invalid` TLD (RFC 2606) guarantees mail
// to it can never be delivered, so a password-reset request for an account
// cannot leak a link to anyone.
const INTERNAL_EMAIL_DOMAIN =
  process.env.SEIYA_USERNAME_EMAIL_DOMAIN?.trim() || "users.seiya.invalid";

export function usernameKey(fullName: string): string {
  return fullName.toLocaleLowerCase("en-US");
}

export function usernameToEmail(fullName: string): string {
  const digest = createHash("sha256")
    .update(usernameKey(fullName))
    .digest("hex")
    .slice(0, 32);
  return `u-${digest}@${INTERNAL_EMAIL_DOMAIN}`;
}

/**
 * Creates the account through the Auth admin API (already confirmed, no email
 * sent), then signs in with the cookie-bound client to start the session.
 */
export async function signUpWithUsername(
  admin: SupabaseClient,
  supabase: SupabaseClient,
  input: SignUpInput
) {
  const email = usernameToEmail(input.fullName);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });

  if (createError || !created.user) {
    const taken =
      createError?.code === "email_exists" ||
      createError?.status === 422 ||
      /already been registered|already registered/i.test(createError?.message ?? "");
    return { data: null, error: createError, usernameTaken: taken };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: input.password,
  });

  return { data, error, usernameTaken: false };
}

export async function signInWithUsername(
  supabase: SupabaseClient,
  input: SignInInput
) {
  return supabase.auth.signInWithPassword({
    email: usernameToEmail(input.fullName),
    password: input.password,
  });
}
