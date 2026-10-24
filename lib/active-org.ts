/**
 * The active organisation, stored in two places on purpose.
 *
 * The client keeps it in localStorage (the app was built around that), and the
 * server can only see cookies. Mirroring the id into a cookie is what lets a
 * server component load a page's data before the browser paints, instead of
 * the page rendering empty and fetching afterwards.
 */

export const ACTIVE_ORG_COOKIE = "active_org_id";

/** Client: persist the active organisation for both the browser and the server. */
export function setActiveOrgId(organizationId: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("activeOrgId", organizationId);
  // Same value, readable by server components. Not httpOnly: the client owns it.
  document.cookie = `${ACTIVE_ORG_COOKIE}=${encodeURIComponent(organizationId)}; path=/; max-age=31536000; samesite=lax`;
}

/** Client: read the active organisation. */
export function getActiveOrgId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("activeOrgId");
}
