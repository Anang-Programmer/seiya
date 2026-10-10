
export type CreateHouseholdInput = {
  name: string;
  country: string | null;
  baseCurrency: string;
};

type ValidationResult =
  | { ok: true; data: CreateHouseholdInput }
  | { ok: false; message: string };

export function validateCreateHousehold(
  body: unknown
): ValidationResult {
  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body)
  ) {
    return { ok: false, message: "Invalid request body." };
  }

  const input = body as Record<string, unknown>;

  const name =
    input.name === undefined
      ? "Our household"
      : typeof input.name === "string"
        ? input.name.trim()
        : "";

  const country =
    input.country === undefined || input.country === null
      ? null
      : typeof input.country === "string"
        ? input.country.trim() || null
        : undefined;

  const baseCurrency =
    input.baseCurrency === undefined
      ? "IDR"
      : typeof input.baseCurrency === "string"
        ? input.baseCurrency.trim().toUpperCase()
        : "";

  if (!name || name.length > 100) {
    return {
      ok: false,
      message: "Name must be between 1 and 100 characters.",
    };
  }

  if (country === undefined || (country && country.length > 100)) {
    return { ok: false, message: "Invalid country." };
  }

  if (!/^[A-Z]{3}$/.test(baseCurrency)) {
    return {
      ok: false,
      message: "Currency must be a three-letter code, such as IDR.",
    };
  }

  return {
    ok: true,
    data: { name, country, baseCurrency },
  };
}
