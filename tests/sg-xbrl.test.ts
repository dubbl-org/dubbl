import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildFsModel, type FsModel } from "@/lib/reports/fs-model";
import type { AccountAggregate } from "@/lib/reports/gl-query";
import { SG_MODULE } from "@/lib/tax/modules/sg";
import { SG_ACCOUNTS } from "@/lib/db/chart-templates/sg";
import { ELEMENTS, TEMPLATES } from "@/lib/reports/xbrl/taxonomy.generated";
import { countByKind, mappingFor } from "@/lib/reports/xbrl/mapping";
import { buildFacts } from "@/lib/reports/xbrl/facts";
import { buildInstanceXml } from "@/lib/reports/xbrl/instance";
import { buildExtension } from "@/lib/reports/xbrl/extension";
import { validate } from "@/lib/reports/xbrl/validate";
import { buildXbrlPackage, unzip, zipBuffer } from "@/lib/reports/xbrl/package";
import { sumWholeDollars, wholeDollars } from "@/lib/reports/xbrl/rounding";
import type { Fact, XbrlInput } from "@/lib/reports/xbrl/types";

/**
 * Golden test for the ACRA XBRL emitter. Everything here is pure: an
 * `XbrlInput` built from account balances, no database.
 */

const presentation = SG_MODULE.fsPresentation!;

function accounts(
  rows: [code: string, name: string, type: AccountAggregate["type"], subType: string, cents: number][]
): AccountAggregate[] {
  return rows.map(([code, name, type, subType, cents]) => ({
    accountId: code,
    code,
    name,
    type,
    subType,
    debit: type === "asset" || type === "expense" ? cents : 0,
    credit: type === "asset" || type === "expense" ? 0 : cents,
    balance: cents,
  }));
}

/** FY2026, balances chosen so independent rounding of the total differs by $1. */
const currentAccounts = accounts([
  ["1100", "Cash", "asset", "bank", 5_000_150],
  ["1200", "Receivables", "asset", "receivable", 1_200_050],
  ["1400", "Prepaid", "asset", "prepaid", 100_000],
  ["1700", "Equipment", "asset", "fixed", 3_000_000],
  ["1800", "Software", "asset", "intangible", 500_000],
  ["2100", "Payables", "liability", "current", 800_000],
  ["2220", "Tax payable", "liability", "tax", 200_000],
  ["2500", "Term loan", "liability", "non_current", 1_000_000],
  ["3000", "Share capital", "equity", "equity", 4_600_300],
  ["4000", "Sales", "revenue", "revenue", 12_000_000],
  ["5000", "Cost of sales", "expense", "cogs", 4_000_000],
  ["6110", "Salaries", "expense", "payroll", 3_000_000],
  ["5500", "Depreciation", "expense", "depreciation", 1_000_000],
  ["6160", "ACRA fees", "expense", "professional", 500_000],
  ["8200", "Income tax", "expense", "non_operating", 300_000],
]);

const priorAccounts = accounts([
  ["1100", "Cash", "asset", "bank", 4_000_000],
  ["1200", "Receivables", "asset", "receivable", 2_100_300],
  ["1700", "Equipment", "asset", "fixed", 3_000_000],
  ["2100", "Payables", "liability", "current", 500_000],
  ["2500", "Term loan", "liability", "non_current", 1_000_000],
  ["3000", "Share capital", "equity", "equity", 4_600_300],
  ["4000", "Sales", "revenue", "revenue", 8_000_000],
  ["5000", "Cost of sales", "expense", "cogs", 3_000_000],
  ["6110", "Salaries", "expense", "payroll", 2_000_000],
]);

const model = (list: AccountAggregate[]): FsModel => buildFsModel({ accounts: list, presentation });

function input(overrides: Partial<XbrlInput> = {}): XbrlInput {
  return {
    template: "sim",
    company: {
      name: "Test Trading Pte. Ltd.",
      uen: "202612345K",
      accountingStandard: "sfrs",
      sfpPresentation: "current-non-current",
      natureOfBusiness: "Software development",
      isSubsidiary: false,
      hasSubsidiaryAssociateOrJointVenture: false,
      moreThan50Employees: false,
      employees: 7,
    },
    period: {
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      priorStartDate: "2025-01-01",
      priorEndDate: "2025-12-31",
    },
    approvals: {
      authorisationDate: "2027-03-31",
      goingConcern: true,
      comparativeRestated: false,
      directorsTrueAndFair: true,
      directorsSolvent: true,
    },
    audit: {
      opinion: "Unqualified (clean) audit opinion",
      standards: "Singapore Standards on Auditing",
      goingConcernUncertainty: false,
      recordsKept: "Yes",
    },
    current: model(currentAccounts),
    prior: model(priorAccounts),
    ...overrides,
  };
}

const dollars = (facts: readonly Fact[], concept: string, period: "current" | "prior"): number | undefined =>
  facts.find((fact) => fact.concept === concept && fact.context.period === period)?.value as
    | number
    | undefined;

describe("sg xbrl emitter", () => {
  it("rounds every component to dollars and sums the components", () => {
    // Independent rounding: 9,800,200 cents is $98,002, but the five captions
    // round to 50,002 + 12,001 + 1,000 + 30,000 + 5,000 = $98,003.
    assert.equal(wholeDollars(9_800_200), 98_002);
    assert.equal(
      [5_000_150, 1_200_050, 100_000, 3_000_000, 500_000].reduce((sum, cents) => sum + wholeDollars(cents), 0),
      98_003
    );
    assert.equal(sumWholeDollars([50_002, 12_001, 1_000, 30_000, 5_000]), 98_003);
    // Symmetric around zero, so a loss does not round to a different magnitude.
    assert.equal(wholeDollars(-250), -3);
    assert.equal(wholeDollars(250), 3);
  });

  it("emits a Simplified instance with the mandatory DEI facts", () => {
    const { facts, issues } = buildFacts(input());
    const instance = buildInstanceXml({ fileName: "202612345K-2026-12-31", input: input(), facts });

    assert.ok(instance.startsWith('<?xml version="1.0" encoding="utf-8"?>'));
    assert.match(instance, /<link:schemaRef xlink:type="simple" xlink:href="202612345K-2026-12-31\.xsd" \/>/);
    assert.match(instance, /<xbrli:identifier scheme="http:\/\/www\.bizfinx\.gov\.sg\/UEN">202612345K<\/xbrli:identifier>/);
    assert.match(instance, /<sg-dei:NameOfCompany [^>]*>Test Trading Pte\. Ltd\.<\/sg-dei:NameOfCompany>/);
    assert.match(instance, /<sg-dei:TypeOfXBRLFiling [^>]*>Simplified XBRL<\/sg-dei:TypeOfXBRLFiling>/);
    assert.match(
      instance,
      /<sg-dei:TypeOfAccountingStandardUsedToPrepareFinancialStatements [^>]*>SFRS<\/sg-dei:TypeOfAccountingStandardUsedToPrepareFinancialStatements>/
    );
    assert.match(
      instance,
      /<sg-dei:TypeOfStatementOfFinancialPosition [^>]*>Current and non-current<\/sg-dei:TypeOfStatementOfFinancialPosition>/
    );
    assert.match(instance, /<sg-as:DateOfAuthorisationForIssueOfFinancialStatements [^>]*>2027-03-31</);
    assert.match(instance, /<sg-dei:WhetherFinancialStatementsArePreparedOnGoingConcernBasis [^>]*>Yes</);

    // Whole dollars for money, exact for counts.
    assert.match(instance, /<sg-as:Assets [^>]*unitRef="SGD" decimals="0">98003<\/sg-as:Assets>/);
    assert.match(instance, /<sg-as:NumberOfEmployeesOfCompany [^>]*unitRef="PURE" decimals="INF">7</);

    const contextIds = [...instance.matchAll(/<xbrli:context id="([^"]+)">/g)].map((m) => m[1]);
    assert.equal(new Set(contextIds).size, contextIds.length, "context ids must be unique");
    assert.ok(contextIds.includes("fromto_20260101_20261231"));
    assert.ok(contextIds.includes("asof_20261231"));
    assert.ok(contextIds.includes("fromto_20250101_20251231"));

    assert.deepEqual(issues, [], "a clean fixture raises no mapping issues");
  });

  it("reports statement totals that pass ACRA's own calculation arcs", () => {
    const { facts, scalars, issues } = buildFacts(input());
    assert.equal(dollars(facts, "sg-as:Assets", "current"), 98_003);
    assert.equal(dollars(facts, "sg-as:CurrentAssets", "current"), 63_003);
    assert.equal(dollars(facts, "sg-as:NoncurrentAssets", "current"), 35_000);
    assert.equal(dollars(facts, "sg-as:Liabilities", "current"), 20_000);
    assert.equal(dollars(facts, "sg-as:Equity", "current"), 78_003);
    assert.equal(dollars(facts, "sg-as:ShareCapital", "current"), 46_003);
    assert.equal(dollars(facts, "sg-as:AccumulatedProfitsLosses", "current"), 32_000);
    assert.equal(dollars(facts, "sg-as:Revenue", "current"), 120_000);
    assert.equal(dollars(facts, "sg-as:EmployeeBenefitsExpense", "current"), 30_000);
    assert.equal(dollars(facts, "sg-as:DepreciationExpense", "current"), 10_000);
    assert.equal(dollars(facts, "sg-as:OtherExpensesByNature", "current"), 48_000);
    assert.equal(dollars(facts, "sg-as:ProfitLossBeforeTaxation", "current"), 32_000);
    assert.equal(dollars(facts, "sg-as:ProfitLoss", "current"), 32_000);
    assert.equal(dollars(facts, "sg-as:Assets", "prior"), 91_003);

    const checks = validate({ input: input(), template: "sim", facts, scalars, issues });
    const genuine = checks.filter((issue) => issue.severity === "genuine");
    assert.deepEqual(genuine, [], "no genuine validation issues");
  });

  it("flags a deliberate sum mismatch as a genuine error", () => {
    const { facts, scalars, issues } = buildFacts(input());
    // A total that disagrees with its components by $1 is what an unrounded or
    // hand-typed figure looks like; BizFinx reports it as a genuine error.
    const broken = facts.map((fact) =>
      fact.concept === "sg-as:Assets" && fact.context.period === "current"
        ? { ...fact, value: (fact.value as number) + 1 }
        : fact
    );
    const found = validate({ input: input(), template: "sim", facts: broken, scalars, issues });
    const mismatch = found.find((issue) => issue.code === "Misc_040");
    assert.ok(mismatch, "the Assets total must be checked against CurrentAssets + NoncurrentAssets");
    assert.equal(mismatch.difference, 1);
    assert.equal(mismatch.severity, "genuine");
  });

  it("blocks a filing whose header is incomplete or whose prior period is missing", () => {
    const withoutPrior = buildFacts(input({ prior: undefined }));
    const noPrior = validate({
      input: input({ prior: undefined }),
      template: "sim",
      facts: withoutPrior.facts,
      scalars: withoutPrior.scalars,
      issues: withoutPrior.issues,
    });
    assert.ok(noPrior.some((issue) => issue.code === "Misc_006" && /Prior-period/.test(issue.message)));

    const badDate = buildFacts(input({ approvals: { ...input().approvals, authorisationDate: "" } }));
    const noDate = validate({
      input: input({ approvals: { ...input().approvals, authorisationDate: "" } }),
      template: "sim",
      facts: badDate.facts,
      scalars: badDate.scalars,
      issues: badDate.issues,
    });
    assert.ok(noDate.some((issue) => issue.code === "XBRL-DEI" && /authorisationDate/.test(issue.message)));
  });

  it("maps every concept each template presents, and nothing else", () => {
    const reportable = (template: "sim" | "full") => {
      const seen = new Set<string>();
      for (const section of TEMPLATES[template].sections) {
        for (const node of section.presentation) {
          const element = ELEMENTS[node.element];
          if (!element || element.abstract || element.type === "nonnum:domainItemType") continue;
          if (element.local.endsWith("Axis") || element.local.endsWith("Member")) continue;
          seen.add(node.element);
        }
      }
      return seen;
    };

    for (const template of ["sim", "full"] as const) {
      const rows = mappingFor(template);
      const mapped = new Set(rows.map((row) => row.element));
      const unmapped = [...reportable(template)].filter((concept) => !mapped.has(concept));
      assert.deepEqual(unmapped, [], `${template}: every presented concept needs a mapping row`);
      for (const row of rows) assert.ok(ELEMENTS[row.element], `${template}: ${row.element} is a taxonomy concept`);
    }

    // Distinct concepts per template (a concept presented in both SFP layouts
    // counts once). Every one of them has a row; the extra rows are the second
    // layout's concepts, mapped once per section.
    assert.equal(reportable("sim").size, 122);
    assert.equal(reportable("full").size, 195);
    assert.equal(new Set(mappingFor("sim").map((row) => row.element)).size, 122);
    assert.equal(new Set(mappingFor("full").map((row) => row.element)).size, 195);
    assert.deepEqual(countByKind(mappingFor("sim")), {
      captions: 34,
      scalar: 33,
      soce: 2,
      manual: 1,
      absent: 49,
      derived: 12,
    });
    assert.deepEqual(countByKind(mappingFor("full")), {
      captions: 36,
      scalar: 34,
      soce: 2,
      manual: 68,
      absent: 52,
      derived: 13,
    });
  });

  it("consumes every caption the SG chart can produce", () => {
    // One account per (type, subtag) pair the chart ships. A new chart line, or a
    // caption edit in the module, must show up here as an unmapped-caption error
    // instead of a figure silently missing from the filing.
    const perSubtag = new Map<string, AccountAggregate>();
    for (const template of SG_ACCOUNTS) {
      const key = `${template.type}.${template.subType ?? ""}`;
      if (perSubtag.has(key)) continue;
      perSubtag.set(key, {
        accountId: template.code,
        code: template.code,
        name: template.name,
        type: template.type,
        subType: template.subType ?? null,
        debit: 1_000,
        credit: 0,
        balance: 1_000,
      });
    }
    const wide = model([...perSubtag.values()]);
    const clean = input({ current: wide, prior: wide });
    const { issues } = buildFacts(clean);
    assert.deepEqual(issues.filter((issue) => issue.code === "XBRL-MAPPING"), []);
  });

  it("never emits a fact ACRA does not declare", () => {
    for (const template of ["sim", "full"] as const) {
      const { facts } = buildFacts(input({ template, fsTextBlock: template === "full" ? "<p>FS</p>" : undefined }));
      for (const fact of facts) assert.ok(ELEMENTS[fact.concept], `${fact.concept} is not declared`);
    }
  });

  it("carries a class dimension on the PP&E note and reports it in the extension", () => {
    const withClasses = input({
      template: "full",
      fsTextBlock: "<p>Complete financial statements</p>",
      classNotes: [
        {
          group: "note.ppe",
          member: "sg-as:MachineryAndOtherEquipmentMember",
          values: { "At cost": 2_000_000, "Carrying amount": 1_500_000 },
        },
      ],
    });
    const { facts } = buildFacts(withClasses);
    const classFact = facts.find(
      (fact) => fact.concept === "sg-as:PropertyPlantAndEquipment" && fact.context.dimension
    );
    assert.equal(classFact?.value, 15_000);
    assert.equal(classFact?.context.dimension?.axis, "sg-as:ClassesOfPropertyPlantAndEquipmentAxis");

    const instance = buildInstanceXml({ fileName: "202612345K-2026-12-31", input: withClasses, facts });
    assert.match(instance, /xbrldi:explicitMember dimension="sg-as:ClassesOfPropertyPlantAndEquipmentAxis">sg-as:MachineryAndOtherEquipmentMember/);
    assert.match(instance, /<xbrli:context id="asof_20261231_MachineryAndOtherEquipmentMember">/);
    // The statement carrying amount stays undimensioned and separate.
    assert.equal(dollars(facts, "sg-as:PropertyPlantAndEquipment", "current"), 30_000);
  });

  it("requires the FS text block for a Full filing", () => {
    const full = input({ template: "full" });
    const { facts, scalars, issues } = buildFacts(full);
    const found = validate({ input: full, template: "full", facts, scalars, issues });
    assert.ok(found.some((issue) => issue.code === "XBRL-TEXTBLOCK"));
  });

  it("imports the Small Entities framework when that standard is declared", () => {
    const sfrsSe = input({ template: "full", fsTextBlock: "<p>FS</p>" });
    sfrsSe.company.accountingStandard = "sfrs-se";
    const { facts } = buildFacts(sfrsSe);
    const extension = buildExtension({ fileName: "202612345K-2026-12-31", template: "full", input: sfrsSe, facts });
    const imports = extension.imports.join("\n");
    assert.match(imports, /\/sg-ee\/sg-ee-sfrs"/);
    assert.match(extension.xsd, /targetNamespace="http:\/\/www\.202612345k\.com\/202612345k-2026-12-31"/);
    assert.match(extension.xsd, /<link:roleType roleURI="[^"]+\/role\/SFPCurrentNonCurrent" id="SFPCurrentNonCurrent">/);
    assert.match(extension.presentationXml, /xlink:arcrole="http:\/\/www\.xbrl\.org\/2003\/arcrole\/parent-child"/);
    assert.match(extension.calculationXml, /weight="-1"/);
    // ACRA's structure is borrowed, never invented: every locator resolves to a
    // declared concept in a committed schema.
    for (const match of extension.presentationXml.matchAll(/xlink:href="Taxonomy2026\/([^#]+)#([^"]+)"/g)) {
      assert.ok(match[1].startsWith("elts/"), `unexpected schema ${match[1]}`);
      assert.ok(match[2].includes("_"), `locator ${match[2]} should be a concept id`);
    }
  });

  it("zips the instance, the extension and the referenced taxonomy", () => {
    const pkg = buildXbrlPackage(input());
    const zip = zipBuffer(pkg.files);
    const read = unzip(zip);

    assert.equal(read.size, pkg.files.length);
    assert.ok(read.has("202612345K-2026-12-31.xbrl"));
    assert.equal(read.get("202612345K-2026-12-31.xsd"), pkg.extensionXsd);
    assert.ok(
      read.has("Taxonomy2026/elts/sg-as-cor_2026-01-01.xsd"),
      "the element schema the instance references must be in the zip"
    );
    assert.ok(read.has("Taxonomy2026/fr/sg-sim/sg-sim_2026-01-01_cal.xml"));
    assert.ok(
      ![...read.keys()].some((name) => name.includes("/formula/")),
      "ACRA's validation formulas are not part of the uploaded package"
    );
    assert.ok(zip.length < 2_000_000, `zip is ${zip.length} bytes`);

    const instance = read.get("202612345K-2026-12-31.xbrl")!;
    assert.match(instance, /<\/xbrli:xbrl>/);
    assert.equal((instance.match(/<xbrli:context /g) ?? []).length, (instance.match(/<\/xbrli:context>/g) ?? []).length);
  });
});
