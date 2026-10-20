export interface SetPinInput {
  pin: string;
}

export interface VerifyPinInput {
  pin: string;
  userId?: string;
}

type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 111111, 123456, 654321 and the like are the first PINs anyone would try. */
export function isWeakPin(pin: string): boolean {
  if (/^(\d)\1{5}$/.test(pin)) return true;
  const digits = pin.split("").map(Number);
  const steps = digits.slice(1).map((d, i) => d - digits[i]);
  return steps.every((s) => s === 1) || steps.every((s) => s === -1);
}

export function validateSetPin(value: unknown): ValidationResult<SetPinInput> {
  if (!isObject(value)) return { ok: false, message: "Invalid request body." };

  if (typeof value.pin !== "string" || !/^\d{6}$/.test(value.pin.trim())) {
    return { ok: false, message: "pin must be a 6-digit numeric string." };
  }
  if (isWeakPin(value.pin.trim())) {
    return { ok: false, message: "This PIN is too easy to guess. Avoid repeated or consecutive digits." };
  }

  return { ok: true, data: { pin: value.pin.trim() } };
}

export function validateVerifyPin(value: unknown): ValidationResult<VerifyPinInput> {
  if (!isObject(value)) return { ok: false, message: "Invalid request body." };

  if (typeof value.pin !== "string" || !/^\d{6}$/.test(value.pin.trim())) {
    return { ok: false, message: "pin must be a 6-digit numeric string." };
  }

  const userId = typeof value.userId === "string" && value.userId.trim() ? value.userId.trim() : undefined;

  return { ok: true, data: { pin: value.pin.trim(), userId } };
}
