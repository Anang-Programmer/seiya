// Partner invitation tokens arrive as /invite?token=<token> links (built from
// APP_BASE_URL by the invitation service). The token is parked in session
// storage until the visitor has signed in and can accept it.

const PENDING_INVITE_KEY = "seiya_pending_invite";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function readPendingInvite(): string | null {
  try {
    return window.sessionStorage.getItem(PENDING_INVITE_KEY);
  } catch {
    return null;
  }
}

export function storePendingInvite(token: string) {
  try {
    window.sessionStorage.setItem(PENDING_INVITE_KEY, token);
  } catch {
    // Storage can be unavailable (private mode); the link can still be pasted manually.
  }
}

export function clearPendingInvite() {
  try {
    window.sessionStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    // Nothing to clear.
  }
}

// Accepts either the raw token or a full invitation URL and returns the token.
export function extractInviteToken(input: string): string | null {
  const value = input.trim();
  if (TOKEN_PATTERN.test(value)) return value;
  try {
    const url = new URL(value);
    const token = url.searchParams.get("token") ?? url.searchParams.get("invite");
    return token && TOKEN_PATTERN.test(token) ? token : null;
  } catch {
    return null;
  }
}
