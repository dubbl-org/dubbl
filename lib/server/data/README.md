# Server-side data for the first paint

Pages used to render an empty shell and fetch after hydration, which costs a
full round trip before anything appears. The pattern below moves that fetch to
the server. It has been applied to the lists and details noted at the bottom;
anything not listed still uses the client fetch.

## The four steps

1. **Add the query** to a module here, mirroring the API route it replaces —
   same `where`, same `with`, same order and limit. The API route stays the
   source for filtering, paging and mutations; this module only serves the
   first paint, so a small duplication is intentional and should stay close to
   the route it copies.
2. **Give the page a server component** that calls `getServerContext()` from
   `lib/server/context` and the query above, then passes the result down.
3. **Turn the old page into the client component.** Move the file to
   `<name>-client.tsx`, add the props, seed the state with them, and set the
   initial `loading` to `false`.
4. **Skip the first fetch.** Guard the mount effect with a `useRef(true)` so
   it runs for later filter and pagination changes but not on hydration, and
   only when nothing has been filtered yet. Without this the page fetches
   immediately and the server render bought nothing.

## When the route is too big to mirror

Report endpoints and the dashboard panels carry bespoke shaping: currency
conversion, basis selection, bucket maths. Copying that into `lib/server/data`
duplicates the most intricate code in the app. For those, invoke the handler
itself from the server component with `callRoute` in `../call-route.ts`:

```tsx
import { GET } from "@/app/api/v1/reports/profit-and-loss/route";

const pnl = await callRoute<{ totalRevenue: number }>(GET, ctx,
  "reports/profit-and-loss", new URLSearchParams({ startDate, endDate, basis }));
```

No HTTP hop, no second implementation, and a handler that errors returns null
so one failing panel does not blank the page. This is the mechanism for the
`reports/*` family and the `dashboard` home; they still need the client side of
the four steps (props, seeded state, skipped first fetch), which is the part
that cannot be scripted safely because every page seeds different state.

## Keeping the screen in sync after an action

Seeded state is ordinary React state, so the rules are unchanged: after a
mutation, re-run the page's own loader (`fetchInvoices()`, `setRefreshKey(k+1)`)
or dispatch the `*-changed` window event the sibling screens already listen
for. Two things to know:

- **Seeded state must follow the payload, not just start from it.** Back and
  forward re-render the server component without remounting the client one, so
  plain `useState(initialX)` kept the rows it was first painted with while the
  fresh data sat unused in the props. Use `useServerSeeded(payload, value)` from
  `lib/hooks/use-server-seeded.ts` for every hook that reads the payload; it
  re-seeds when the payload object changes identity, which only happens on a
  server render. Loading flags and filters stay plain `useState`.
- **You cannot delete a mount effect unless nothing can change the data.** Read-
  only snapshots (the dashboard, duplicate detection, reconciliation status) can
  lose theirs; lists with mutations must keep the loader even when the first
  paint comes from the server.

## Two traps that cost time

- **Dates.** Drizzle returns `Date` objects; the client interfaces are typed
  against JSON strings. Pass values through `toClient<T>()` from
  `./serialize`, or the types will not line up.
- **Types.** Export the interfaces the props use (`export interface Expense`)
  so the server file can import them. A `"use client"` module is a fine place
  to import types from.

## Converted so far

- `projects` list, `projects/[id]` layout (covers all five project tabs)
- `purchases/expenses` list and `purchases/expenses/[id]` detail
- `sales` (invoices) list and `sales/[id]` detail
- `contacts` list
- `accounting` manual entries list and the chart of accounts
- `documents` library
- `payroll` landing screen (employees + runs)
- `crm` board (pipelines, first page of the default pipeline, summary)
- **every** `reports/*` screen except the two that fetch nothing (the index and
  the pack download), through `callRoute`
- `dashboard` home: nine queries in one parallel server pass
- opening balances, inventory alerts and valuation, payroll reports, sales
  payments and quotes, tax BAS, sales tax, schedule C

## Not converted, and why

- The list screens whose fetch lives in a `useCallback` loader rather than an
  effect: banking settings, bank transactions, reconcile, payment batches,
  scheduled payments, stock takes, payroll employees, teams members and CRM
  analytics. The pattern still applies, but the guard goes in the effect that
  calls the loader and the setters read from the loader's `.then` blocks.
- Everything else is mechanical: follow the four steps above.
