// Docs screenshots, one file per area in scripts/docs-shots/. Each file exports
// `shots`, an array of:
//
//   {
//     name: "invoices",                 // file name, and <Shot name="invoices" />
//     path: "/sales",                   // where to open (signed in to the demo company)
//     follow: "^/sales/[0-9a-f-]{36}$", // optional: then open the first link matching this
//     followText: "Overdue",            // optional: ...whose row mentions this text
//     actions: [                        // optional, in order; each waits for the page to settle
//       { click: "text=New invoice" },  // CSS selector, or text=Label (smallest visible match)
//       { type: "Acme", into: "input[placeholder^=Search]" },
//       { press: "Escape" }, { hover: "..." }, { waitFor: "text=Saved" },
//       { scroll: "text=Payments" }, { eval: "js in the page" },
//     ],
//     clip: "[role=dialog]",            // optional: capture one element instead of the screen
//     padding: 16,                      // around `clip`
//     clipClosest: 2,                   // optional: widen `clip` to an ancestor (levels up, or a selector)
//     marks: [                          // optional numbered callouts for <Shot pins />
//       { target: "text=Overdue", closest: 2, label: "Overdue invoices, at a glance" },
//     ],
//
// To pick a `closest`, print what a target finds and its ancestors:
//   node scripts/docs-shots.mjs --inspect /sales "text=Customers owe you"
//     viewport: { height: 1100 },       // optional, default 1440 x 900
//     theme: "dark",                    // optional, default light
//   }

import { readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const dir = path.join(import.meta.dirname, "docs-shots");
const files = readdirSync(dir).filter((f) => f.endsWith(".mjs")).sort();

export const shots = (
  await Promise.all(files.map(async (f) => (await import(pathToFileURL(path.join(dir, f)).href)).shots ?? []))
).flat();
