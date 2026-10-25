/**
 * ACRA Full XBRL (`fr/sg-sfrs`) — the Simplified table plus the concepts only the
 * full template asks for.
 *
 * Full is not just more tags: it wants a whole-FS text block, cash-flow lines and
 * PP&E / intangible movement schedules. Those movements are not modelled from the
 * ledger yet, so they are `manual` (an operator figure, or one carried forward
 * from the prior filing) instead of quietly emitting zeroes.
 */
import type { MappingRow } from "./mapping";
import { SG_SIM_MAPPING } from "./mapping-sg-sim";

const FULL_FS = "FullSetOfFinancialStatements";
const AUDITORS = "IndependentAuditorsReport";
const SCF = "SCF";
const PPE = "NotePropertyPlantAndEquipment";
const INTANGIBLES = "NoteIntangibleAssets";
const ROU = "NoteRightOfUseAssets";
const LOANS = "NoteLoansAndBorrowings";
const SELECTED = "NoteSelectedIncomeExpense";
const RELATED = "NoteRelatedParty";

const manual = (section: string, element: string, reason: string): MappingRow => ({
  element,
  section,
  source: { kind: "manual", reason },
});

const absent = (section: string, element: string, reason: string): MappingRow => ({
  element,
  section,
  source: { kind: "absent", reason },
});

const derived = (section: string, element: string): MappingRow => ({
  element,
  section,
  source: { kind: "derived" },
});

const classCap = (
  section: string,
  element: string,
  group: "note.ppe",
  caption: string,
  axis: string
): MappingRow => ({
  element,
  section,
  source: { kind: "captions", group, captions: [caption], classAxis: axis },
});

const MOVEMENT = "movement schedule is not derived from the ledger yet; supply the figure";

export const SG_FULL_MAPPING: readonly MappingRow[] = [
  ...SG_SIM_MAPPING,

  {
    element: "sg-as:DisclosureOfCompleteSetOfFinancialStatementsTextBlock",
    section: FULL_FS,
    source: { kind: "scalar", field: "fsTextBlock" },
  },

  // KAM counts are plain integers ("number of matters"), so they travel as
  // overrides rather than money.
  manual(AUDITORS, "sg-ssa:ReasonForModifiedAuditOpinionRelatedToImpairmentOfAssets", "modified opinion area; auditor input"),
  manual(AUDITORS, "sg-ssa:ReasonForModifiedAuditOpinionRelatedToGoingConcern", "modified opinion area; auditor input"),
  manual(AUDITORS, "sg-ssa:ReasonForModifiedAuditOpinionRelatedToAuditOfOpeningBalance", "modified opinion area; auditor input"),
  manual(AUDITORS, "sg-ssa:ReasonForModifiedAuditOpinionRelatedToConsolidatedOrEquityAccounting", "modified opinion area; auditor input"),
  manual(AUDITORS, "sg-ssa:ReasonForModifiedAuditOpinionRelatedToOngoingInvestigationOrLegalCases", "modified opinion area; auditor input"),
  manual(AUDITORS, "sg-ssa:ReasonForModifiedAuditOpinionRelatedToOthers", "modified opinion area; auditor input"),
  manual(AUDITORS, "sg-ssa:DidAuditorConcludeThatThereIsMaterialMisstatementOfOtherInformation", "auditor input"),
  manual(AUDITORS, "sg-lm:YearOfAppointmentOfSigningAuditor", "auditor input"),
  manual(AUDITORS, "sg-ssa:NumberOfKeyAuditMattersReported", "auditor input"),
  manual(AUDITORS, "sg-ssa:KeyAuditMattersValuationOfReceivablesAndOtherFinancialInstruments", "auditor input"),
  manual(AUDITORS, "sg-ssa:KeyAuditMattersImpairmentOfGoodwillAndOtherIntangibleAssets", "auditor input"),
  manual(AUDITORS, "sg-ssa:KeyAuditMattersValuationOfInvestmentProperty", "auditor input"),
  manual(AUDITORS, "sg-ssa:KeyAuditMattersValuationOfPropertyPlantAndEquipment", "auditor input"),
  manual(AUDITORS, "sg-ssa:KeyAuditMattersRevenueRecognition", "auditor input"),
  manual(AUDITORS, "sg-ssa:KeyAuditMattersOthers", "auditor input"),

  // The three net cash-flow lines exist in lib/reports/cash-flow.ts but that
  // model is not part of the filing input yet.
  manual(SCF, "sg-as:CashFlowsFromUsedInOperatingActivities", "cash-flow model not wired into the filing input yet"),
  manual(SCF, "sg-as:CashFlowsFromUsedInInvestingActivities", "cash-flow model not wired into the filing input yet"),
  manual(SCF, "sg-as:CashFlowsFromUsedInFinancingActivities", "cash-flow model not wired into the filing input yet"),

  // PP&E note: the carrying amount per class is the one line a fixed-asset
  // register can produce today; the movements above it need a schedule.
  classCap(PPE, "sg-as:PropertyPlantAndEquipmentAtCost", "note.ppe", "At cost", "sg-as:ClassesOfPropertyPlantAndEquipmentAxis"),
  classCap(PPE, "sg-as:PropertyPlantAndEquipment", "note.ppe", "Carrying amount", "sg-as:ClassesOfPropertyPlantAndEquipmentAxis"),
  manual(PPE, "sg-as:GrossCarryingAmountOfPropertyPlantAndEquipment", MOVEMENT),
  manual(PPE, "sg-as:AdditionsOtherThanThroughBusinessCombinationsPropertyPlantAndEquipment", MOVEMENT),
  manual(PPE, "sg-as:DecreaseThroughLossOfControlOfSubsidiaryPropertyPlantAndEquipment", MOVEMENT),
  manual(PPE, "sg-as:IncreaseDecreaseThroughNetExchangeDifferencesPropertyPlantAndEquipment", MOVEMENT),
  manual(PPE, "sg-as:IncreaseDecreaseThroughOtherChangesPropertyPlantAndEquipment", MOVEMENT),
  manual(PPE, "sg-as:AccumulatedDepreciationAmortisationAndImpairmentOnPropertyPlantAndEquipment", MOVEMENT),
  manual(PPE, "sg-as:DepreciationPropertyPlantAndEquipment", MOVEMENT),
  manual(PPE, "sg-as:ImpairmentLossPropertyPlantAndEquipment", MOVEMENT),
  manual(PPE, "sg-as:ReversalOfImpairmentLossPropertyPlantAndEquipment", MOVEMENT),
  manual(PPE, "sg-as:AccumulatedDepreciationAmortisationAndImpairmentOnDecreaseThroughLossOfControlOfSubsidiaryOnPropertyPlantAndEquipment", MOVEMENT),
  manual(PPE, "sg-as:AccumulatedDepreciationAmortisationAndImpairmentOnIncreaseDecreaseThroughNetExchangeDifferencesOnPropertyPlantAndEquipment", MOVEMENT),
  manual(PPE, "sg-as:AccumulatedDepreciationAmortisationAndImpairmentOnIncreaseDecreaseThroughOtherChangesPropertyPlantAndEquipment", MOVEMENT),
  manual(PPE, "sg-as:PropertyPlantAndEquipmentAtValuation", "revaluation model; the SG chart is cost-only"),

  manual(INTANGIBLES, "sg-as:GrossCarryingAmountOfIntangibleAssets", MOVEMENT),
  manual(INTANGIBLES, "sg-as:IncreaseDecreaseThroughNetExchangeDifferencesIntangibleAssetsOtherThanGoodwill", MOVEMENT),
  manual(INTANGIBLES, "sg-as:AcquisitionsThroughBusinessCombinationsIntangibleAssetsOtherThanGoodwill", MOVEMENT),
  manual(INTANGIBLES, "sg-as:DecreaseThroughLossOfControlOfSubsidiaryIntangibleAssetsOtherThanGoodwill", MOVEMENT),
  manual(INTANGIBLES, "sg-as:IncreaseDecreaseThroughOtherChangesIntangibleAssetsOtherThanGoodwill", MOVEMENT),
  manual(INTANGIBLES, "sg-as:AmortisationAndImpairmentOnIntangibleAssetsOtherThanGoodwillGross", MOVEMENT),
  manual(INTANGIBLES, "sg-as:AmortisationOfIncreaseDecreaseThroughNetExchangeDifferencesOnIntangibleAssetsOtherThanGoodwill", MOVEMENT),
  manual(INTANGIBLES, "sg-as:AmortisationIntangibleAssetsOtherThanGoodwill", MOVEMENT),
  manual(INTANGIBLES, "sg-as:ImpairmentLossRecognisedInProfitOrLossIntangibleAssetsOtherThanGoodwill", MOVEMENT),
  manual(INTANGIBLES, "sg-as:ReversalOfImpairmentLossRecognisedInProfitOrLossIntangibleAssetsOtherThanGoodwill", MOVEMENT),
  manual(INTANGIBLES, "sg-as:AmortisationOfDecreaseThroughLossOfControlOfSubsidiaryOnIntangibleAssetsOtherThanGoodwill", MOVEMENT),
  manual(INTANGIBLES, "sg-as:AmortisationOfIncreaseDecreaseThroughOtherChangesOnIntangibleAssetsOtherThanGoodwill", MOVEMENT),
  manual(INTANGIBLES, "sg-as:IntangibleAssetsOtherThanGoodwillAtCost", "cost model only; the SG chart is cost-only"),
  manual(INTANGIBLES, "sg-as:IntangibleAssetsOtherThanGoodwillAtValuation", "revaluation model; the SG chart is cost-only"),

  absent(ROU, "sg-as:RightofuseAssetsClassifiedInPropertyPlantAndEquipment", "right-of-use assets are not modelled (no lease schedule yet)"),
  absent(ROU, "sg-as:RightofuseAssetsClassifiedInIntangibleAssetsOtherThanGoodwill", "right-of-use assets are not modelled (no lease schedule yet)"),
  absent(ROU, "sg-as:RightofuseAssetsClassifiedInOtherAssets", "right-of-use assets are not modelled (no lease schedule yet)"),

  manual(LOANS, "sg-as:BankOverdrafts", "loan split is a note figure; the chart carries one loans caption"),
  manual(LOANS, "sg-as:SecuredBankBorrowings", "loan split is a note figure; the chart carries one loans caption"),
  manual(LOANS, "sg-as:UnsecuredBankBorrowings", "loan split is a note figure; the chart carries one loans caption"),
  manual(LOANS, "sg-as:OtherBorrowings", "loan split is a note figure; the chart carries one loans caption"),
  derived(LOANS, "sg-as:LoansAndBorrowings"),

  manual(SELECTED, "sg-as:InterestIncomeClassifiedAsOtherIncome", "selected income/expense note; split by nature is a note figure"),
  manual(SELECTED, "sg-as:DividendIncomeClassifiedAsOtherIncome", "selected income/expense note; split by nature is a note figure"),
  manual(SELECTED, "sg-as:OtherInvestmentIncomeClassifiedAsOtherIncome", "selected income/expense note; split by nature is a note figure"),
  manual(SELECTED, "sg-as:GovernmentGrantsClassifiedAsOtherIncome", "selected income/expense note; split by nature is a note figure"),
  manual(SELECTED, "sg-as:MiscellaneousIncomeClassifiedAsOtherIncome", "selected income/expense note; split by nature is a note figure"),
  manual(SELECTED, "sg-as:IncreaseDecreaseInInventoriesOfFinishedGoodsAndWorkInProgress", "selected income/expense note; split by nature is a note figure"),
  manual(SELECTED, "sg-as:RawMaterialsAndConsumablesUsed", "selected income/expense note; split by nature is a note figure"),
  manual(SELECTED, "sg-as:SubcontractorCost", "selected income/expense note; split by nature is a note figure"),
  manual(SELECTED, "sg-as:DividendDeclaredDuringTheYear", "equity movement; supply from the dividend resolution"),
  manual(SELECTED, "sg-as:NetGainsLossesOnForeignExchangeAdjustment", "selected gains/losses note"),
  manual(SELECTED, "sg-as:NetGainsLossesOnDisposalOfPropertyPlantAndEquipment", "selected gains/losses note"),
  manual(SELECTED, "sg-as:NetGainsLossesOnDisposalOfIntangibleAssets", "selected gains/losses note"),
  manual(SELECTED, "sg-as:ImpairmentLossReversalOfImpairmentLossOnInvestments", "selected gains/losses note"),
  manual(SELECTED, "sg-as:ImpairmentLossReversalOfImpairmentLossOnReceivables", "selected gains/losses note"),
  manual(SELECTED, "sg-as:ImpairmentLossReversalOfImpairmentLossOnOthers", "selected gains/losses note"),

  manual(RELATED, "sg-as:WhetherCompanyHasOverseasInvestmentsInSubsidiariesAssociatesOrJointVentures", "related-party disclosure; answer required only when the company has a group"),
  manual(RELATED, "sg-as:RevenueFromRelatedPartyTransactions", "related-party transaction total; needs counterparty tagging the ledger does not hold"),
  manual(RELATED, "sg-as:PurchasesFromRelatedPartyTransactions", "related-party transaction total; needs counterparty tagging the ledger does not hold"),
];
