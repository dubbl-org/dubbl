/**
 * Contracts for the ACRA XBRL emitter.
 *
 * The layer is pure: an assembler collects `XbrlInput` from the database (later,
 * in a route), everything here turns that plain object into a filing package.
 * Money enters as integer cents and leaves as whole dollars — the filing unit
 * ACRA validates against — so the only place cents disappear is `wholeDollars`.
 */

// ---- taxonomy (generated) -------------------------------------------------

export type TaxonomyTemplate = "sim" | "full";

export interface TaxonomyElement {
  local: string;
  prefix: string;
  /** Concept id as declared by ACRA, e.g. "sg-as_Revenue" (used in locators). */
  id: string;
  /** XML Schema type, e.g. "xbrli:monetaryItemType". */
  type: string;
  abstract: boolean;
  periodType: "instant" | "duration";
  balance?: "debit" | "credit";
  label?: string;
}

export interface PresentationNode {
  /** "prefix:LocalName". */
  element: string;
  depth: number;
  order: number;
}

export interface TaxonomySection {
  /** Local role name, e.g. "SFPCurrentNonCurrent". */
  role: string;
  roleUri: string;
  /** ACRA's definition string, e.g. "[21100000] Statement of financial position, current and non-current". */
  definition: string;
  /** The [n] number in the definition, which is the section order. */
  order: number;
  presentation: PresentationNode[];
}

export interface TaxonomyCheck {
  role: string;
  /** "prefix:LocalName" of the total. */
  parent: string;
  children: { element: string; weight: number }[];
}

export type DimensionArcrole =
  | "all"
  | "hypercube-dimension"
  | "domain-member"
  | "dimension-domain"
  | "dimension-default";

export interface TaxonomyDimensionArc {
  role: string;
  arcrole: DimensionArcrole;
  from: string;
  to: string;
  order: number;
}

export interface TaxonomyRole {
  /** Local role name, e.g. "ISNature". */
  role: string;
  roleUri: string;
  definition: string;
  order: number;
}

export interface TaxonomyTemplateInfo {
  /** Entry point schema, relative to the taxonomy root. */
  entryPoint: string;
  /** Framework directory, e.g. "fr/sg-sim". */
  framework: string;
  roleNamespace: string;
  /** Every roleType in the framework, including the ones with no presentation. */
  roles: TaxonomyRole[];
  sections: TaxonomySection[];
  checks: TaxonomyCheck[];
  dimensions: TaxonomyDimensionArc[];
}

// ---- facts ----------------------------------------------------------------

export interface ElementRef {
  prefix: string;
  local: string;
}

export type ContextPeriod = "current" | "prior";

/** A dimensioned context, e.g. one class of property, plant and equipment. */
export interface FactDimension {
  axis: string;
  member: string;
}

export interface FactContext {
  period: ContextPeriod;
  /** Balance-sheet facts are instants (period end); flows are durations. */
  instant: boolean;
  dimension?: FactDimension;
}

export type FactUnit = "SGD" | "PURE" | null;

export interface Fact {
  /** "prefix:LocalName". */
  concept: string;
  value: number | string;
  context: FactContext;
  unit: FactUnit;
  /** Whole dollars ("0") or exact ("INF"); null for text and dates. */
  decimals: "0" | "INF" | null;
}

// ---- validation -----------------------------------------------------------

export type Severity = "genuine" | "possible";

export interface ValidationIssue {
  /** Rule id: an ACRA rule id where we mirror one ("Misc_006"), else "XBRL-*". */
  code: string;
  message: string;
  severity: Severity;
  concept?: string;
  period?: ContextPeriod;
  /** Money difference in whole dollars, when the rule is arithmetic. */
  difference?: number;
}

// ---- package --------------------------------------------------------------

export interface XbrlFile {
  /** Path inside the zip, e.g. "ce199050000Z-2024-12-31.xbrl". */
  name: string;
  content: string;
}

export interface XbrlPackage {
  /** Base file name shared by the instance and its linkbases. */
  fileName: string;
  /** Directory the taxonomy is unpacked into inside the zip. */
  taxonomyDir: string;
  instanceXml: string;
  extensionXsd: string;
  presentationXml: string;
  calculationXml: string;
  definitionXml: string;
  /** Every file that goes into the zip: the four documents plus the taxonomy. */
  files: XbrlFile[];
  /** Result of `validate()`; a genuine issue blocks the download. */
  issues: ValidationIssue[];
}

// ---- filing input ---------------------------------------------------------

/**
 * Everything the emitter is allowed to know. Assembled from the database by the
 * caller; no query lives in this layer, so every figure below is testable
 * against a literal.
 */
export interface XbrlInput {
  template: TaxonomyTemplate;
  company: {
    /** As registered in BizFile; BizFinx checks it against the register. */
    name: string;
    uen: string;
    accountingStandard: "sfrs" | "sfrs-se";
    sfpPresentation: "current-non-current" | "order-of-liquidity";
    natureOfBusiness: string;
    functionalCurrency?: string;
    presentationCurrency?: string;
    isSubsidiary: boolean;
    hasSubsidiaryAssociateOrJointVenture: boolean;
    moreThan50Employees: boolean;
    employees?: number;
    parentName?: string;
    parentUen?: string;
    principalPlaceOfBusiness?: string;
    preparedBy?: "in-house" | "outsourced";
    softwareName?: string;
  };
  period: {
    startDate: string;
    endDate: string;
    priorStartDate: string;
    priorEndDate: string;
  };
  approvals: {
    /** Date the directors authorised the FS for issue (after the year end). */
    authorisationDate: string;
    goingConcern: boolean;
    comparativeRestated: boolean;
    directorsTrueAndFair: boolean;
    directorsSolvent: boolean;
  };
  audit?: {
    opinion:
      | "Not audited"
      | "Unqualified (clean) audit opinion"
      | "Unqualified with emphasis of matter"
      | "Qualified opinion"
      | "Adverse opinion"
      | "Disclaimer of opinion";
    standards: string;
    goingConcernUncertainty: boolean;
    recordsKept: "Yes" | "No" | "Not applicable (disclaimer issued by auditor)";
  };
  /** Current period statement model. */
  current: FsModelInput;
  /** Comparatives. ACRA requires both periods for every reported figure. */
  prior?: FsModelInput;
  /** Note captions, same shape as the statement groups they feed. */
  notes?: Partial<Record<NoteGroup, Record<string, number>>>;
  /** Dimensioned note rows, e.g. one line per class of property, plant and equipment. */
  classNotes?: {
    group: NoteGroup;
    /** Member concept, e.g. "sg-as:MachineryAndOtherEquipmentMember". */
    member: string;
    values: Record<string, number>;
  }[];
  /**
   * Operator figures and prior-filing figures, in cents, keyed by element.
   * Stored per period so a re-emit reproduces last year's numbers.
   */
  overrides?: {
    current?: Record<string, number>;
    prior?: Record<string, number>;
  };
  /** Full template only: the whole FS as one text block. */
  fsTextBlock?: string;
}

export type NoteGroup =
  | "note.receivables"
  | "note.payables"
  | "note.revenue"
  | "note.ppe";

/** Re-exported so callers build the model with the statement layer they already use. */
export type FsModelInput = import("@/lib/reports/fs-model").FsModel;

/** Filing-header values, resolved from `XbrlInput` once per emit. */
export interface XbrlScalars {
  companyName: string;
  uen: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  priorPeriodStart: string;
  priorPeriodEnd: string;
  accountingStandard: string;
  natureOfFinancialStatements: string;
  presentationCurrency: string;
  levelOfRounding: string;
  sfpPresentation: string;
  moreThan50Employees: string;
  taxonomyVersion: string;
  howPrepared: string;
  softwareName: string;
  authorisationDate: string;
  functionalCurrency: string;
  natureOfBusiness: string;
  comparativeChanges: string;
  typeOfXBRLFiling: string;
  goingConcern: string;
  directorsTrueAndFair: string;
  directorsSolvent: string;
  /** Optional below here: only emitted when the caller knows the answer. */
  auditOpinion?: string;
  auditStandards?: string;
  auditGoingConcernUncertainty?: string;
  auditRecordsKept?: string;
  principalPlaceOfBusiness?: string;
  parentName?: string;
  parentUen?: string;
  employees?: number;
  hasSubsidiaryAssociateOrJointVenture?: string;
  hasSingaporeParent?: string;
  fsTextBlock?: string;
}

export type ScalarField = keyof XbrlScalars;
