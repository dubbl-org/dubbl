import type { ServerContext } from "./context";

/**
 * Call an existing route handler from a server component.
 *
 * The report pages and the dashboard home read a dozen bespoke endpoints, each
 * with its own shaping and currency logic. Re-implementing that in
 * `lib/server/data` would duplicate the most intricate code in the app and let
 * the two copies drift. Instead, a server component can invoke the handler
 * directly: same function, same query, same output, no HTTP hop and no
 * duplication.
 *
 *   import { GET } from "@/app/api/v1/reports/profit-and-loss/route";
 *   const pnl = await callRoute(GET, ctx, "reports/profit-and-loss",
 *     new URLSearchParams({ startDate, endDate, basis }));
 *
 * The handler sees a request that looks exactly like the one the browser would
 * have sent, so `getAuthContext` resolves the session from cookies and the
 * organisation from the header we set here. A handler that returns an error
 * status yields null rather than throwing, so one failing panel does not blank
 * the page.
 */
export async function callRoute<T = unknown>(
  handler: (...args: never[]) => Promise<Response>,
  ctx: ServerContext,
  path: string,
  query?: URLSearchParams,
  params?: Record<string, string>
): Promise<T | null> {
  const qs = query?.toString();
  const url = `http://internal/api/v1/${path.replace(/^\/+/, "")}${qs ? `?${qs}` : ""}`;

  const response = await (handler as (
    request: Request,
    extra?: { params: Promise<Record<string, string>> }
  ) => Promise<Response>)(
    new Request(url, {
      headers: {
        "x-organization-id": ctx.organizationId,
        // The session cookie is read from the request context, not copied here.
        "content-type": "application/json",
      },
    }),
    params ? { params: Promise.resolve(params) } : undefined
  );

  if (!response.ok) return null;
  return (await response.json()) as T;
}

/** Same, for several handlers at once. Each failure is isolated. */
export async function callRoutes(
  entries: Array<{
    handler: (request: Request) => Promise<Response>;
    path: string;
    query?: URLSearchParams;
  }>,
  ctx: ServerContext
): Promise<Array<unknown | null>> {
  return Promise.all(entries.map((e) => callRoute(e.handler, ctx, e.path, e.query)));
}
