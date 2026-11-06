// Shared by the sign-up page and the server-side registration check.

/** Cookie the sign-up page sets so an OAuth sign-up keeps its invite link. */
export const INVITE_COOKIE = "dubbl_invite";

/** The invite token in a sign-up callback URL such as `/invite/<token>`. */
export function inviteTokenFromCallback(callbackUrl: string | null | undefined) {
  const match = callbackUrl?.match(/^\/invite\/([A-Za-z0-9_-]+)/);
  return match?.[1] ?? null;
}
