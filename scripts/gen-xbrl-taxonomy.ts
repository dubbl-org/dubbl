/**
 * Regenerates `lib/reports/xbrl/taxonomy.generated.ts` from the committed ACRA
 * taxonomy package in `assets/xbrl/acra-2026`.
 *
 * Run manually after dropping a new taxonomy version into assets:
 *   npx tsx scripts/gen-xbrl-taxonomy.ts
 *
 * The output is committed, so a taxonomy bump is a reviewable diff: element
 * table, presentation order, calculation checks and dimension arcs all change
 * together with the version string and the source hashes.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(process.cwd(), "assets/xbrl/acra-2026");
const OUT = join(process.cwd(), "lib/reports/xbrl/taxonomy.generated.ts");

/** Framework directory -> the entry point it belongs to. */
const FRAMEWORKS = [
  { template: "sim", dir: "fr/sg-sim", entryPoint: "elts/sg-sim-ent_2026-01-01.xsd" },
  { template: "full", dir: "fr/sg-sfrs", entryPoint: "elts/sg-sfrs-ent_2026-01-01.xsd" },
] as const;

const VERSION = "2026-01-01";

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(join(ROOT, path))).digest("hex");
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...walk(rel));
    else out.push(rel);
  }
  return out.sort();
}

function attrs(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of source.matchAll(/([\w:-]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

// ---- element declarations -------------------------------------------------

interface SchemaInfo {
  path: string;
  namespace: string;
  prefix: string;
}

const schemas: SchemaInfo[] = [];
const elements = new Map<
  string,
  {
    id: string;
    prefix: string;
    local: string;
    type: string;
    abstract: boolean;
    periodType: "instant" | "duration";
    balance?: "debit" | "credit";
    label?: string;
  }
>();

for (const path of walk("elts").filter((p) => p.endsWith(".xsd"))) {
  const xml = read(path);
  const open = /<xsd?:schema\b/.exec(xml);
  const root = open ? attrs(xml.slice(open.index, xml.indexOf(">", open.index) + 1)) : {};
  const namespace = root.targetNamespace;
  if (!namespace) continue;
  const prefixEntry = Object.entries(root).find(
    ([key, value]) => key.startsWith("xmlns:") && value === namespace
  );
  const prefix = prefixEntry ? prefixEntry[0].slice("xmlns:".length) : "";
  if (prefix) schemas.push({ path, namespace, prefix });
  for (const m of xml.matchAll(/<xs[d]?:element\s([^>]*?)\/?>/g)) {
    const a = attrs(m[1]);
    if (!a.id || !a.name) continue;
    elements.set(a.id, {
      id: a.id,
      prefix,
      local: a.name,
      type: a.type ?? "",
      abstract: a.abstract === "true",
      periodType: a["xbrli:periodType"] === "instant" ? "instant" : "duration",
      balance:
        a["xbrli:balance"] === "debit" || a["xbrli:balance"] === "credit"
          ? a["xbrli:balance"]
          : undefined,
      label: undefined,
    });
  }
}

// ---- labels ---------------------------------------------------------------

for (const path of walk("labels").filter((p) => p.endsWith(".xml"))) {
  for (const m of read(path).matchAll(/<link:label\s([^>]*?)>([\s\S]*?)<\/link:label>/g)) {
    const a = attrs(m[1]);
    if (a["xlink:role"] !== "http://www.xbrl.org/2003/role/label") continue;
    const id = (a["xlink:label"] ?? "").replace(/^label_/, "");
    const element = elements.get(id);
    if (!element) continue;
    element.label = decodeXml(m[2]).replace(/\s+/g, " ").trim();
  }
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function key(id: string): string {
  const element = elements.get(id);
  if (!element) throw new Error(`unknown concept id ${id}`);
  return `${element.prefix}:${element.local}`;
}

// ---- presentation / calculation / definition linkbases --------------------

function locators(body: string): Map<string, string> {
  // xlink:label -> concept id; the same concept can appear twice (_2 suffix).
  const out = new Map<string, string>();
  for (const m of body.matchAll(/<link:loc\s([^>]*?)\/?>/g)) {
    const a = attrs(m[1]);
    const href = (a["xlink:href"] ?? "").split("#")[1];
    if (href && a["xlink:label"]) out.set(a["xlink:label"], href);
  }
  return out;
}

interface Arc {
  from: string;
  to: string;
  order: number;
  arcrole: string;
  weight?: number;
}

function arcs(body: string, name: string): Arc[] {
  const out: Arc[] = [];
  for (const m of body.matchAll(new RegExp(`<link:${name}\\s([^>]*?)\\/?>`, "g"))) {
    const a = attrs(m[1]);
    out.push({
      from: a["xlink:from"],
      to: a["xlink:to"],
      order: Number(a.order ?? 1),
      arcrole: (a["xlink:arcrole"] ?? "").split("/").pop() ?? "",
      weight: a.weight === undefined ? undefined : Number(a.weight),
    });
  }
  return out;
}

function links(xml: string, name: string): { role: string; body: string }[] {
  const out: { role: string; body: string }[] = [];
  const re = new RegExp(`<link:${name}\\s[^>]*xlink:role="([^"]+)"([\\s\\S]*?)</link:${name}>`, "g");
  for (const m of xml.matchAll(re)) out.push({ role: m[1], body: m[2] });
  return out;
}

interface Template {
  entryPoint: string;
  framework: string;
  roleNamespace: string;
  roles: { role: string; roleUri: string; definition: string; order: number }[];
  sections: {
    role: string;
    roleUri: string;
    definition: string;
    order: number;
    presentation: { element: string; depth: number; order: number }[];
  }[];
  checks: { role: string; parent: string; children: { element: string; weight: number }[] }[];
  dimensions: { role: string; arcrole: string; from: string; to: string; order: number }[];
}

const templates: Record<string, Template> = {};

for (const framework of FRAMEWORKS) {
  const files = walk(framework.dir);
  const prePath = files.find((p) => p.endsWith("_pre.xml"))!;
  const calPath = files.find((p) => p.endsWith("_cal.xml"))!;
  const defPath = files.find((p) => p.endsWith("_def.xml"))!;
  const elrPath = files.find((p) => p.endsWith("_elr.xsd"))!;

  const roles = new Map<string, { roleUri: string; definition: string; order: number }>();
  for (const m of read(elrPath).matchAll(/<link:roleType\s([^>]*?)>([\s\S]*?)<\/link:roleType>/g)) {
    const a = attrs(m[1]);
    const definition = decodeXml(/<link:definition>([\s\S]*?)<\/link:definition>/.exec(m[2])?.[1] ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const numbered = /^\[(\d+)\]/.exec(definition);
    roles.set(a.roleURI, {
      roleUri: a.roleURI,
      definition,
      order: numbered ? Number(numbered[1]) : Number.MAX_SAFE_INTEGER,
    });
  }

  const sections: Template["sections"] = [];
  for (const link of links(read(prePath), "presentationLink")) {
    const role = roles.get(link.role);
    if (!role) throw new Error(`${prePath}: unmapped role ${link.role}`);
    const locs = locators(link.body);
    const tree = arcs(link.body, "presentationArc");
    const children = new Map<string, typeof tree>();
    for (const arc of tree) {
      children.set(arc.from, [...(children.get(arc.from) ?? []), arc]);
    }
    const childLabels = new Set(tree.map((a) => a.to));
    const presentation: { element: string; depth: number; order: number }[] = [];
    const walkNode = (label: string, depth: number, order: number) => {
      const id = locs.get(label);
      if (!id) return;
      presentation.push({ element: key(id), depth, order });
      const kids = (children.get(label) ?? []).sort((a, b) => a.order - b.order);
      kids.forEach((kid, index) => walkNode(kid.to, depth + 1, index + 1));
    };
    [...locs.keys()]
      .filter((label) => !childLabels.has(label))
      .forEach((label, index) => walkNode(label, 0, index + 1));
    sections.push({
      role: role.roleUri.split("/role/").pop()!,
      roleUri: role.roleUri,
      definition: role.definition,
      order: role.order,
      presentation,
    });
  }
  sections.sort((a, b) => a.order - b.order || a.role.localeCompare(b.role));

  const checks: Template["checks"] = [];
  for (const link of links(read(calPath), "calculationLink")) {
    const locs = locators(link.body);
    const grouped = new Map<string, { element: string; weight: number }[]>();
    for (const arc of arcs(link.body, "calculationArc").sort((a, b) => a.order - b.order)) {
      const parent = locs.get(arc.from);
      const child = locs.get(arc.to);
      if (!parent || !child) continue;
      grouped.set(parent, [
        ...(grouped.get(parent) ?? []),
        { element: key(child), weight: arc.weight ?? 1 },
      ]);
    }
    const role = link.role.split("/role/").pop()!;
    for (const [parent, children] of grouped) {
      checks.push({ role, parent: key(parent), children });
    }
  }

  const dimensions: Template["dimensions"] = [];
  for (const link of links(read(defPath), "definitionLink")) {
    const locs = locators(link.body);
    const role = link.role.split("/role/").pop()!;
    for (const arc of arcs(link.body, "definitionArc")) {
      const from = locs.get(arc.from);
      const to = locs.get(arc.to);
      if (!from || !to) continue;
      dimensions.push({
        role,
        arcrole: arc.arcrole,
        from: key(from),
        to: key(to),
        order: arc.order,
      });
    }
  }

  templates[framework.template] = {
    entryPoint: framework.entryPoint,
    framework: framework.dir,
    roleNamespace: `http://www.bizfinx.gov.sg/taxonomy/${VERSION}/${framework.dir.split("/")[1]}`,
    roles: [...roles.values()]
      .map((role) => ({
        role: role.roleUri.split("/role/").pop()!,
        roleUri: role.roleUri,
        definition: role.definition,
        order: role.order,
      }))
      .sort((a, b) => a.order - b.order || a.role.localeCompare(b.role)),
    sections,
    checks,
    dimensions,
  };
}

// ---- emit -----------------------------------------------------------------

const source = [
  ...FRAMEWORKS.flatMap((f) => walk(f.dir).filter((p) => p.endsWith(".xml") || p.endsWith(".xsd"))),
  ...walk("elts").filter((p) => p.endsWith(".xsd")),
  ...walk("labels").filter((p) => p.endsWith(".xml")),
];

const used = [
  ...new Set(
    Object.values(templates).flatMap((t) => [
      ...t.sections.flatMap((s) => s.presentation.map((n) => n.element)),
      ...t.checks.flatMap((c) => [c.parent, ...c.children.map((ch) => ch.element)]),
      ...t.dimensions.flatMap((d) => [d.from, d.to]),
    ])
  ),
].sort();

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

const elementLines = used
  .map((concept) => {
    const [prefix, local] = concept.split(":");
    const found = [...elements.values()].find((e) => e.prefix === prefix && e.local === local);
    if (!found) throw new Error(`no declaration for ${concept}`);
    return `  ${JSON.stringify(concept)}: ${json({
      local: found.local,
      prefix: found.prefix,
      id: found.id,
      type: found.type,
      abstract: found.abstract,
      periodType: found.periodType,
      ...(found.balance ? { balance: found.balance } : {}),
      ...(found.label ? { label: found.label } : {}),
    }).replace(/\n/g, "\n  ")},`;
  })
  .join("\n");

const schemaLines = schemas
  .map((s) => `  ${JSON.stringify(s.prefix)}: { path: ${JSON.stringify(s.path)}, namespace: ${JSON.stringify(s.namespace)} },`)
  .join("\n");

const templateLines = Object.entries(templates)
  .map(([name, t]) => `  ${name}: ${json(t).replace(/\n/g, "\n  ")},`)
  .join("\n");

const output = `/**
 * ACRA taxonomy, generated — do not edit by hand.
 *
 * Regenerate with: npx tsx scripts/gen-xbrl-taxonomy.ts
 * Package: ACRA Taxonomy 2026 v1.0 (go.gov.sg/acrataxonomyzip)
 * Taxonomy version: ${VERSION}
 *
 * Source hashes are recorded so a silent change to the committed taxonomy is a
 * diff, not a surprise at filing time.
 */
import type { TaxonomyElement, TaxonomyTemplate, TaxonomyTemplateInfo } from "./types";

export const TAXONOMY_VERSION = ${JSON.stringify(VERSION)};

export const TAXONOMY_SOURCES: { path: string; sha256: string }[] = ${json(
  source.map((path) => ({ path, sha256: sha256(path) }))
).replace(/\n/g, "\n")};

/** Element table: "prefix:LocalName" -> declaration (balance/period type drive fact emission). */
export const ELEMENTS: Record<string, TaxonomyElement> = {
${elementLines}
};

/** Element namespace prefix -> the schema file that declares it, relative to the taxonomy root. */
export const ELEMENT_SCHEMAS: Record<string, { path: string; namespace: string }> = {
${schemaLines}
};

export const TEMPLATES: Record<TaxonomyTemplate, TaxonomyTemplateInfo> = {
${templateLines}
};
`;

writeFileSync(OUT, output);

const report = Object.entries(templates)
  .map(
    ([name, t]) =>
      `${name}: ${t.sections.length} sections, ${t.sections.reduce((n, s) => n + s.presentation.length, 0)} nodes, ${t.checks.reduce((n, c) => n + c.children.length, 0)} calc arcs, ${t.dimensions.length} def arcs`
  )
  .join("\n");
console.log(`wrote ${relative(process.cwd(), OUT)} (${elements.size} declared elements)\n${report}`);
