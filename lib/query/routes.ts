import { activeOrgId } from "./api";
import type { ApiKey } from "./client";

/**
 * Learns which API requests each page makes, so the next visit can start them before
 * the page loads: when a link is hovered or pressed, and for the main sections at
 * startup. Record ids in a path become placeholders, so having opened one invoice is
 * enough to prefetch any other: `/sales/:0` → `["api", "/api/v1/invoices/{{0}}"]`.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_ANYWHERE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Only requests made this soon after a page opens count as the page's own. Later ones follow the user's typing and filtering. */
const LEARN_WINDOW_MS = 2500;
const MAX_KEYS_PER_ROUTE = 16;
const MAX_ROUTES = 400;

type Manifest = Record<string, string[]>;

let manifest: Manifest | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let openedPath = "";
let openedAt = 0;

const storageKey = () => `dubbl:routes:${activeOrgId() ?? "none"}`;

function load(): Manifest {
  if (manifest) return manifest;
  try {
    manifest = JSON.parse(localStorage.getItem(storageKey()) ?? "{}") as Manifest;
  } catch {
    manifest = {};
  }
  return manifest;
}

function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      localStorage.setItem(storageKey(), JSON.stringify(manifest));
    } catch {
      // Storage full: prefetching is a nicety, carry on without it.
    }
  }, 1000);
}

/** `/sales/3f2…` → pattern `/sales/:0` and the ids it stands for. */
function parse(pathname: string) {
  const ids: string[] = [];
  const pattern = pathname
    .split("/")
    .map((segment) => (UUID.test(segment) ? `:${ids.push(segment) - 1}` : segment))
    .join("/");
  return { pattern, ids };
}

/** Note that the page at `pathname` asked for `key`. Called by `useApi` as queries mount. */
export function learnRouteQuery(pathname: string, key: ApiKey) {
  const now = Date.now();
  if (pathname !== openedPath) {
    openedPath = pathname;
    openedAt = now;
  }
  if (now - openedAt > LEARN_WINDOW_MS) return;

  const { pattern, ids } = parse(pathname);
  let entry = JSON.stringify(key);
  ids.forEach((id, i) => {
    entry = entry.split(id).join(`{{${i}}}`);
  });
  // Ids that aren't in the page's path belong to something the user picked; they don't generalize.
  if (UUID_ANYWHERE.test(entry)) return;

  const routes = load();
  const known = routes[pattern] ?? [];
  if (known[0] === entry) return;
  routes[pattern] = [entry, ...known.filter((k) => k !== entry)].slice(0, MAX_KEYS_PER_ROUTE);
  const patterns = Object.keys(routes);
  if (patterns.length > MAX_ROUTES) delete routes[patterns[0]];
  save();
}

/** The requests the page at `pathname` made last time, with this path's ids filled in. */
export function routeQueries(pathname: string): ApiKey[] {
  const { pattern, ids } = parse(pathname);
  const entries = load()[pattern] ?? [];
  return entries.map((entry) => {
    let filled = entry;
    ids.forEach((id, i) => {
      filled = filled.split(`{{${i}}}`).join(id);
    });
    return JSON.parse(filled) as ApiKey;
  });
}
