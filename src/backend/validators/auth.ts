
export type SignUpInput = {
  fullName: string;
  email: string;
  password: string;
};

export type SignInInput = {
  email: string;
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

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const email = value.trim().toLowerCase();

  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return null;
  }

  return email;
}

export function validateSignUp(
  value: unknown
): ValidationResult<SignUpInput> {
  if (!isObject(value)) {
    return { ok: false, message: "Invalid request body." };
  }

  const fullName =
    typeof value.fullName === "string"
      ? value.fullName.trim()
      : "";

  const email = normalizeEmail(value.email);
  const password =
    typeof value.password === "string" ? value.password : "";

  if (!fullName || fullName.length > 100) {
    return {
      ok: false,
      message: "Name is required and must be at most 100 characters.",
    };
  }

  if (!email) {
    return { ok: false, message: "Please provide a valid email." };
  }

  if (password.length < 8 || password.length > 128) {
    return {
      ok: false,
      message: "Password must be between 8 and 128 characters.",
    };
  }

  return {
    ok: true,
    data: { fullName, email, password },
  };
}

export function validateSignIn(
  value: unknown
): ValidationResult<SignInInput> {
  if (!isObject(value)) {
    return { ok: false, message: "Invalid request body." };
  }

  const email = normalizeEmail(value.email);
  const password =
    typeof value.password === "string" ? value.password : "";

  if (!email || !password || password.length > 128) {
    return {
      ok: false,
      message: "Please provide a valid email and password.",
    };
  }

  return {
    ok: true,
    data: { email, password },
  };
}
