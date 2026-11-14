/**
 * ACRA Simplified XBRL (`fr/sg-sim`) — caption -> element for every concept the
 * template presents.
 *
 * Captions below come from the SG tax module's `fsPresentation`
 * (`lib/tax/modules/sg.ts`) and the fallbacks in `lib/reports/fs-model.ts`, so a
 * chart or caption change shows up here as a failing mapping test rather than a
 * silently missing line.
 */
import type { MappingRow, StatementGroup } from "./mapping";
import type { ScalarField } from "./types";

const FILING = "FilingInformation";
const DIRECTORS = "StatementByDirectors";
const AUDITORS = "IndependentAuditorsReport";
const SFP = "SFPCurrentNonCurrent";
const SFP_ORDER = "SFPOrderOfLiquidity";
const IS = "ISNature";
const RECEIVABLES = "NoteTradeAndOtherReceivables";
const PAYABLES = "NoteTradeAndOtherPayables";
const REVENUE = "NoteRevenue";
const ADDITIONAL = "AdditionalInformation";

const cap = (
  section: string,
  element: string,
  group: StatementGroup,
  captions: string[],
  flip = false
): MappingRow => ({
  element: `sg-as:${element}`,
  section,
  source: { kind: "captions", group, captions, ...(flip ? { flip: true } : {}) },
});

const dei = (section: string, element: string, field: ScalarField): MappingRow => ({
  element,
  section,
  source: { kind: "scalar", field },
});

const soce = (
  section: string,
  element: string,
  column: "shareCapital" | "retainedEarnings"
): MappingRow => ({ element: `sg-as:${element}`, section, source: { kind: "soce", column } });

const derived = (section: string, element: string): MappingRow => ({
  element: `sg-as:${element}`,
  section,
  source: { kind: "derived" },
});

const manual = (section: string, element: string, reason: string): MappingRow => ({
  element: `sg-as:${element}`,
  section,
  source: { kind: "manual", reason },
});

const absent = (section: string, element: string, reason: string): MappingRow => ({
  element: `sg-as:${element}`,
  section,
  source: { kind: "absent", reason },
});

const NOT_APPLICABLE_ENTITY_TYPE = "not applicable to this company (no such balance modelled)";

export const SG_SIM_MAPPING: readonly MappingRow[] = [
  // Filing information — the mandatory ACRA header. BizFinx compares name, UEN
  // and period against BizFile+ before it will accept the file.
  dei(FILING, "sg-dei:NameOfCompany", "companyName"),
  dei(FILING, "sg-dei:UniqueEntityNumber", "uen"),
  dei(FILING, "sg-dei:CurrentPeriodStartDate", "currentPeriodStart"),
  dei(FILING, "sg-dei:CurrentPeriodEndDate", "currentPeriodEnd"),
  dei(FILING, "sg-dei:TypeOfAccountingStandardUsedToPrepareFinancialStatements", "accountingStandard"),
  dei(FILING, "sg-dei:PriorPeriodStartDate", "priorPeriodStart"),
  dei(FILING, "sg-dei:NatureOfFinancialStatementsCompanyLevelOrConsolidated", "natureOfFinancialStatements"),
  dei(FILING, "sg-dei:DescriptionOfPresentationCurrency", "presentationCurrency"),
  dei(FILING, "sg-dei:LevelOfRoundingUsedInFinancialStatements", "levelOfRounding"),
  dei(FILING, "sg-dei:TypeOfStatementOfFinancialPosition", "sfpPresentation"),
  dei(FILING, "sg-dei:WhetherCompanyOrGroupIfConsolidatedAccountsArePreparedHasMoreThan50Employees", "moreThan50Employees"),
  dei(FILING, "sg-dei:TaxonomyVersion", "taxonomyVersion"),
  dei(FILING, "sg-dei:HowWasXBRLInstanceDocumentPrepared", "howPrepared"),
  dei(FILING, "sg-dei:NameAndVersionOfSoftwareUsedToGenerateInstanceDocument", "softwareName"),
  dei(FILING, "sg-as:DateOfAuthorisationForIssueOfFinancialStatements", "authorisationDate"),
  dei(FILING, "sg-as:DescriptionOfFunctionalCurrency", "functionalCurrency"),
  dei(FILING, "sg-as:DescriptionOfNatureOfEntitysOperationsAndPrincipalActivities", "natureOfBusiness"),
  dei(FILING, "sg-as:PrincipalPlaceOfBusinessIfDifferentFromRegisteredOffice", "principalPlaceOfBusiness"),
  dei(FILING, "sg-as:NameOfParentEntity", "parentName"),
  dei(FILING, "sg-as:NameOfUltimateParentOfGroup", "parentName"),
  dei(FILING, "sg-dei:WhetherThereAreChangesToComparativeAmountsDueToRestatementsReclassificationOrOtherReasons", "comparativeChanges"),
  dei(FILING, "sg-dei:TypeOfXBRLFiling", "typeOfXBRLFiling"),
  dei(FILING, "sg-dei:WhetherFinancialStatementsArePreparedOnGoingConcernBasis", "goingConcern"),

  // Statement by directors and auditors' report are declarations, not figures.
  dei(DIRECTORS, "sg-ca:WhetherInDirectorsOpinionFinancialStatementsAreDrawnUpSoAsToExhibitATrueAndFairView", "directorsTrueAndFair"),
  dei(DIRECTORS, "sg-ca:WhetherThereAreReasonableGroundsToBelieveThatCompanyWillBeAbleToPayItsDebtsAsAndWhenTheyFallDueAtDateOfStatement", "directorsSolvent"),
  dei(AUDITORS, "sg-ssa:TypeOfAuditOpinionInIndependentAuditorsReport", "auditOpinion"),
  dei(AUDITORS, "sg-ssa:AuditingStandardsUsedToConductAudit", "auditStandards"),
  dei(AUDITORS, "sg-ssa:WhetherThereIsAnyMaterialUncertaintyRelatingToGoingConcern", "auditGoingConcernUncertainty"),
  dei(AUDITORS, "sg-ca:WhetherInAuditorsOpinionAccountingAndOtherRecordsRequiredAreProperlyKeptInAccordanceWithCompaniesAct", "auditRecordsKept"),

  // Statement of financial position, current and non-current.
  derived(SFP, "Assets"),
  cap(SFP, "CashAndBankBalances", "sfp.currentAssets", ["Cash and cash equivalents"]),
  cap(SFP, "TradeAndOtherReceivablesCurrent", "sfp.currentAssets", ["Trade and other receivables"]),
  cap(SFP, "Inventories", "sfp.currentAssets", ["Inventories"]),
  cap(SFP, "OtherCurrentNonfinancialAssets", "sfp.currentAssets", [
    "Other current assets",
    "Prepayments",
    "GST recoverable",
  ]),
  absent(SFP, "CurrentFinanceLeaseReceivables", NOT_APPLICABLE_ENTITY_TYPE),
  absent(SFP, "CurrentFinancialAssetsMeasuredAtFairValueThroughProfitOrLoss", NOT_APPLICABLE_ENTITY_TYPE),
  absent(SFP, "CurrentDerivativeFinancialAssets", NOT_APPLICABLE_ENTITY_TYPE),
  absent(SFP, "OtherCurrentFinancialAssets", NOT_APPLICABLE_ENTITY_TYPE),
  absent(SFP, "DevelopmentProperties", NOT_APPLICABLE_ENTITY_TYPE),
  absent(SFP, "NoncurrentAssetsOrDisposalGroupsClassifiedAsHeldForSaleOrAsHeldForDistributionToOwners", NOT_APPLICABLE_ENTITY_TYPE),
  derived(SFP, "CurrentAssets"),
  absent(SFP, "TradeAndOtherReceivablesNoncurrent", NOT_APPLICABLE_ENTITY_TYPE),
  absent(SFP, "NoncurrentFinanceLeaseReceivables", NOT_APPLICABLE_ENTITY_TYPE),
  absent(SFP, "NoncurrentFinancialAssetsMeasuredAtFairValueThroughProfitOrLoss", NOT_APPLICABLE_ENTITY_TYPE),
  absent(SFP, "NoncurrentDerivativeFinancialAssets", NOT_APPLICABLE_ENTITY_TYPE),
  absent(SFP, "OtherNoncurrentFinancialAssets", NOT_APPLICABLE_ENTITY_TYPE),
  cap(SFP, "PropertyPlantAndEquipment", "sfp.nonCurrentAssets", ["Property, plant and equipment"]),
  absent(SFP, "InvestmentProperties", NOT_APPLICABLE_ENTITY_TYPE),
  absent(SFP, "Goodwill", NOT_APPLICABLE_ENTITY_TYPE),
  cap(SFP, "IntangibleAssetsOtherThanGoodwill", "sfp.nonCurrentAssets", ["Intangible assets"]),
  cap(SFP, "InvestmentsInSubsidiariesAssociatesOrJointVentures", "sfp.nonCurrentAssets", ["Investments"]),
  absent(SFP, "DeferredTaxAssets", NOT_APPLICABLE_ENTITY_TYPE),
  cap(SFP, "OtherNoncurrentNonfinancialAssets", "sfp.nonCurrentAssets", ["Other non-current assets"]),
  derived(SFP, "NoncurrentAssets"),
  derived(SFP, "Liabilities"),
  cap(SFP, "CurrentLoansAndBorrowings", "sfp.currentLiabilities", ["Loans and borrowings"]),
  // shortcut: fs-model shares one caption map across assets and liabilities, so
  // most current liabilities arrive as "Other current assets"; mapped by group
  // until the presentation splits the map.
  cap(SFP, "TradeAndOtherPayablesCurrent", "sfp.currentLiabilities", [
    "Other current assets",
    "Trade and other payables",
  ]),
  cap(SFP, "OtherCurrentNonfinancialLiabilities", "sfp.currentLiabilities", ["GST payable"]),
  cap(SFP, "CurrentIncomeTaxLiabilities", "sfp.currentLiabilities", ["Tax payable"]),
  absent(SFP, "CurrentFinancialLiabilitiesMeasuredAtFairValueThroughProfitOrLoss", NOT_APPLICABLE_ENTITY_TYPE),
  absent(SFP, "CurrentFinanceLeaseLiabilities", NOT_APPLICABLE_ENTITY_TYPE),
  absent(SFP, "OtherCurrentFinancialLiabilities", NOT_APPLICABLE_ENTITY_TYPE),
  absent(SFP, "CurrentProvisions", NOT_APPLICABLE_ENTITY_TYPE),
  absent(SFP, "LiabilitiesClassifiedAsHeldForSale", NOT_APPLICABLE_ENTITY_TYPE),
  derived(SFP, "CurrentLiabilities"),
  cap(SFP, "NoncurrentLoansAndBorrowings", "sfp.nonCurrentLiabilities", ["Loans and borrowings"]),
  cap(SFP, "OtherNoncurrentNonfinancialLiabilities", "sfp.nonCurrentLiabilities", ["Other non-current assets"]),
  absent(SFP, "TradeAndOtherPayablesNoncurrent", NOT_APPLICABLE_ENTITY_TYPE),
  absent(SFP, "NoncurrentFinanceLeaseLiabilities", NOT_APPLICABLE_ENTITY_TYPE),
  absent(SFP, "NoncurrentFinancialLiabilitiesMeasuredAtFairValueThroughProfitOrLoss", NOT_APPLICABLE_ENTITY_TYPE),
  absent(SFP, "OtherNoncurrentFinancialLiabilities", NOT_APPLICABLE_ENTITY_TYPE),
  absent(SFP, "NoncurrentProvisions", NOT_APPLICABLE_ENTITY_TYPE),
  absent(SFP, "DeferredTaxLiabilities", NOT_APPLICABLE_ENTITY_TYPE),
  derived(SFP, "NoncurrentLiabilities"),
  absent(SFP, "NoncontrollingInterests", NOT_APPLICABLE_ENTITY_TYPE),
  derived(SFP, "Equity"),
  soce(SFP, "ShareCapital", "shareCapital"),
  absent(SFP, "TreasuryShares", NOT_APPLICABLE_ENTITY_TYPE),
  soce(SFP, "AccumulatedProfitsLosses", "retainedEarnings"),
  absent(SFP, "ReservesOtherThanAccumulatedProfitsLosses", NOT_APPLICABLE_ENTITY_TYPE),

  // Order of liquidity is the alternative SFP layout; the DEI states which one
  // is filed, and we file current/non-current.
  absent(SFP_ORDER, "Assets", "order-of-liquidity layout is not filed"),
  absent(SFP_ORDER, "Liabilities", "order-of-liquidity layout is not filed"),
  absent(SFP_ORDER, "NoncontrollingInterests", "order-of-liquidity layout is not filed"),
  absent(SFP_ORDER, "Equity", "order-of-liquidity layout is not filed"),
  absent(SFP_ORDER, "ShareCapital", "order-of-liquidity layout is not filed"),
  absent(SFP_ORDER, "TreasuryShares", "order-of-liquidity layout is not filed"),
  absent(SFP_ORDER, "AccumulatedProfitsLosses", "order-of-liquidity layout is not filed"),
  absent(SFP_ORDER, "ReservesOtherThanAccumulatedProfitsLosses", "order-of-liquidity layout is not filed"),

  // Income statement, by nature of expense (the only layout Simplified offers).
  cap(IS, "Revenue", "is.income", ["Revenue"]),
  cap(IS, "OtherIncome", "is.income", ["Other income and expenses"]),
  // ACRA's "employee benefits expense" covers directors' remuneration, employer
  // CPF and staff benefits: they are disclosed separately in Form C-S but are one
  // line in the by-nature income statement.
  cap(IS, "EmployeeBenefitsExpense", "is.expenses", [
    "Employee benefits expense",
    "Directors' remuneration",
    "Employer CPF and statutory contributions",
    "Medical and staff benefits",
  ]),
  cap(IS, "DepreciationExpense", "is.expenses", ["Depreciation expense"]),
  cap(IS, "OtherExpensesByNature", "is.expenses", [
    "Cost of sales",
    "Other operating expenses",
    "Other income and expenses",
    "Transport and travel",
    "Entertainment",
    "Professional and compliance fees",
    "Other",
  ]),
  absent(IS, "FinanceCosts", "the SG chart has no finance-cost caption yet; map it when 6xxx interest lines land"),
  absent(IS, "AmortisationExpense", "SG chart carries accumulated amortisation as an asset; no amortisation expense caption yet"),
  absent(IS, "RepairsAndMaintenanceExpense", "folded into Other expenses by nature"),
  absent(IS, "SalesAndMarketingExpense", "folded into Other expenses by nature"),
  absent(IS, "OtherGainsLosses", "no gains/losses caption in the SG chart yet"),
  absent(IS, "ShareOfProfitLossOfAssociatesAndJointVenturesAccountedForUsingEquityMethod", NOT_APPLICABLE_ENTITY_TYPE),
  derived(IS, "ProfitLossBeforeTaxation"),
  absent(IS, "TaxExpenseBenefitContinuingOperations", "the SG chart has no income-tax subtag yet; tax is posted to the non-operating caption"),
  absent(IS, "ProfitLossFromDiscontinuedOperations", NOT_APPLICABLE_ENTITY_TYPE),
  derived(IS, "ProfitLoss"),
  manual(IS, "ProfitLossAttributableToOwnersOfCompany", "single-company filings equal ProfitLoss; supply the figure to report it"),
  absent(IS, "ProfitLossAttributableToNoncontrollingInterests", NOT_APPLICABLE_ENTITY_TYPE),

  // Notes. Caption keys are the note input contract for `XbrlInput.notes`.
  cap(RECEIVABLES, "TradeAndOtherReceivablesDueFromThirdParties", "note.receivables", ["Trade receivables"]),
  cap(RECEIVABLES, "TradeAndOtherReceivablesDueFromRelatedParties", "note.receivables", ["Due from related parties"]),
  cap(RECEIVABLES, "UnbilledReceivables", "note.receivables", ["Unbilled receivables"]),
  cap(RECEIVABLES, "OtherReceivables", "note.receivables", ["Other receivables"]),
  derived(RECEIVABLES, "TradeAndOtherReceivables"),

  cap(PAYABLES, "TradeAndOtherPayablesDueToThirdParties", "note.payables", ["Trade payables"]),
  cap(PAYABLES, "TradeAndOtherPayablesDueToRelatedParties", "note.payables", ["Due to related parties"]),
  cap(PAYABLES, "OtherPayables", "note.payables", ["Other payables"]),
  cap(PAYABLES, "DeferredIncome", "note.payables", ["Deferred income"]),
  derived(PAYABLES, "TradeAndOtherPayables"),

  cap(REVENUE, "RevenueFromGoodsTransferredAtPointInTime", "note.revenue", ["Goods transferred at a point in time"]),
  cap(REVENUE, "RevenueFromServicesTransferredAtPointInTime", "note.revenue", ["Services transferred at a point in time"]),
  cap(REVENUE, "RevenueFromServicesTransferredOverTime", "note.revenue", ["Services transferred over time"]),
  cap(REVENUE, "RevenueFromPropertyTransferredAtPointInTime", "note.revenue", ["Property transferred at a point in time"]),
  cap(REVENUE, "RevenueFromPropertyTransferredOverTime", "note.revenue", ["Property transferred over time"]),
  cap(REVENUE, "RevenueFromConstructionContractsOverTime", "note.revenue", ["Construction contracts over time"]),
  cap(REVENUE, "OtherRevenue", "note.revenue", ["Other revenue"]),
  derived(REVENUE, "Revenue"),

  dei(ADDITIONAL, "sg-as:NumberOfEmployeesOfCompany", "employees"),
  absent(ADDITIONAL, "NumberOfEmployeesOfGroup", "only asked of groups; this filing is company level"),
  absent(ADDITIONAL, "WhetherCompanyIsSubsidiary", "the four permitted answers depend on the group structure; supply wording is not automated"),
  dei(ADDITIONAL, "sg-as:UniqueEntityNumberOfSingaporeParentCompanyPreparingConsolidatedFinancialStatements", "parentUen"),
  absent(ADDITIONAL, "WhetherEntityIsSingaporeIncorporatedParentPreparingAndFilingSetOfConsolidatedFinancialStatementsWithACRA", NOT_APPLICABLE_ENTITY_TYPE),
  dei(ADDITIONAL, "sg-as:WhetherEntityHasAnySingaporeIncorporatedParentCompany", "hasSingaporeParent"),
  dei(ADDITIONAL, "sg-as:WhetherCompanyHasAnySubsidiaryAssociateOrJointVenture", "hasSubsidiaryAssociateOrJointVenture"),
  absent(ADDITIONAL, "WhetherEntityIsForeignIncorporatedCompanyPreparingAndFilingSetOfConsolidatedFinancialStatementsIndicateWebsiteOrAvenueWhereConsolidatedFinancialStatementsCanBeFound", NOT_APPLICABLE_ENTITY_TYPE),
];
