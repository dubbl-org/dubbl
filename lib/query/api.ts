/** The organization every /api/v1 call is scoped to (set at sign-in and by the org switcher). */
export function activeOrgId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("activeOrgId");
}

/** A non-2xx API response. `message` is the route's `{ error }` text when it sent one. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** GET an org-scoped API route and parse the JSON. Throws `ApiError` on a non-2xx status. */
export async function apiGet<T = unknown>(url: string, signal?: AbortSignal): Promise<T> {
  const orgId = activeOrgId();
  const res = await fetch(url, {
    headers: orgId ? { "x-organization-id": orgId } : undefined,
    signal,
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (body as { error?: unknown } | null)?.error;
    throw new ApiError(res.status, typeof message === "string" ? message : `Request failed (${res.status})`, body);
  }
  return body as T;
}

const PAGE_SIZE = 100;
const MAX_PAGES = 50;

/**
 * GET every page of a paginated list route (`{ data, pagination }`), up to 5,000 rows,
 * so lists can search, filter, group and total in the browser. Returns the raw pages.
 */
export async function apiGetAllPages(url: string, signal?: AbortSignal): Promise<unknown[]> {
  const page = (n: number) => {
    const u = new URL(url, window.location.origin);
    u.searchParams.set("page", String(n));
    u.searchParams.set("limit", String(PAGE_SIZE));
    return apiGet<{ pagination?: { totalPages?: number } }>(u.pathname + u.search, signal);
  };
  const first = await page(1);
  const pages = Math.min(first?.pagination?.totalPages ?? 1, MAX_PAGES);
  const rest = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, i) => page(i + 2)));
  return [first, ...rest];
}
