// Seiya accounts sign in with their full name as a unique username.
export type SignUpInput = {
  fullName: string;
  password: string;
};

export type SignInInput = {
  fullName: string;
  password: string;
};

type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

/**
 * Normalizes a full name for use as a username: Unicode NFKC, trimmed,
 * inner whitespace collapsed. Returns null when it is not acceptable.
 */
export function normalizeFullName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  // eslint-disable-next-line no-control-regex
  if (name.length < 2 || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name)) {
    return null;
  }
  return name;
}

export function validateSignUp(
  value: unknown
): ValidationResult<SignUpInput> {
  if (!isObject(value)) {
    return { ok: false, message: "Invalid request body." };
  }

  const fullName = normalizeFullName(value.fullName);
  const password =
    typeof value.password === "string" ? value.password : "";

  if (!fullName) {
    return {
      ok: false,
      message: "Name must be between 2 and 100 characters.",
    };
  }

  if (password.length < 8 || password.length > 128) {
    return {
      ok: false,
      message: "Password must be between 8 and 128 characters.",
    };
  }

  return {
    ok: true,
    data: { fullName, password },
  };
}

export function validateSignIn(
  value: unknown
): ValidationResult<SignInInput> {
  if (!isObject(value)) {
    return { ok: false, message: "Invalid request body." };
  }

  const fullName = normalizeFullName(value.fullName);
  const password =
    typeof value.password === "string" ? value.password : "";

  if (!fullName || !password || password.length > 128) {
    return {
      ok: false,
      message: "Please provide your full name and password.",
    };
  }

  return {
    ok: true,
    data: { fullName, password },
  };
}
