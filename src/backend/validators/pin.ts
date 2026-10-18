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

export function validateSetPin(value: unknown): ValidationResult<SetPinInput> {
  if (!isObject(value)) return { ok: false, message: "Invalid request body." };

  if (typeof value.pin !== "string" || !/^\d{6}$/.test(value.pin.trim())) {
    return { ok: false, message: "pin must be a 6-digit numeric string." };
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
