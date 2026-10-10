
export type CreateInvitationInput = {
  householdId: string;
  invitedEmail: string;
  invitedName: string | null;
};

export type AcceptInvitationInput = {
  token: string;
};

type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value);
}

export function validateCreateInvitation(
  body: unknown
): ValidationResult<CreateInvitationInput> {
  if (!isObject(body)) {
    return { ok: false, message: "Invalid request body." };
  }

  const householdId =
    typeof body.householdId === "string"
      ? body.householdId.trim()
      : "";

  const invitedEmail =
    typeof body.invitedEmail === "string"
      ? body.invitedEmail.trim().toLowerCase()
      : "";

  const invitedName =
    body.invitedName === undefined ||
    body.invitedName === null ||
    body.invitedName === ""
      ? null
      : typeof body.invitedName === "string"
        ? body.invitedName.trim()
        : undefined;

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      householdId
    )
  ) {
    return { ok: false, message: "Invalid household ID." };
  }

  if (
    invitedEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitedEmail)
  ) {
    return { ok: false, message: "Invalid invitation email." };
  }

  if (
    invitedName === undefined ||
    (invitedName !== null &&
      (invitedName.length === 0 || invitedName.length > 100))
  ) {
    return { ok: false, message: "Invalid invited name." };
  }

  return {
    ok: true,
    data: { householdId, invitedEmail, invitedName },
  };
}

export function validateAcceptInvitation(
  body: unknown
): ValidationResult<AcceptInvitationInput> {
  if (!isObject(body) || typeof body.token !== "string") {
    return { ok: false, message: "Invitation token is required." };
  }

  const token = body.token.trim();

  // A 32-byte base64url token is 43 characters.
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return { ok: false, message: "Invalid invitation token." };
  }

  return { ok: true, data: { token } };
}
