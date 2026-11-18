/**
 * Company extension: the schema the instance points at, plus the three
 * linkbases that give it ACRA's presentation, calculation and dimension
 * structure under company-specific roleURIs — the shape the BizFinx prep tool
 * produces for a filing.
 *
 * The linkbases borrow ACRA's *structure*; they never invent concepts, so a
 * concept the taxonomy does not declare cannot appear.
 */
import type { Fact, TaxonomyTemplate, XbrlInput } from "./types";
import { ELEMENT_SCHEMAS, ELEMENTS, TEMPLATES, TAXONOMY_VERSION } from "./taxonomy.generated";

export interface ExtensionParams {
  fileName: string;
  template: TaxonomyTemplate;
  input: XbrlInput;
  facts: readonly Fact[];
}

export interface ExtensionFiles {
  xsd: string;
  presentationXml: string;
  calculationXml: string;
  definitionXml: string;
  /** Namespaces imported by the schema, in document order. */
  imports: string[];
}

const XBRLLI = "http://www.xbrl.org/2003/instance";
const XBRLDT = "http://xbrl.org/2005/xbrldt";
const ARCROLES = {
  "parent-child": "http://www.xbrl.org/2003/arcrole/parent-child",
  "summation-item": "http://www.xbrl.org/2003/arcrole/summation-item",
  all: "http://xbrl.org/2005/xbrldt#all",
  "hypercube-dimension": "http://xbrl.org/2005/xbrldt#hypercube-dimension",
  "domain-member": "http://xbrl.org/2005/xbrldt#domain-member",
  "dimension-domain": "http://xbrl.org/2005/xbrldt#dimension-domain",
  "dimension-default": "http://xbrl.org/2005/xbrldt#dimension-default",
} as const;

export function extensionUrl(input: XbrlInput): string {
  const uen = input.company.uen.toLowerCase();
  return `http://www.${uen}.com/${uen}-${input.period.endDate}`;
}

function roleUri(input: XbrlInput, role: string): string {
  return `${extensionUrl(input)}/role/${role}`;
}

/** Copy of ACRA's role definition string, with the company's role id in front. */
function roleDefinitions(input: XbrlInput): { role: string; uri: string; definition: string; usedOn: string[] }[] {
  const template = TEMPLATES[input.template];
  return template.roles.map((role) => ({
    role: role.role,
    uri: roleUri(input, role.role),
    definition: role.definition,
    usedOn: usedOnFor(input.template, role.role),
  }));
}

function usedOnFor(template: TaxonomyTemplate, role: string): string[] {
  const info = TEMPLATES[template];
  const used: string[] = [];
  if (info.sections.some((section) => section.role === role)) used.push("link:presentationLink");
  if (info.checks.some((check) => check.role === role)) used.push("link:calculationLink");
  if (info.dimensions.some((arc) => arc.role === role)) used.push("link:definitionLink");
  return used;
}

function locator(concept: string, taxonomyDir: string, index: number): string {
  const [prefix, local] = concept.split(":");
  const element = ELEMENTS[concept];
  const schema = ELEMENT_SCHEMAS[prefix];
  if (!element || !schema) throw new Error(`unknown element ${concept}`);
  const href = `${taxonomyDir}/${schema.path}#${element.id}`;
  return `    <link:loc xlink:type="locator" xlink:href="${href}" xlink:label="loc_${index}" xlink:title="${local}"/>`;
}

export function buildExtension({ fileName, template, input, facts }: ExtensionParams): ExtensionFiles {
  const taxonomyDir = "Taxonomy2026";
  const info = TEMPLATES[template];
  const roles = roleDefinitions(input);
  const roleBySection = new Map(info.sections.map((section) => [section.role, section]));

  const prefixesInUse = new Set<string>();
  for (const section of info.sections) {
    for (const node of section.presentation) prefixesInUse.add(node.element.split(":")[0]);
  }
  for (const fact of facts) prefixesInUse.add(fact.concept.split(":")[0]);

  const imports: string[] = [
    `<xsd:import namespace="${XBRLLI}" schemaLocation="http://www.xbrl.org/2003/xbrl-instance-2003-12-31.xsd"/>`,
    `<xsd:import namespace="${XBRLDT}" schemaLocation="http://www.xbrl.org/2005/xbrldt-2005.xsd"/>`,
  ];
  for (const prefix of [...prefixesInUse].sort()) {
    if (prefix === "xbrli" || prefix === "xbrldi") continue;
    const schema = ELEMENT_SCHEMAS[prefix];
    if (schema) {
      imports.push(`<xsd:import namespace="${schema.namespace}" schemaLocation="${taxonomyDir}/${schema.path}"/>`);
    }
  }
  if (input.company.accountingStandard === "sfrs-se") {
    // SFRS for Small Entities disclosures live in their own element framework;
    // importing it only when the standard is declared keeps the DTS honest.
    const ee = Object.values(ELEMENT_SCHEMAS).find((schema) => schema.namespace.includes("/sg-ee/"));
    if (ee) imports.push(`<xsd:import namespace="${ee.namespace}" schemaLocation="${taxonomyDir}/${ee.path}"/>`);
  }
  const frameworkPrefix = info.framework.split("/")[1];
  imports.push(
    `<xsd:import namespace="${info.roleNamespace}-rol" schemaLocation="${taxonomyDir}/${info.framework}/${frameworkPrefix}_${TAXONOMY_VERSION}_elr.xsd"/>`
  );

  const roleTypeXml = roles
    .map(
      (role) =>
        `      <link:roleType roleURI="${role.uri}" id="${role.role}">\n        <link:definition>${role.definition}</link:definition>\n${role.usedOn
          .map((tag) => `        <link:usedOn>${tag}</link:usedOn>`)
          .join("\n")}${role.usedOn.length ? "\n" : ""}      </link:roleType>`
    )
    .join("\n");

  const declaredPrefixes = [...prefixesInUse]
    .filter((prefix) => !["xbrli", "xbrldi"].includes(prefix))
    .map((prefix) => {
      const schema = ELEMENT_SCHEMAS[prefix];
      return schema ? `xmlns:${prefix}="${schema.namespace}"` : "";
    })
    .filter(Boolean);

  const xsd = `<?xml version="1.0" encoding="utf-8"?>
<xsd:schema targetNamespace="${extensionUrl(input)}" elementFormDefault="qualified" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:link="http://www.xbrl.org/2003/linkbase" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xbrli="${XBRLLI}" xmlns:xbrldt="${XBRLDT}" ${declaredPrefixes.join(" ")}>
  <xsd:annotation>
    <xsd:appinfo>
      <link:linkbaseRef xlink:type="simple" xlink:href="${fileName}_pre.xml" xlink:role="http://www.xbrl.org/2003/role/presentationLinkbaseRef" xlink:arcrole="http://www.w3.org/1999/xlink/properties/linkbase"/>
      <link:linkbaseRef xlink:type="simple" xlink:href="${fileName}_cal.xml" xlink:role="http://www.xbrl.org/2003/role/calculationLinkbaseRef" xlink:arcrole="http://www.w3.org/1999/xlink/properties/linkbase"/>
      <link:linkbaseRef xlink:type="simple" xlink:href="${fileName}_def.xml" xlink:role="http://www.xbrl.org/2003/role/definitionLinkbaseRef" xlink:arcrole="http://www.w3.org/1999/xlink/properties/linkbase"/>
      <link:linkbaseRef xlink:type="simple" xlink:href="${taxonomyDir}/${info.framework}/${frameworkPrefix}_${TAXONOMY_VERSION}_lab.xml" xlink:role="http://www.xbrl.org/2003/role/labelLinkbaseRef" xlink:arcrole="http://www.w3.org/1999/xlink/properties/linkbase"/>
${roleTypeXml}
    </xsd:appinfo>
  </xsd:annotation>
${imports.map((line) => `  ${line}`).join("\n")}
</xsd:schema>
`;

  const linkbaseHeader = `<?xml version="1.0" encoding="utf-8"?>
<link:linkbase xmlns:link="http://www.xbrl.org/2003/linkbase" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xbrli="${XBRLLI}" xmlns:xbrldt="${XBRLDT}">`;

  const presentation: string[] = [];
  for (const section of info.sections) {
    const role = roleBySection.get(section.role);
    if (!role) continue;
    const uri = roleUri(input, section.role);
    const locs: string[] = [];
    const arcs: string[] = [];
    section.presentation.forEach((node, index) => {
      locs.push(locator(node.element, taxonomyDir, index));
      const parent = parentIndex(section.presentation, index);
      if (parent === undefined) return;
      arcs.push(
        `    <link:presentationArc xlink:type="arc" xlink:arcrole="${ARCROLES["parent-child"]}" xlink:from="loc_${parent}" xlink:to="loc_${index}" xlink:title="presentation: ${node.element}" order="${node.order}"/>`
      );
    });
    presentation.push(
      `  <link:roleRef roleURI="${uri}" xlink:type="simple" xlink:href="${fileName}.xsd#${section.role}"/>\n  <link:presentationLink xlink:type="extended" xlink:role="${uri}">\n${[
        ...locs,
        ...arcs,
      ].join("\n")}\n  </link:presentationLink>`
    );
  }

  const calculations: string[] = [];
  const checksByRole = new Map<string, typeof info.checks>();
  for (const check of info.checks) {
    checksByRole.set(check.role, [...(checksByRole.get(check.role) ?? []), check]);
  }
  for (const [role, checks] of checksByRole) {
    const uri = roleUri(input, role);
    const locs: string[] = [];
    const arcs: string[] = [];
    const label = new Map<string, string>();
    let index = 0;
    const addLocator = (concept: string): string => {
      if (!label.has(concept)) {
        label.set(concept, `loc_${index}`);
        locs.push(locator(concept, taxonomyDir, index));
        index += 1;
      }
      return label.get(concept)!;
    };
    for (const check of checks) {
      const from = addLocator(check.parent);
      check.children.forEach((child, order) => {
        const to = addLocator(child.element);
        arcs.push(
          `    <link:calculationArc xlink:type="arc" xlink:arcrole="${ARCROLES["summation-item"]}" xlink:from="${from}" xlink:to="${to}" xlink:title="calculation: ${check.parent}" order="${
            order + 1
          }" weight="${child.weight}"/>`
        );
      });
    }
    calculations.push(
      `  <link:roleRef roleURI="${uri}" xlink:type="simple" xlink:href="${fileName}.xsd#${role}"/>\n  <link:calculationLink xlink:type="extended" xlink:role="${uri}">\n${[
        ...locs,
        ...arcs,
      ].join("\n")}\n  </link:calculationLink>`
    );
  }

  const dimensions: string[] = [];
  const dimsByRole = new Map<string, typeof info.dimensions>();
  for (const arc of info.dimensions) {
    dimsByRole.set(arc.role, [...(dimsByRole.get(arc.role) ?? []), arc]);
  }
  for (const [role, arcs] of dimsByRole) {
    const uri = roleUri(input, role);
    const locs: string[] = [];
    const label = new Map<string, string>();
    let index = 0;
    const addLocator = (concept: string): string => {
      if (!label.has(concept)) {
        label.set(concept, `loc_${index}`);
        locs.push(locator(concept, taxonomyDir, index));
        index += 1;
      }
      return label.get(concept)!;
    };
    const arcXml = arcs.map((arc) => {
      const from = addLocator(arc.from);
      const to = addLocator(arc.to);
      return `    <link:definitionArc xlink:type="arc" xlink:arcrole="${
        ARCROLES[arc.arcrole as keyof typeof ARCROLES] ?? ARCROLES["domain-member"]
      }" xlink:from="${from}" xlink:to="${to}" xlink:title="${arc.arcrole}" order="${arc.order}"/>`;
    });
    dimensions.push(
      `  <link:roleRef roleURI="${uri}" xlink:type="simple" xlink:href="${fileName}.xsd#${role}"/>\n  <link:definitionLink xlink:type="extended" xlink:role="${uri}">\n${[
        ...locs,
        ...arcXml,
      ].join("\n")}\n  </link:definitionLink>`
    );
  }

  return {
    xsd,
    presentationXml: `${linkbaseHeader}\n${presentation.join("\n")}\n</link:linkbase>\n`,
    calculationXml: `${linkbaseHeader}\n${calculations.join("\n")}\n</link:linkbase>\n`,
    definitionXml: `${linkbaseHeader}\n${dimensions.join("\n")}\n</link:linkbase>\n`,
    imports,
  };
}

/** Nearest preceding node one level up is the parent in a flat presentation list. */
function parentIndex(
  nodes: { depth: number }[],
  index: number
): number | undefined {
  if (nodes[index].depth === 0) return undefined;
  for (let i = index - 1; i >= 0; i--) {
    if (nodes[i].depth === nodes[index].depth - 1) return i;
  }
  return undefined;
}
