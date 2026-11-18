/**
 * The instance document (`.xbrl`).
 *
 * One context per (period, dimension) pair rather than one per fact, and one
 * unit per measure: BizFinx reports duplicate contexts and unused units as
 * errors, so the sets are collected from the facts rather than predicted.
 */
import type { Fact, FactContext, FactDimension, XbrlInput } from "./types";
import { ELEMENTS, ELEMENT_SCHEMAS } from "./taxonomy.generated";

export interface InstanceParams {
  /** Base name of the company extension, e.g. "199050000Z-2024-12-31". */
  fileName: string;
  input: XbrlInput;
  facts: readonly Fact[];
}

const compactor = (isoDate: string): string => isoDate.replace(/-/g, "");

function periodDates(context: FactContext, input: XbrlInput) {
  const { period } = input;
  return context.period === "current"
    ? { startDate: period.startDate, endDate: period.endDate }
    : { startDate: period.priorStartDate, endDate: period.priorEndDate };
}

/** Stable context id, matching the BizFinx prep tool's naming. */
export function contextId(context: FactContext, input: XbrlInput): string {
  const { startDate, endDate } = periodDates(context, input);
  const base = context.instant ? `asof_${compactor(endDate)}` : `fromto_${compactor(startDate)}_${compactor(endDate)}`;
  if (!context.dimension) return base;
  return `${base}_${context.dimension.member.split(":").pop()}`;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Text blocks arrive as RTF/HTML; CDATA keeps them readable for the validator. */
function textValue(value: string): string {
  if (value.includes("<")) return `<![CDATA[${value.replace(/]]>/g, "]]&gt;")}]]>`;
  return escapeXml(value);
}

export function buildInstanceXml({ fileName, input, facts }: InstanceParams): string {
  const contexts = new Map<string, { context: FactContext; dimension?: FactDimension }>();
  const units = new Map<string, string>();
  const prefixes = new Set<string>(["xbrli", "link", "xlink", "iso4217", "xbrldi"]);

  for (const fact of facts) {
    const id = contextId(fact.context, input);
    if (!contexts.has(id)) contexts.set(id, { context: fact.context });
    if (fact.unit === "SGD") units.set("SGD", "iso4217:SGD");
    if (fact.unit === "PURE") units.set("PURE", "xbrli:pure");
    prefixes.add(fact.concept.split(":")[0]);
  }

  const namespaceOf = (prefix: string): string => ELEMENT_SCHEMAS[prefix]?.namespace ?? "";

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="utf-8"?>');
  const namespaces = [...prefixes]
    .map((prefix) => {
      if (prefix === "xbrli") return 'xmlns:xbrli="http://www.xbrl.org/2003/instance"';
      if (prefix === "link") return 'xmlns:link="http://www.xbrl.org/2003/linkbase"';
      if (prefix === "xlink") return 'xmlns:xlink="http://www.w3.org/1999/xlink"';
      if (prefix === "iso4217") return 'xmlns:iso4217="http://www.xbrl.org/2003/iso4217"';
      if (prefix === "xbrldi") return 'xmlns:xbrldi="http://xbrl.org/2006/xbrldi"';
      const uri = namespaceOf(prefix);
      return uri ? `xmlns:${prefix}="${uri}"` : "";
    })
    .filter(Boolean);
  lines.push(`<xbrli:xbrl ${namespaces.join(" ")}>`);
  lines.push(`<link:schemaRef xlink:type="simple" xlink:href="${fileName}.xsd" />`);

  const entity = `    <xbrli:entity>\n      <xbrli:identifier scheme="http://www.bizfinx.gov.sg/UEN">${escapeXml(
    input.company.uen
  )}</xbrli:identifier>\n    </xbrli:entity>`;
  for (const [id, { context }] of contexts) {
    const { startDate, endDate } = periodDates(context, input);
    const per = context.instant
      ? `      <xbrli:instant>${endDate}</xbrli:instant>`
      : `      <xbrli:startDate>${startDate}</xbrli:startDate>\n      <xbrli:endDate>${endDate}</xbrli:endDate>`;
    const scenario = context.dimension
      ? `\n    <xbrli:scenario>\n      <xbrldi:explicitMember dimension="${context.dimension.axis}">${context.dimension.member}</xbrldi:explicitMember>\n    </xbrli:scenario>`
      : "";
    lines.push(
      `<xbrli:context id="${id}">\n${entity}\n    <xbrli:period>\n${per}\n    </xbrli:period>${scenario}\n  </xbrli:context>`
    );
  }

  for (const [id, measure] of units) {
    lines.push(`<xbrli:unit id="${id}">\n  <xbrli:measure>${measure}</xbrli:measure>\n</xbrli:unit>`);
  }

  for (const fact of facts) {
    const id = contextId(fact.context, input);
    const unit = fact.unit ? ` unitRef="${fact.unit}"` : "";
    const decimals = fact.decimals ? ` decimals="${fact.decimals}"` : "";
    const value = typeof fact.value === "number" ? String(fact.value) : textValue(fact.value);
    // A fact whose concept ACRA does not declare would fail schema validation;
    // facts.ts only emits declared concepts, and buildFacts skips the rest.
    if (!ELEMENTS[fact.concept]) continue;
    lines.push(`<${fact.concept} contextRef="${id}"${unit}${decimals}>${value}</${fact.concept}>`);
  }

  lines.push("</xbrli:xbrl>");
  return `${lines.join("\n")}\n`;
}
