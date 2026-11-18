/**
 * ACRA taxonomy, generated — do not edit by hand.
 *
 * Regenerate with: npx tsx scripts/gen-xbrl-taxonomy.ts
 * Package: ACRA Taxonomy 2026 v1.0 (go.gov.sg/acrataxonomyzip)
 * Taxonomy version: 2026-01-01
 *
 * Source hashes are recorded so a silent change to the committed taxonomy is a
 * diff, not a surprise at filing time.
 */
import type { TaxonomyElement, TaxonomyTemplate, TaxonomyTemplateInfo } from "./types";

export const TAXONOMY_VERSION = "2026-01-01";

export const TAXONOMY_SOURCES: { path: string; sha256: string }[] = [
  {
    "path": "fr/sg-sim/lab_rol_sg-sim_2026-01-01.xsd",
    "sha256": "d4face7f679b6af7a34dc4d666aac19644ad0cfe98f8db03c580bd0f9c9bc3fb"
  },
  {
    "path": "fr/sg-sim/sg-sim_2026-01-01_cal.xml",
    "sha256": "3b117e280d0734524e458209411833b43aeb5ec3e7f39002ce47116757e29f1e"
  },
  {
    "path": "fr/sg-sim/sg-sim_2026-01-01_def.xml",
    "sha256": "ccbb004aa43f71a6e8b741a004387af27008c6f1fc2c749ef67fbfc6f307c977"
  },
  {
    "path": "fr/sg-sim/sg-sim_2026-01-01_elr.xsd",
    "sha256": "c23ab9f51bdd9056a071c4bfdf8e440e3027c5eccdf4967f3d306febe98b6baf"
  },
  {
    "path": "fr/sg-sim/sg-sim_2026-01-01_lab.xml",
    "sha256": "b9dacead55b5bfd4c202172644ad96157c07f0a565020cc75a137474eb473287"
  },
  {
    "path": "fr/sg-sim/sg-sim_2026-01-01_pre.xml",
    "sha256": "185f42a6e39e779d1bddb981ea893d5362cf40ad7cffb5adb1a36c26662fefa9"
  },
  {
    "path": "fr/sg-sfrs/lab_rol_sg-sfrs_2026-01-01.xsd",
    "sha256": "b22b52d8df02e8f3fa28e88bdd1b065d3e249122e5074d33367eb11dabe247cf"
  },
  {
    "path": "fr/sg-sfrs/sg-sfrs_2026-01-01_cal.xml",
    "sha256": "2946d88725da9d2940fa05985e489d93b451472a7148590ca508c78794dfd200"
  },
  {
    "path": "fr/sg-sfrs/sg-sfrs_2026-01-01_def.xml",
    "sha256": "f61dc16880828803f730baf94f74807942f7b379c7bac6ff243300ef8bda118a"
  },
  {
    "path": "fr/sg-sfrs/sg-sfrs_2026-01-01_elr.xsd",
    "sha256": "004727a5e38c948102d96b53d02f7619cd13cb802da3e120063bffa941d1b2c6"
  },
  {
    "path": "fr/sg-sfrs/sg-sfrs_2026-01-01_lab.xml",
    "sha256": "0e1663c4a6e7175ac0831bdeb51934771c3f92d1ff654e02786f9456a2719cb8"
  },
  {
    "path": "fr/sg-sfrs/sg-sfrs_2026-01-01_pre.xml",
    "sha256": "d1b84016133251322934d509bd9bd6c17a9cfb882fc41bff0e58db1295da0527"
  },
  {
    "path": "elts/sg-as-cor_2026-01-01.xsd",
    "sha256": "cebb5b90c252b2a373442cf9a706a2ad50bc5283459558bae5cb4db7caf39d84"
  },
  {
    "path": "elts/sg-ca-cor_2026-01-01.xsd",
    "sha256": "c5cef1ac4c497e41d9ef21d945d237221ed1e22f4eafd0a5652edd1f0d468366"
  },
  {
    "path": "elts/sg-dei-cor_2026-01-01.xsd",
    "sha256": "c0e8302e11bbbfddfab9ec7f0f7fd80b3ef779d169d5e856397b35fe3c540113"
  },
  {
    "path": "elts/sg-ee/sg-ee-sfrs/sg-ee-sfrs_2026-01-01.xsd",
    "sha256": "18d77eab32a0934c3d1a7cb6ff1c2e923cbd8a4652d89ce3ef563df6da1d2cae"
  },
  {
    "path": "elts/sg-fsh-cor_2026-01-01.xsd",
    "sha256": "b15978180c140e1cff6b3483743c7159b09e3386edb2175a81578deff32ca7dd"
  },
  {
    "path": "elts/sg-lab-rol_2026-01-01.xsd",
    "sha256": "b517d755d84c22bdaff333eb91eca6bed036082d846291b3f8cbfa28232372f7"
  },
  {
    "path": "elts/sg-lm-cor_2026-01-01.xsd",
    "sha256": "9b147ce4514a004b102229ba8d078957ec874c6827284163f38796a013dfd21d"
  },
  {
    "path": "elts/sg-parts_2026-01-01.xsd",
    "sha256": "0fdc2a82bf693b51c565c934cdd41b5b85d2fc096e654bf529308c68a8d400ef"
  },
  {
    "path": "elts/sg-ssa-cor_2026-01-01.xsd",
    "sha256": "175e24037284b0542403b453157b7e07a9d790f77e2a94a9d28d4478f46d339e"
  },
  {
    "path": "elts/sg-ty-dim_2026-01-01.xsd",
    "sha256": "290cb4e8feceef8b5ebfcd8db37ac818ba5ff6a92bdec1ab2cea0ae38877c5df"
  },
  {
    "path": "elts/sg-types_2026-01-01.xsd",
    "sha256": "38edd8dc013518b97d2033fba7fcd2891b46f98083df17c65e24af40dedc0389"
  },
  {
    "path": "labels/sg-as_2026-01-01_lab.xml",
    "sha256": "3f96ceea63f8ac64ac46f5df66a1133d3b698eb03a9c9cf0e27e48ca7bd82eaf"
  },
  {
    "path": "labels/sg-ca_2026-01-01_lab.xml",
    "sha256": "424d0b25223fc1bf3133172f001c778358df5c5fdf94b57ea430f31d8fc93ca2"
  },
  {
    "path": "labels/sg-dei_2026-01-01_lab.xml",
    "sha256": "cf76fe11f9ba2dc5aaee034a2230bba55d9bce0cb6e5b06f6846e764f728a570"
  },
  {
    "path": "labels/sg-fsh_2026-01-01_lab.xml",
    "sha256": "8cdd0bc180c6872319fb47a0f4bad75007a2393b76496d9e6cfc488552e8747a"
  },
  {
    "path": "labels/sg-lm_2026-01-01_lab.xml",
    "sha256": "75b1a7005127e7e3fa289a2e6d899f644576f789b6ffa43af2ee8038f6146625"
  },
  {
    "path": "labels/sg-ssa_2026-01-01_lab.xml",
    "sha256": "740c810282e03dc9c576f7f9d08b464d22a131fcfc7901fddfd24ed623a94108"
  }
];

/** Element table: "prefix:LocalName" -> declaration (balance/period type drive fact emission). */
export const ELEMENTS: Record<string, TaxonomyElement> = {
  "sg-as:AccumulatedDepreciationAmortisationAndImpairmentOnDecreaseThroughLossOfControlOfSubsidiaryOnPropertyPlantAndEquipment": {
    "local": "AccumulatedDepreciationAmortisationAndImpairmentOnDecreaseThroughLossOfControlOfSubsidiaryOnPropertyPlantAndEquipment",
    "prefix": "sg-as",
    "id": "sg-as_AccumulatedDepreciationAmortisationAndImpairmentOnDecreaseThroughLossOfControlOfSubsidiaryOnPropertyPlantAndEquipment",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "debit",
    "label": "Accumulated depreciation amortisation and impairment on decrease through loss of control of subsidiary on property, plant and equipment"
  },
  "sg-as:AccumulatedDepreciationAmortisationAndImpairmentOnIncreaseDecreaseThroughNetExchangeDifferencesOnPropertyPlantAndEquipment": {
    "local": "AccumulatedDepreciationAmortisationAndImpairmentOnIncreaseDecreaseThroughNetExchangeDifferencesOnPropertyPlantAndEquipment",
    "prefix": "sg-as",
    "id": "sg-as_AccumulatedDepreciationAmortisationAndImpairmentOnIncreaseDecreaseThroughNetExchangeDifferencesOnPropertyPlantAndEquipment",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "credit",
    "label": "Accumulated depreciation amortisation and impairment on increase (decrease) through net exchange differences on property, plant and equipment"
  },
  "sg-as:AccumulatedDepreciationAmortisationAndImpairmentOnIncreaseDecreaseThroughOtherChangesPropertyPlantAndEquipment": {
    "local": "AccumulatedDepreciationAmortisationAndImpairmentOnIncreaseDecreaseThroughOtherChangesPropertyPlantAndEquipment",
    "prefix": "sg-as",
    "id": "sg-as_AccumulatedDepreciationAmortisationAndImpairmentOnIncreaseDecreaseThroughOtherChangesPropertyPlantAndEquipment",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "credit",
    "label": "Accumulated depreciation amortisation and impairment on increase (decrease) through other changes, property plant and equipment"
  },
  "sg-as:AccumulatedDepreciationAmortisationAndImpairmentOnPropertyPlantAndEquipment": {
    "local": "AccumulatedDepreciationAmortisationAndImpairmentOnPropertyPlantAndEquipment",
    "prefix": "sg-as",
    "id": "sg-as_AccumulatedDepreciationAmortisationAndImpairmentOnPropertyPlantAndEquipment",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Accumulated depreciation, amortisation and impairment on property, plant and equipment"
  },
  "sg-as:AccumulatedDepreciationAmortisationAndImpairmentOnPropertyPlantAndEquipmentAbstract": {
    "local": "AccumulatedDepreciationAmortisationAndImpairmentOnPropertyPlantAndEquipmentAbstract",
    "prefix": "sg-as",
    "id": "sg-as_AccumulatedDepreciationAmortisationAndImpairmentOnPropertyPlantAndEquipmentAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Accumulated depreciation, amortisation and impairment on property, plant and equipment [abstract]"
  },
  "sg-as:AccumulatedProfitsLosses": {
    "local": "AccumulatedProfitsLosses",
    "prefix": "sg-as",
    "id": "sg-as_AccumulatedProfitsLosses",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Accumulated profits (losses)"
  },
  "sg-as:AcquisitionsThroughBusinessCombinationsIntangibleAssetsOtherThanGoodwill": {
    "local": "AcquisitionsThroughBusinessCombinationsIntangibleAssetsOtherThanGoodwill",
    "prefix": "sg-as",
    "id": "sg-as_AcquisitionsThroughBusinessCombinationsIntangibleAssetsOtherThanGoodwill",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "debit",
    "label": "Acquisitions through business combinations, intangible assets other than goodwill"
  },
  "sg-as:AdditionsOtherThanThroughBusinessCombinationsPropertyPlantAndEquipment": {
    "local": "AdditionsOtherThanThroughBusinessCombinationsPropertyPlantAndEquipment",
    "prefix": "sg-as",
    "id": "sg-as_AdditionsOtherThanThroughBusinessCombinationsPropertyPlantAndEquipment",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "debit",
    "label": "Additions other than through business combinations, property, plant and equipment"
  },
  "sg-as:AmortisationAndImpairmentOnIntangibleAssetsOtherThanGoodwillAbstract": {
    "local": "AmortisationAndImpairmentOnIntangibleAssetsOtherThanGoodwillAbstract",
    "prefix": "sg-as",
    "id": "sg-as_AmortisationAndImpairmentOnIntangibleAssetsOtherThanGoodwillAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Amortisation and impairment on intangible assets other than goodwill [abstract]"
  },
  "sg-as:AmortisationAndImpairmentOnIntangibleAssetsOtherThanGoodwillGross": {
    "local": "AmortisationAndImpairmentOnIntangibleAssetsOtherThanGoodwillGross",
    "prefix": "sg-as",
    "id": "sg-as_AmortisationAndImpairmentOnIntangibleAssetsOtherThanGoodwillGross",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Amortisation and impairment on intangible assets other than goodwill, gross"
  },
  "sg-as:AmortisationExpense": {
    "local": "AmortisationExpense",
    "prefix": "sg-as",
    "id": "sg-as_AmortisationExpense",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "debit",
    "label": "Amortisation expense"
  },
  "sg-as:AmortisationIntangibleAssetsOtherThanGoodwill": {
    "local": "AmortisationIntangibleAssetsOtherThanGoodwill",
    "prefix": "sg-as",
    "id": "sg-as_AmortisationIntangibleAssetsOtherThanGoodwill",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "credit",
    "label": "Amortisation intangible assets other than goodwill"
  },
  "sg-as:AmortisationOfDecreaseThroughLossOfControlOfSubsidiaryOnIntangibleAssetsOtherThanGoodwill": {
    "local": "AmortisationOfDecreaseThroughLossOfControlOfSubsidiaryOnIntangibleAssetsOtherThanGoodwill",
    "prefix": "sg-as",
    "id": "sg-as_AmortisationOfDecreaseThroughLossOfControlOfSubsidiaryOnIntangibleAssetsOtherThanGoodwill",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "debit",
    "label": "Amortisation of decrease through loss of control of subsidiary on intangible assets other than goodwill"
  },
  "sg-as:AmortisationOfIncreaseDecreaseThroughNetExchangeDifferencesOnIntangibleAssetsOtherThanGoodwill": {
    "local": "AmortisationOfIncreaseDecreaseThroughNetExchangeDifferencesOnIntangibleAssetsOtherThanGoodwill",
    "prefix": "sg-as",
    "id": "sg-as_AmortisationOfIncreaseDecreaseThroughNetExchangeDifferencesOnIntangibleAssetsOtherThanGoodwill",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "credit",
    "label": "Amortisation of increase (decrease) through net exchange differences on intangible assets other than goodwill"
  },
  "sg-as:AmortisationOfIncreaseDecreaseThroughOtherChangesOnIntangibleAssetsOtherThanGoodwill": {
    "local": "AmortisationOfIncreaseDecreaseThroughOtherChangesOnIntangibleAssetsOtherThanGoodwill",
    "prefix": "sg-as",
    "id": "sg-as_AmortisationOfIncreaseDecreaseThroughOtherChangesOnIntangibleAssetsOtherThanGoodwill",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "credit",
    "label": "Amortisation of increase (decrease) through other changes intangible assets other than goodwill"
  },
  "sg-as:AnalysisOfIntangibleAssetsOtherThanGoodwillByMeasurementBasisAbstract": {
    "local": "AnalysisOfIntangibleAssetsOtherThanGoodwillByMeasurementBasisAbstract",
    "prefix": "sg-as",
    "id": "sg-as_AnalysisOfIntangibleAssetsOtherThanGoodwillByMeasurementBasisAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration"
  },
  "sg-as:AnalysisOfPropertyPlantAndEquipmenByMeasurementBasistAbstract": {
    "local": "AnalysisOfPropertyPlantAndEquipmenByMeasurementBasistAbstract",
    "prefix": "sg-as",
    "id": "sg-as_AnalysisOfPropertyPlantAndEquipmenByMeasurementBasistAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration"
  },
  "sg-as:Assets": {
    "local": "Assets",
    "prefix": "sg-as",
    "id": "sg-as_Assets",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit",
    "label": "Assets"
  },
  "sg-as:AssetsAbstract": {
    "local": "AssetsAbstract",
    "prefix": "sg-as",
    "id": "sg-as_AssetsAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Assets [abstract]"
  },
  "sg-as:BankOverdrafts": {
    "local": "BankOverdrafts",
    "prefix": "sg-as",
    "id": "sg-as_BankOverdrafts",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Bank overdrafts"
  },
  "sg-as:BrandNameMastheadsAndPublishingTitlesMember": {
    "local": "BrandNameMastheadsAndPublishingTitlesMember",
    "prefix": "sg-as",
    "id": "sg-as_BrandNameMastheadsAndPublishingTitlesMember",
    "type": "nonnum:domainItemType",
    "abstract": true,
    "periodType": "duration"
  },
  "sg-as:CapitalAndReservesAttributableToEquityOwnersOfCompanyAbstract": {
    "local": "CapitalAndReservesAttributableToEquityOwnersOfCompanyAbstract",
    "prefix": "sg-as",
    "id": "sg-as_CapitalAndReservesAttributableToEquityOwnersOfCompanyAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Capital and reserves attributable to equity owners of company [abstract]"
  },
  "sg-as:CarryingAmountOfPropertyPlantAndEquipmentAbstract": {
    "local": "CarryingAmountOfPropertyPlantAndEquipmentAbstract",
    "prefix": "sg-as",
    "id": "sg-as_CarryingAmountOfPropertyPlantAndEquipmentAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Carrying amount of property, plant and equipment [abstract]"
  },
  "sg-as:CashAndBankBalances": {
    "local": "CashAndBankBalances",
    "prefix": "sg-as",
    "id": "sg-as_CashAndBankBalances",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit",
    "label": "Cash and bank balances"
  },
  "sg-as:CashFlowsFromUsedInFinancingActivities": {
    "local": "CashFlowsFromUsedInFinancingActivities",
    "prefix": "sg-as",
    "id": "sg-as_CashFlowsFromUsedInFinancingActivities",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "debit",
    "label": "Cash flows from (used in) financing activities"
  },
  "sg-as:CashFlowsFromUsedInInvestingActivities": {
    "local": "CashFlowsFromUsedInInvestingActivities",
    "prefix": "sg-as",
    "id": "sg-as_CashFlowsFromUsedInInvestingActivities",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "debit",
    "label": "Cash flows from (used in) investing activities"
  },
  "sg-as:CashFlowsFromUsedInOperatingActivities": {
    "local": "CashFlowsFromUsedInOperatingActivities",
    "prefix": "sg-as",
    "id": "sg-as_CashFlowsFromUsedInOperatingActivities",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "label": "Cash flows from (used in) operating activities"
  },
  "sg-as:CategoriesOfRelatedPartiesAxis": {
    "local": "CategoriesOfRelatedPartiesAxis",
    "prefix": "sg-as",
    "id": "sg-as_CategoriesOfRelatedPartiesAxis",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Categories of related parties [axis]"
  },
  "sg-as:CategoriesOfRelatedPartiesMember": {
    "local": "CategoriesOfRelatedPartiesMember",
    "prefix": "sg-as",
    "id": "sg-as_CategoriesOfRelatedPartiesMember",
    "type": "nonnum:domainItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Categories of related parties [member]"
  },
  "sg-as:ClassesOfIntangibleAssetsAxis": {
    "local": "ClassesOfIntangibleAssetsAxis",
    "prefix": "sg-as",
    "id": "sg-as_ClassesOfIntangibleAssetsAxis",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Classes of intangible assets [axis]"
  },
  "sg-as:ClassesOfPartiesAxis": {
    "local": "ClassesOfPartiesAxis",
    "prefix": "sg-as",
    "id": "sg-as_ClassesOfPartiesAxis",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Classes of parties [axis]"
  },
  "sg-as:ClassesOfPropertyPlantAndEquipmentAxis": {
    "local": "ClassesOfPropertyPlantAndEquipmentAxis",
    "prefix": "sg-as",
    "id": "sg-as_ClassesOfPropertyPlantAndEquipmentAxis",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Classes of property, plant and equipment [axis]"
  },
  "sg-as:CommunicationAndNetworkEquipmentMember": {
    "local": "CommunicationAndNetworkEquipmentMember",
    "prefix": "sg-as",
    "id": "sg-as_CommunicationAndNetworkEquipmentMember",
    "type": "nonnum:domainItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Communication and network equipment [member]"
  },
  "sg-as:ComputerOfficeEquipmentAndFurnitureFixturesAndFittingsMember": {
    "local": "ComputerOfficeEquipmentAndFurnitureFixturesAndFittingsMember",
    "prefix": "sg-as",
    "id": "sg-as_ComputerOfficeEquipmentAndFurnitureFixturesAndFittingsMember",
    "type": "nonnum:domainItemType",
    "abstract": true,
    "periodType": "duration"
  },
  "sg-as:ComputerSoftwareMember": {
    "local": "ComputerSoftwareMember",
    "prefix": "sg-as",
    "id": "sg-as_ComputerSoftwareMember",
    "type": "nonnum:domainItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Computer software [member]"
  },
  "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis": {
    "local": "ConsolidatedAndSeparateFinancialStatementsAxis",
    "prefix": "sg-as",
    "id": "sg-as_ConsolidatedAndSeparateFinancialStatementsAxis",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Consolidated and separate financial statements [axis]"
  },
  "sg-as:ConsolidatedMember": {
    "local": "ConsolidatedMember",
    "prefix": "sg-as",
    "id": "sg-as_ConsolidatedMember",
    "type": "nonnum:domainItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Consolidated [member]"
  },
  "sg-as:ConstructionInProgressMember": {
    "local": "ConstructionInProgressMember",
    "prefix": "sg-as",
    "id": "sg-as_ConstructionInProgressMember",
    "type": "nonnum:domainItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Construction in progress [member]"
  },
  "sg-as:CopyrightsPatentsAndIndustrialPropertyRightsServiceAndOperatingRightsRecipesFormulaeModelsDesignsPrototypesCapitalDevelopmentExpenditureMember": {
    "local": "CopyrightsPatentsAndIndustrialPropertyRightsServiceAndOperatingRightsRecipesFormulaeModelsDesignsPrototypesCapitalDevelopmentExpenditureMember",
    "prefix": "sg-as",
    "id": "sg-as_CopyrightsPatentsAndIndustrialPropertyRightsServiceAndOperatingRightsRecipesFormulaeModelsDesignsPrototypesCapitalDevelopmentExpenditureMember",
    "type": "nonnum:domainItemType",
    "abstract": true,
    "periodType": "duration"
  },
  "sg-as:CurrentAssets": {
    "local": "CurrentAssets",
    "prefix": "sg-as",
    "id": "sg-as_CurrentAssets",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit",
    "label": "Current assets"
  },
  "sg-as:CurrentAssetsAbstract": {
    "local": "CurrentAssetsAbstract",
    "prefix": "sg-as",
    "id": "sg-as_CurrentAssetsAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Current assets [abstract]"
  },
  "sg-as:CurrentDerivativeFinancialAssets": {
    "local": "CurrentDerivativeFinancialAssets",
    "prefix": "sg-as",
    "id": "sg-as_CurrentDerivativeFinancialAssets",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit",
    "label": "Current derivative financial assets"
  },
  "sg-as:CurrentFinanceLeaseLiabilities": {
    "local": "CurrentFinanceLeaseLiabilities",
    "prefix": "sg-as",
    "id": "sg-as_CurrentFinanceLeaseLiabilities",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Current finance lease liabilities"
  },
  "sg-as:CurrentFinanceLeaseReceivables": {
    "local": "CurrentFinanceLeaseReceivables",
    "prefix": "sg-as",
    "id": "sg-as_CurrentFinanceLeaseReceivables",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit",
    "label": "Current finance lease receivables"
  },
  "sg-as:CurrentFinancialAssetsMeasuredAtFairValueThroughProfitOrLoss": {
    "local": "CurrentFinancialAssetsMeasuredAtFairValueThroughProfitOrLoss",
    "prefix": "sg-as",
    "id": "sg-as_CurrentFinancialAssetsMeasuredAtFairValueThroughProfitOrLoss",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit",
    "label": "Financial assets measured at fair value through profit or loss, current"
  },
  "sg-as:CurrentFinancialLiabilitiesMeasuredAtFairValueThroughProfitOrLoss": {
    "local": "CurrentFinancialLiabilitiesMeasuredAtFairValueThroughProfitOrLoss",
    "prefix": "sg-as",
    "id": "sg-as_CurrentFinancialLiabilitiesMeasuredAtFairValueThroughProfitOrLoss",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Financial liabilities measured at fair value through profit or loss, current"
  },
  "sg-as:CurrentIncomeTaxLiabilities": {
    "local": "CurrentIncomeTaxLiabilities",
    "prefix": "sg-as",
    "id": "sg-as_CurrentIncomeTaxLiabilities",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Current income tax liabilities"
  },
  "sg-as:CurrentLiabilities": {
    "local": "CurrentLiabilities",
    "prefix": "sg-as",
    "id": "sg-as_CurrentLiabilities",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Current liabilities"
  },
  "sg-as:CurrentLiabilitiesAbstract": {
    "local": "CurrentLiabilitiesAbstract",
    "prefix": "sg-as",
    "id": "sg-as_CurrentLiabilitiesAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Current liabilities [abstract]"
  },
  "sg-as:CurrentLoansAndBorrowings": {
    "local": "CurrentLoansAndBorrowings",
    "prefix": "sg-as",
    "id": "sg-as_CurrentLoansAndBorrowings",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Current loans and borrowings"
  },
  "sg-as:CurrentProvisions": {
    "local": "CurrentProvisions",
    "prefix": "sg-as",
    "id": "sg-as_CurrentProvisions",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Current provisions"
  },
  "sg-as:DateOfAuthorisationForIssueOfFinancialStatements": {
    "local": "DateOfAuthorisationForIssueOfFinancialStatements",
    "prefix": "sg-as",
    "id": "sg-as_DateOfAuthorisationForIssueOfFinancialStatements",
    "type": "xbrli:dateItemType",
    "abstract": false,
    "periodType": "instant",
    "label": "Date of authorisation for issue of financial statements"
  },
  "sg-as:DecreaseThroughLossOfControlOfSubsidiaryIntangibleAssetsOtherThanGoodwill": {
    "local": "DecreaseThroughLossOfControlOfSubsidiaryIntangibleAssetsOtherThanGoodwill",
    "prefix": "sg-as",
    "id": "sg-as_DecreaseThroughLossOfControlOfSubsidiaryIntangibleAssetsOtherThanGoodwill",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "credit",
    "label": "Decrease through loss of control of subsidiary, intangible assets other than goodwill"
  },
  "sg-as:DecreaseThroughLossOfControlOfSubsidiaryPropertyPlantAndEquipment": {
    "local": "DecreaseThroughLossOfControlOfSubsidiaryPropertyPlantAndEquipment",
    "prefix": "sg-as",
    "id": "sg-as_DecreaseThroughLossOfControlOfSubsidiaryPropertyPlantAndEquipment",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "credit",
    "label": "Decrease through loss of control of subsidiary, property, plant and equipment"
  },
  "sg-as:DeferredIncome": {
    "local": "DeferredIncome",
    "prefix": "sg-as",
    "id": "sg-as_DeferredIncome",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Deferred income"
  },
  "sg-as:DeferredTaxAssets": {
    "local": "DeferredTaxAssets",
    "prefix": "sg-as",
    "id": "sg-as_DeferredTaxAssets",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit",
    "label": "Deferred tax assets"
  },
  "sg-as:DeferredTaxLiabilities": {
    "local": "DeferredTaxLiabilities",
    "prefix": "sg-as",
    "id": "sg-as_DeferredTaxLiabilities",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Deferred tax liabilities"
  },
  "sg-as:DepreciationExpense": {
    "local": "DepreciationExpense",
    "prefix": "sg-as",
    "id": "sg-as_DepreciationExpense",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "debit",
    "label": "Depreciation expense"
  },
  "sg-as:DepreciationPropertyPlantAndEquipment": {
    "local": "DepreciationPropertyPlantAndEquipment",
    "prefix": "sg-as",
    "id": "sg-as_DepreciationPropertyPlantAndEquipment",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "label": "Depreciation, property, plant and equipment"
  },
  "sg-as:DescriptionOfFunctionalCurrency": {
    "local": "DescriptionOfFunctionalCurrency",
    "prefix": "sg-as",
    "id": "sg-as_DescriptionOfFunctionalCurrency",
    "type": "sg-types:CurrencyCodeItemType",
    "abstract": false,
    "periodType": "duration",
    "label": "Description of functional currency"
  },
  "sg-as:DescriptionOfNatureOfEntitysOperationsAndPrincipalActivities": {
    "local": "DescriptionOfNatureOfEntitysOperationsAndPrincipalActivities",
    "prefix": "sg-as",
    "id": "sg-as_DescriptionOfNatureOfEntitysOperationsAndPrincipalActivities",
    "type": "xbrli:stringItemType",
    "abstract": false,
    "periodType": "duration",
    "label": "Description of nature of entity's operations and principal activities"
  },
  "sg-as:DevelopmentProperties": {
    "local": "DevelopmentProperties",
    "prefix": "sg-as",
    "id": "sg-as_DevelopmentProperties",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit",
    "label": "Development properties"
  },
  "sg-as:DisclosureOfAdditionalInformationAbstract": {
    "local": "DisclosureOfAdditionalInformationAbstract",
    "prefix": "sg-as",
    "id": "sg-as_DisclosureOfAdditionalInformationAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Disclosure of additional information [abstract]"
  },
  "sg-as:DisclosureOfCompleteSetOfFinancialStatementsAbstract": {
    "local": "DisclosureOfCompleteSetOfFinancialStatementsAbstract",
    "prefix": "sg-as",
    "id": "sg-as_DisclosureOfCompleteSetOfFinancialStatementsAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration"
  },
  "sg-as:DisclosureOfCompleteSetOfFinancialStatementsTextBlock": {
    "local": "DisclosureOfCompleteSetOfFinancialStatementsTextBlock",
    "prefix": "sg-as",
    "id": "sg-as_DisclosureOfCompleteSetOfFinancialStatementsTextBlock",
    "type": "nonnum:textBlockItemType",
    "abstract": false,
    "periodType": "duration",
    "label": "Disclosure of complete set of financial statements [text block]"
  },
  "sg-as:DisclosureOfDetailedInformationAboutIntangibleAssetsLineItems": {
    "local": "DisclosureOfDetailedInformationAboutIntangibleAssetsLineItems",
    "prefix": "sg-as",
    "id": "sg-as_DisclosureOfDetailedInformationAboutIntangibleAssetsLineItems",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Disclosure of detailed information about intangible assets [line items]"
  },
  "sg-as:DisclosureOfDetailedInformationAboutIntangibleAssetsTable": {
    "local": "DisclosureOfDetailedInformationAboutIntangibleAssetsTable",
    "prefix": "sg-as",
    "id": "sg-as_DisclosureOfDetailedInformationAboutIntangibleAssetsTable",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Disclosure of detailed information about intangible assets [table]"
  },
  "sg-as:DisclosureOfDetailedInformationAboutPropertyPlantAndEquipmentAbstract": {
    "local": "DisclosureOfDetailedInformationAboutPropertyPlantAndEquipmentAbstract",
    "prefix": "sg-as",
    "id": "sg-as_DisclosureOfDetailedInformationAboutPropertyPlantAndEquipmentAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Disclosure of detailed information about property, plant and equipment [abstract]"
  },
  "sg-as:DisclosureOfDetailedInformationAboutPropertyPlantAndEquipmentLineItems": {
    "local": "DisclosureOfDetailedInformationAboutPropertyPlantAndEquipmentLineItems",
    "prefix": "sg-as",
    "id": "sg-as_DisclosureOfDetailedInformationAboutPropertyPlantAndEquipmentLineItems",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Disclosure of detailed information about property, plant and equipment [line items]"
  },
  "sg-as:DisclosureOfDetailedInformationAboutPropertyPlantAndEquipmentTable": {
    "local": "DisclosureOfDetailedInformationAboutPropertyPlantAndEquipmentTable",
    "prefix": "sg-as",
    "id": "sg-as_DisclosureOfDetailedInformationAboutPropertyPlantAndEquipmentTable",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Disclosure of detailed information about property, plant and equipment [table]"
  },
  "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherPayablesLineItems": {
    "local": "DisclosureOfDetailedInformationAboutTradeAndOtherPayablesLineItems",
    "prefix": "sg-as",
    "id": "sg-as_DisclosureOfDetailedInformationAboutTradeAndOtherPayablesLineItems",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Disclosure of detailed information about trade and other payables [line items]"
  },
  "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherPayablesTable": {
    "local": "DisclosureOfDetailedInformationAboutTradeAndOtherPayablesTable",
    "prefix": "sg-as",
    "id": "sg-as_DisclosureOfDetailedInformationAboutTradeAndOtherPayablesTable",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Disclosure of detailed information about trade and other payables [table]"
  },
  "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherReceivablesLineItems": {
    "local": "DisclosureOfDetailedInformationAboutTradeAndOtherReceivablesLineItems",
    "prefix": "sg-as",
    "id": "sg-as_DisclosureOfDetailedInformationAboutTradeAndOtherReceivablesLineItems",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Disclosure of detailed information about trade and other receivables [line items]"
  },
  "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherReceivablesTable": {
    "local": "DisclosureOfDetailedInformationAboutTradeAndOtherReceivablesTable",
    "prefix": "sg-as",
    "id": "sg-as_DisclosureOfDetailedInformationAboutTradeAndOtherReceivablesTable",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Disclosure of detailed information about trade and other receivables [table]"
  },
  "sg-as:DisclosureOfIntangibleAssetsAbstract": {
    "local": "DisclosureOfIntangibleAssetsAbstract",
    "prefix": "sg-as",
    "id": "sg-as_DisclosureOfIntangibleAssetsAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Disclosure of intangible assets [abstract]"
  },
  "sg-as:DisclosureOfLoansAndBorrowingsAbstract": {
    "local": "DisclosureOfLoansAndBorrowingsAbstract",
    "prefix": "sg-as",
    "id": "sg-as_DisclosureOfLoansAndBorrowingsAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration"
  },
  "sg-as:DisclosureOfLoansAndBorrowingsLineItems": {
    "local": "DisclosureOfLoansAndBorrowingsLineItems",
    "prefix": "sg-as",
    "id": "sg-as_DisclosureOfLoansAndBorrowingsLineItems",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration"
  },
  "sg-as:DisclosureOfLoansAndBorrowingsTable": {
    "local": "DisclosureOfLoansAndBorrowingsTable",
    "prefix": "sg-as",
    "id": "sg-as_DisclosureOfLoansAndBorrowingsTable",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration"
  },
  "sg-as:DisclosureOfOtherIncomeAbstract": {
    "local": "DisclosureOfOtherIncomeAbstract",
    "prefix": "sg-as",
    "id": "sg-as_DisclosureOfOtherIncomeAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration"
  },
  "sg-as:DisclosureOfRelatedPartyTransactionAbstract": {
    "local": "DisclosureOfRelatedPartyTransactionAbstract",
    "prefix": "sg-as",
    "id": "sg-as_DisclosureOfRelatedPartyTransactionAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration"
  },
  "sg-as:DisclosureOfRevenueAbstract": {
    "local": "DisclosureOfRevenueAbstract",
    "prefix": "sg-as",
    "id": "sg-as_DisclosureOfRevenueAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration"
  },
  "sg-as:DisclosureOfRevenueLineItems": {
    "local": "DisclosureOfRevenueLineItems",
    "prefix": "sg-as",
    "id": "sg-as_DisclosureOfRevenueLineItems",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration"
  },
  "sg-as:DisclosureOfRevenueTable": {
    "local": "DisclosureOfRevenueTable",
    "prefix": "sg-as",
    "id": "sg-as_DisclosureOfRevenueTable",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration"
  },
  "sg-as:DisclosureOfRightofuseAssetsAbstract": {
    "local": "DisclosureOfRightofuseAssetsAbstract",
    "prefix": "sg-as",
    "id": "sg-as_DisclosureOfRightofuseAssetsAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration"
  },
  "sg-as:DisclosureOfRightofuseAssetsItems": {
    "local": "DisclosureOfRightofuseAssetsItems",
    "prefix": "sg-as",
    "id": "sg-as_DisclosureOfRightofuseAssetsLineItems",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration"
  },
  "sg-as:DisclosureOfRightofuseAssetsTable": {
    "local": "DisclosureOfRightofuseAssetsTable",
    "prefix": "sg-as",
    "id": "sg-as_DisclosureOfRightofuseAssetsTable",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration"
  },
  "sg-as:DisclosureOfSelectedIncomeExpensesAbstract": {
    "local": "DisclosureOfSelectedIncomeExpensesAbstract",
    "prefix": "sg-as",
    "id": "sg-as_DisclosureOfSelectedIncomeExpensesAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Disclosure of selected income expenses [abstract]"
  },
  "sg-as:DisclosureOfSelectedIncomeExpensesLineItems": {
    "local": "DisclosureOfSelectedIncomeExpensesLineItems",
    "prefix": "sg-as",
    "id": "sg-as_DisclosureOfSelectedIncomeExpensesLineItems",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration"
  },
  "sg-as:DisclosureOfSelectedIncomeExpensesTable": {
    "local": "DisclosureOfSelectedIncomeExpensesTable",
    "prefix": "sg-as",
    "id": "sg-as_DisclosureOfSelectedIncomeExpensesTable",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration"
  },
  "sg-as:DisclosureOfTransactionsBetweenRelatedPartiesLineItems": {
    "local": "DisclosureOfTransactionsBetweenRelatedPartiesLineItems",
    "prefix": "sg-as",
    "id": "sg-as_DisclosureOfTransactionsBetweenRelatedPartiesLineItems",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Disclosure of transactions between related parties [line items]"
  },
  "sg-as:DividendDeclaredDuringTheYear": {
    "local": "DividendDeclaredDuringTheYear",
    "prefix": "sg-as",
    "id": "sg-as_DividendDeclaredDuringTheYear",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "debit"
  },
  "sg-as:DividendIncomeClassifiedAsOtherIncome": {
    "local": "DividendIncomeClassifiedAsOtherIncome",
    "prefix": "sg-as",
    "id": "sg-as_DividendIncomeClassifiedAsOtherIncome",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "credit",
    "label": "Dividend income, classified as other income"
  },
  "sg-as:EmployeeBenefitsExpense": {
    "local": "EmployeeBenefitsExpense",
    "prefix": "sg-as",
    "id": "sg-as_EmployeeBenefitsExpense",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "debit",
    "label": "Employee benefits expense"
  },
  "sg-as:Equity": {
    "local": "Equity",
    "prefix": "sg-as",
    "id": "sg-as_Equity",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Equity"
  },
  "sg-as:EquityAbstract": {
    "local": "EquityAbstract",
    "prefix": "sg-as",
    "id": "sg-as_EquityAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Equity [abstract]"
  },
  "sg-as:FinanceCosts": {
    "local": "FinanceCosts",
    "prefix": "sg-as",
    "id": "sg-as_FinanceCosts",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "debit",
    "label": "Finance costs"
  },
  "sg-as:Goodwill": {
    "local": "Goodwill",
    "prefix": "sg-as",
    "id": "sg-as_Goodwill",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit",
    "label": "Goodwill"
  },
  "sg-as:GovernmentGrantsClassifiedAsOtherIncome": {
    "local": "GovernmentGrantsClassifiedAsOtherIncome",
    "prefix": "sg-as",
    "id": "sg-as_GovernmentGrantsClassifiedAsOtherIncome",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "credit",
    "label": "Government grants, classified as other income"
  },
  "sg-as:GrossCarryingAmountOfIntangibleAssets": {
    "local": "GrossCarryingAmountOfIntangibleAssets",
    "prefix": "sg-as",
    "id": "sg-as_GrossCarryingAmountOfIntangibleAssets",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit",
    "label": "Gross carrying amount of intangible assets"
  },
  "sg-as:GrossCarryingAmountOfPropertyPlantAndEquipment": {
    "local": "GrossCarryingAmountOfPropertyPlantAndEquipment",
    "prefix": "sg-as",
    "id": "sg-as_GrossCarryingAmountOfPropertyPlantAndEquipment",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit",
    "label": "Gross carrying amount of property, plant and equipment"
  },
  "sg-as:GrossCarryingAmountOfPropertyPlantAndEquipmentAbstract": {
    "local": "GrossCarryingAmountOfPropertyPlantAndEquipmentAbstract",
    "prefix": "sg-as",
    "id": "sg-as_GrossCarryingAmountOfPropertyPlantAndEquipmentAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Gross carrying amount of property, plant and equipment [abstract]"
  },
  "sg-as:ImpairmentLossPropertyPlantAndEquipment": {
    "local": "ImpairmentLossPropertyPlantAndEquipment",
    "prefix": "sg-as",
    "id": "sg-as_ImpairmentLossPropertyPlantAndEquipment",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "credit",
    "label": "Impairment loss , property, plant and equipment"
  },
  "sg-as:ImpairmentLossRecognisedInProfitOrLossIntangibleAssetsOtherThanGoodwill": {
    "local": "ImpairmentLossRecognisedInProfitOrLossIntangibleAssetsOtherThanGoodwill",
    "prefix": "sg-as",
    "id": "sg-as_ImpairmentLossRecognisedInProfitOrLossIntangibleAssetsOtherThanGoodwill",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "credit",
    "label": "Impairment loss recognised in profit or loss, intangible assets other than goodwill"
  },
  "sg-as:ImpairmentLossReversalOfImpairmentLossOnInvestments": {
    "local": "ImpairmentLossReversalOfImpairmentLossOnInvestments",
    "prefix": "sg-as",
    "id": "sg-as_ImpairmentLossReversalOfImpairmentLossOnInvestments",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "debit"
  },
  "sg-as:ImpairmentLossReversalOfImpairmentLossOnOthers": {
    "local": "ImpairmentLossReversalOfImpairmentLossOnOthers",
    "prefix": "sg-as",
    "id": "sg-as_ImpairmentLossReversalOfImpairmentLossOnOthers",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "debit"
  },
  "sg-as:ImpairmentLossReversalOfImpairmentLossOnReceivables": {
    "local": "ImpairmentLossReversalOfImpairmentLossOnReceivables",
    "prefix": "sg-as",
    "id": "sg-as_ImpairmentLossReversalOfImpairmentLossOnReceivables",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "debit"
  },
  "sg-as:IncreaseDecreaseInInventoriesOfFinishedGoodsAndWorkInProgress": {
    "local": "IncreaseDecreaseInInventoriesOfFinishedGoodsAndWorkInProgress",
    "prefix": "sg-as",
    "id": "sg-as_IncreaseDecreaseInInventoriesOfFinishedGoodsAndWorkInProgress",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "debit",
    "label": "Increase (decrease) in inventories of finished goods and work-in-progress"
  },
  "sg-as:IncreaseDecreaseThroughNetExchangeDifferencesIntangibleAssetsOtherThanGoodwill": {
    "local": "IncreaseDecreaseThroughNetExchangeDifferencesIntangibleAssetsOtherThanGoodwill",
    "prefix": "sg-as",
    "id": "sg-as_IncreaseDecreaseThroughNetExchangeDifferencesIntangibleAssetsOtherThanGoodwill",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "debit",
    "label": "Increase (decrease) through net exchange differences, intangible assets other than goodwill"
  },
  "sg-as:IncreaseDecreaseThroughNetExchangeDifferencesPropertyPlantAndEquipment": {
    "local": "IncreaseDecreaseThroughNetExchangeDifferencesPropertyPlantAndEquipment",
    "prefix": "sg-as",
    "id": "sg-as_IncreaseDecreaseThroughNetExchangeDifferencesPropertyPlantAndEquipment",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "debit",
    "label": "Increase (decrease) through net exchange differences, property, plant and equipment"
  },
  "sg-as:IncreaseDecreaseThroughOtherChangesIntangibleAssetsOtherThanGoodwill": {
    "local": "IncreaseDecreaseThroughOtherChangesIntangibleAssetsOtherThanGoodwill",
    "prefix": "sg-as",
    "id": "sg-as_IncreaseDecreaseThroughOtherChangesIntangibleAssetsOtherThanGoodwill",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "debit",
    "label": "Increase (decrease) through other changes, intangible assets other than goodwill"
  },
  "sg-as:IncreaseDecreaseThroughOtherChangesPropertyPlantAndEquipment": {
    "local": "IncreaseDecreaseThroughOtherChangesPropertyPlantAndEquipment",
    "prefix": "sg-as",
    "id": "sg-as_IncreaseDecreaseThroughOtherChangesPropertyPlantAndEquipment",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "debit",
    "label": "Increase (decrease) through other changes, property, plant and equipment"
  },
  "sg-as:IntangibleAssetsMember": {
    "local": "IntangibleAssetsMember",
    "prefix": "sg-as",
    "id": "sg-as_IntangibleAssetsMember",
    "type": "nonnum:domainItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Intangible assets [member]"
  },
  "sg-as:IntangibleAssetsOtherThanGoodwill": {
    "local": "IntangibleAssetsOtherThanGoodwill",
    "prefix": "sg-as",
    "id": "sg-as_IntangibleAssetsOtherThanGoodwill",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit",
    "label": "Intangible assets other than goodwill"
  },
  "sg-as:IntangibleAssetsOtherThanGoodwillAtCost": {
    "local": "IntangibleAssetsOtherThanGoodwillAtCost",
    "prefix": "sg-as",
    "id": "sg-as_IntangibleAssetsOtherThanGoodwillAtCost",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit"
  },
  "sg-as:IntangibleAssetsOtherThanGoodwillAtValuation": {
    "local": "IntangibleAssetsOtherThanGoodwillAtValuation",
    "prefix": "sg-as",
    "id": "sg-as_IntangibleAssetsOtherThanGoodwillAtValuation",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit"
  },
  "sg-as:IntangibleAssetsOtherThanGoodwillGrossAbstract": {
    "local": "IntangibleAssetsOtherThanGoodwillGrossAbstract",
    "prefix": "sg-as",
    "id": "sg-as_IntangibleAssetsOtherThanGoodwillGrossAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Intangible assets other than goodwill, gross [abstract]"
  },
  "sg-as:IntangibleAssetsOtherThanGoodwillNetAbstract": {
    "local": "IntangibleAssetsOtherThanGoodwillNetAbstract",
    "prefix": "sg-as",
    "id": "sg-as_IntangibleAssetsOtherThanGoodwillNetAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Intangible assets other than goodwill, net [abstract]"
  },
  "sg-as:IntangibleAssetsUnderDevelopmentMember": {
    "local": "IntangibleAssetsUnderDevelopmentMember",
    "prefix": "sg-as",
    "id": "sg-as_IntangibleAssetsUnderDevelopmentMember",
    "type": "nonnum:domainItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Intangible assets under development [member]"
  },
  "sg-as:InterestIncomeClassifiedAsOtherIncome": {
    "local": "InterestIncomeClassifiedAsOtherIncome",
    "prefix": "sg-as",
    "id": "sg-as_InterestIncomeClassifiedAsOtherIncome",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "credit",
    "label": "Interest income, classified as other income"
  },
  "sg-as:Inventories": {
    "local": "Inventories",
    "prefix": "sg-as",
    "id": "sg-as_Inventories",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit",
    "label": "Inventories"
  },
  "sg-as:InvestmentProperties": {
    "local": "InvestmentProperties",
    "prefix": "sg-as",
    "id": "sg-as_InvestmentProperties",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit",
    "label": "Investment properties"
  },
  "sg-as:InvestmentsInSubsidiariesAssociatesOrJointVentures": {
    "local": "InvestmentsInSubsidiariesAssociatesOrJointVentures",
    "prefix": "sg-as",
    "id": "sg-as_InvestmentsInSubsidiariesAssociatesOrJointVentures",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit"
  },
  "sg-as:LandAndBuildingMember": {
    "local": "LandAndBuildingMember",
    "prefix": "sg-as",
    "id": "sg-as_LandAndBuildingMember",
    "type": "nonnum:domainItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Land and building [member]"
  },
  "sg-as:LeaseholdImprovementsMember": {
    "local": "LeaseholdImprovementsMember",
    "prefix": "sg-as",
    "id": "sg-as_LeaseholdImprovementsMember",
    "type": "nonnum:domainItemType",
    "abstract": true,
    "periodType": "duration"
  },
  "sg-as:Liabilities": {
    "local": "Liabilities",
    "prefix": "sg-as",
    "id": "sg-as_Liabilities",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Liabilities"
  },
  "sg-as:LiabilitiesAbstract": {
    "local": "LiabilitiesAbstract",
    "prefix": "sg-as",
    "id": "sg-as_LiabilitiesAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Liabilities [abstract]"
  },
  "sg-as:LiabilitiesAndEquityAbstract": {
    "local": "LiabilitiesAndEquityAbstract",
    "prefix": "sg-as",
    "id": "sg-as_LiabilitiesAndEquityAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Liabilities and equity [abstract]"
  },
  "sg-as:LiabilitiesClassifiedAsHeldForSale": {
    "local": "LiabilitiesClassifiedAsHeldForSale",
    "prefix": "sg-as",
    "id": "sg-as_LiabilitiesClassifiedAsHeldForSale",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Liabilities classified as held for sale"
  },
  "sg-as:LicencesAndFranchisesMember": {
    "local": "LicencesAndFranchisesMember",
    "prefix": "sg-as",
    "id": "sg-as_LicencesAndFranchisesMember",
    "type": "nonnum:domainItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Licences and franchises [member]"
  },
  "sg-as:LoansAndBorrowings": {
    "local": "LoansAndBorrowings",
    "prefix": "sg-as",
    "id": "sg-as_LoansAndBorrowings",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Loans and borrowings"
  },
  "sg-as:LoansAndBorrowingsAbstract": {
    "local": "LoansAndBorrowingsAbstract",
    "prefix": "sg-as",
    "id": "sg-as_LoansAndBorrowingsAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Loans and borrowings [abstract]"
  },
  "sg-as:MachineryAndOtherEquipmentMember": {
    "local": "MachineryAndOtherEquipmentMember",
    "prefix": "sg-as",
    "id": "sg-as_MachineryAndOtherEquipmentMember",
    "type": "nonnum:domainItemType",
    "abstract": true,
    "periodType": "duration"
  },
  "sg-as:MaterialExpensesAbstract": {
    "local": "MaterialExpensesAbstract",
    "prefix": "sg-as",
    "id": "sg-as_MaterialExpensesAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Material expenses [abstract]"
  },
  "sg-as:MaterialGainsLossesAbstract": {
    "local": "MaterialGainsLossesAbstract",
    "prefix": "sg-as",
    "id": "sg-as_MaterialGainsLossesAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Material gains (losses) [abstract]"
  },
  "sg-as:MiscellaneousIncomeClassifiedAsOtherIncome": {
    "local": "MiscellaneousIncomeClassifiedAsOtherIncome",
    "prefix": "sg-as",
    "id": "sg-as_MiscellaneousIncomeClassifiedAsOtherIncome",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "credit"
  },
  "sg-as:MotorAndOtherVehiclesMember": {
    "local": "MotorAndOtherVehiclesMember",
    "prefix": "sg-as",
    "id": "sg-as_MotorAndOtherVehiclesMember",
    "type": "nonnum:domainItemType",
    "abstract": true,
    "periodType": "duration"
  },
  "sg-as:NameOfParentEntity": {
    "local": "NameOfParentEntity",
    "prefix": "sg-as",
    "id": "sg-as_NameOfParentEntity",
    "type": "xbrli:stringItemType",
    "abstract": false,
    "periodType": "duration",
    "label": "Name of parent entity"
  },
  "sg-as:NameOfUltimateParentOfGroup": {
    "local": "NameOfUltimateParentOfGroup",
    "prefix": "sg-as",
    "id": "sg-as_NameOfUltimateParentOfGroup",
    "type": "xbrli:stringItemType",
    "abstract": false,
    "periodType": "duration",
    "label": "Name of ultimate parent of group"
  },
  "sg-as:NetCashFlowsAbstract": {
    "local": "NetCashFlowsAbstract",
    "prefix": "sg-as",
    "id": "sg-as_NetCashFlowsAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Net cash flows [abstract]"
  },
  "sg-as:NetGainsLossesOnDisposalOfIntangibleAssets": {
    "local": "NetGainsLossesOnDisposalOfIntangibleAssets",
    "prefix": "sg-as",
    "id": "sg-as_NetGainsLossesOnDisposalOfIntangibleAssets",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "credit",
    "label": "Net gains (losses) on disposal of intangible assets"
  },
  "sg-as:NetGainsLossesOnDisposalOfPropertyPlantAndEquipment": {
    "local": "NetGainsLossesOnDisposalOfPropertyPlantAndEquipment",
    "prefix": "sg-as",
    "id": "sg-as_NetGainsLossesOnDisposalOfPropertyPlantAndEquipment",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "credit",
    "label": "Net gains (losses) on disposal of property, plant and equipment"
  },
  "sg-as:NetGainsLossesOnForeignExchangeAdjustment": {
    "local": "NetGainsLossesOnForeignExchangeAdjustment",
    "prefix": "sg-as",
    "id": "sg-as_NetGainsLossesOnForeignExchangeAdjustment",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "credit",
    "label": "Net gains (losses) on foreign exchange adjustment"
  },
  "sg-as:NetIncomeAsCalculatedForSelectedIncomeExpenses": {
    "local": "NetIncomeAsCalculatedForSelectedIncomeExpenses",
    "prefix": "sg-as",
    "id": "sg-as_NetIncomeAsCalculatedForSelectedIncomeExpenses",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "label": "Net income as calculated for selected income expenses"
  },
  "sg-as:NoncontrollingInterests": {
    "local": "NoncontrollingInterests",
    "prefix": "sg-as",
    "id": "sg-as_NoncontrollingInterests",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Non-controlling interests"
  },
  "sg-as:NoncurrentAssets": {
    "local": "NoncurrentAssets",
    "prefix": "sg-as",
    "id": "sg-as_NoncurrentAssets",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit",
    "label": "Non-current assets"
  },
  "sg-as:NoncurrentAssetsAbstract": {
    "local": "NoncurrentAssetsAbstract",
    "prefix": "sg-as",
    "id": "sg-as_NoncurrentAssetsAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Non-current assets [abstract]"
  },
  "sg-as:NoncurrentAssetsOrDisposalGroupsClassifiedAsHeldForSaleOrAsHeldForDistributionToOwners": {
    "local": "NoncurrentAssetsOrDisposalGroupsClassifiedAsHeldForSaleOrAsHeldForDistributionToOwners",
    "prefix": "sg-as",
    "id": "sg-as_NoncurrentAssetsOrDisposalGroupsClassifiedAsHeldForSaleOrAsHeldForDistributionToOwners",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit",
    "label": "Non-current assets or disposal groups classified as held for sale or as held for distribution to owners"
  },
  "sg-as:NoncurrentDerivativeFinancialAssets": {
    "local": "NoncurrentDerivativeFinancialAssets",
    "prefix": "sg-as",
    "id": "sg-as_NoncurrentDerivativeFinancialAssets",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit",
    "label": "Non-current derivative financial assets"
  },
  "sg-as:NoncurrentFinanceLeaseLiabilities": {
    "local": "NoncurrentFinanceLeaseLiabilities",
    "prefix": "sg-as",
    "id": "sg-as_NoncurrentFinanceLeaseLiabilities",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Non-current finance lease liabilities"
  },
  "sg-as:NoncurrentFinanceLeaseReceivables": {
    "local": "NoncurrentFinanceLeaseReceivables",
    "prefix": "sg-as",
    "id": "sg-as_NoncurrentFinanceLeaseReceivables",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit",
    "label": "Non-current finance lease receivables"
  },
  "sg-as:NoncurrentFinancialAssetsMeasuredAtFairValueThroughProfitOrLoss": {
    "local": "NoncurrentFinancialAssetsMeasuredAtFairValueThroughProfitOrLoss",
    "prefix": "sg-as",
    "id": "sg-as_NoncurrentFinancialAssetsMeasuredAtFairValueThroughProfitOrLoss",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit",
    "label": "Financial assets measured at fair value through profit or loss, non-current"
  },
  "sg-as:NoncurrentFinancialLiabilitiesMeasuredAtFairValueThroughProfitOrLoss": {
    "local": "NoncurrentFinancialLiabilitiesMeasuredAtFairValueThroughProfitOrLoss",
    "prefix": "sg-as",
    "id": "sg-as_NoncurrentFinancialLiabilitiesMeasuredAtFairValueThroughProfitOrLoss",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Financial liabilities measured at fair value through profit or loss, non-current"
  },
  "sg-as:NoncurrentLiabilities": {
    "local": "NoncurrentLiabilities",
    "prefix": "sg-as",
    "id": "sg-as_NoncurrentLiabilities",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Non-current liabilities"
  },
  "sg-as:NoncurrentLiabilitiesAbstract": {
    "local": "NoncurrentLiabilitiesAbstract",
    "prefix": "sg-as",
    "id": "sg-as_NoncurrentLiabilitiesAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Non-current liabilities [abstract]"
  },
  "sg-as:NoncurrentLoansAndBorrowings": {
    "local": "NoncurrentLoansAndBorrowings",
    "prefix": "sg-as",
    "id": "sg-as_NoncurrentLoansAndBorrowings",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Non-current loans and borrowings"
  },
  "sg-as:NoncurrentProvisions": {
    "local": "NoncurrentProvisions",
    "prefix": "sg-as",
    "id": "sg-as_NoncurrentProvisions",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Non-current provisions"
  },
  "sg-as:NumberOfEmployeesOfCompany": {
    "local": "NumberOfEmployeesOfCompany",
    "prefix": "sg-as",
    "id": "sg-as_NumberOfEmployeesOfCompany",
    "type": "xbrli:nonNegativeIntegerItemType",
    "abstract": false,
    "periodType": "duration",
    "label": "No. of employees of the Company"
  },
  "sg-as:NumberOfEmployeesOfGroup": {
    "local": "NumberOfEmployeesOfGroup",
    "prefix": "sg-as",
    "id": "sg-as_NumberOfEmployeesOfGroup",
    "type": "sg-types:NumberOfEmployeesOfGroupItemType",
    "abstract": false,
    "periodType": "duration",
    "label": "No. of employees of the Group (if it is part of a group)"
  },
  "sg-as:OtherBorrowings": {
    "local": "OtherBorrowings",
    "prefix": "sg-as",
    "id": "sg-as_OtherBorrowings",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Other borrowings"
  },
  "sg-as:OtherCurrentFinancialAssets": {
    "local": "OtherCurrentFinancialAssets",
    "prefix": "sg-as",
    "id": "sg-as_OtherCurrentFinancialAssets",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit",
    "label": "Other current financial assets"
  },
  "sg-as:OtherCurrentFinancialLiabilities": {
    "local": "OtherCurrentFinancialLiabilities",
    "prefix": "sg-as",
    "id": "sg-as_OtherCurrentFinancialLiabilities",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Other current financial liabilities"
  },
  "sg-as:OtherCurrentNonfinancialAssets": {
    "local": "OtherCurrentNonfinancialAssets",
    "prefix": "sg-as",
    "id": "sg-as_OtherCurrentNonfinancialAssets",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit",
    "label": "Other current non-financial assets"
  },
  "sg-as:OtherCurrentNonfinancialLiabilities": {
    "local": "OtherCurrentNonfinancialLiabilities",
    "prefix": "sg-as",
    "id": "sg-as_OtherCurrentNonfinancialLiabilities",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Other current non-financial liabilities"
  },
  "sg-as:OtherExpensesByNature": {
    "local": "OtherExpensesByNature",
    "prefix": "sg-as",
    "id": "sg-as_OtherExpensesByNature",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "debit",
    "label": "Other expenses, by nature"
  },
  "sg-as:OtherGainsLosses": {
    "local": "OtherGainsLosses",
    "prefix": "sg-as",
    "id": "sg-as_OtherGainsLosses",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "credit",
    "label": "Other gains (losses)"
  },
  "sg-as:OtherIncome": {
    "local": "OtherIncome",
    "prefix": "sg-as",
    "id": "sg-as_OtherIncome",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "credit",
    "label": "Other income"
  },
  "sg-as:OtherIntangibleAssetsMember": {
    "local": "OtherIntangibleAssetsMember",
    "prefix": "sg-as",
    "id": "sg-as_OtherIntangibleAssetsMember",
    "type": "nonnum:domainItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Other intangible assets [member]"
  },
  "sg-as:OtherInvestmentIncomeClassifiedAsOtherIncome": {
    "local": "OtherInvestmentIncomeClassifiedAsOtherIncome",
    "prefix": "sg-as",
    "id": "sg-as_OtherInvestmentIncomeClassifiedAsOtherIncome",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "credit",
    "label": "Other investment income, classified as other income"
  },
  "sg-as:OtherNoncurrentFinancialAssets": {
    "local": "OtherNoncurrentFinancialAssets",
    "prefix": "sg-as",
    "id": "sg-as_OtherNoncurrentFinancialAssets",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit",
    "label": "Other non-current financial assets"
  },
  "sg-as:OtherNoncurrentFinancialLiabilities": {
    "local": "OtherNoncurrentFinancialLiabilities",
    "prefix": "sg-as",
    "id": "sg-as_OtherNoncurrentFinancialLiabilities",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Other non-current financial liabilities"
  },
  "sg-as:OtherNoncurrentNonfinancialAssets": {
    "local": "OtherNoncurrentNonfinancialAssets",
    "prefix": "sg-as",
    "id": "sg-as_OtherNoncurrentNonfinancialAssets",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit",
    "label": "Other non-current non-financial assets"
  },
  "sg-as:OtherNoncurrentNonfinancialLiabilities": {
    "local": "OtherNoncurrentNonfinancialLiabilities",
    "prefix": "sg-as",
    "id": "sg-as_OtherNoncurrentNonfinancialLiabilities",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Other non-current non-financial liabilities"
  },
  "sg-as:OtherPayables": {
    "local": "OtherPayables",
    "prefix": "sg-as",
    "id": "sg-as_OtherPayables",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Other payables"
  },
  "sg-as:OtherPropertyPlantAndEquipmentMember": {
    "local": "OtherPropertyPlantAndEquipmentMember",
    "prefix": "sg-as",
    "id": "sg-as_OtherPropertyPlantAndEquipmentMember",
    "type": "nonnum:domainItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Other property, plant and equipment [member]"
  },
  "sg-as:OtherReceivables": {
    "local": "OtherReceivables",
    "prefix": "sg-as",
    "id": "sg-as_OtherReceivables",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit",
    "label": "Other receivables"
  },
  "sg-as:OtherRevenue": {
    "local": "OtherRevenue",
    "prefix": "sg-as",
    "id": "sg-as_OtherRevenue",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "credit",
    "label": "Other revenue"
  },
  "sg-as:PrincipalPlaceOfBusinessIfDifferentFromRegisteredOffice": {
    "local": "PrincipalPlaceOfBusinessIfDifferentFromRegisteredOffice",
    "prefix": "sg-as",
    "id": "sg-as_PrincipalPlaceOfBusinessIfDifferentFromRegisteredOffice",
    "type": "xbrli:stringItemType",
    "abstract": false,
    "periodType": "duration",
    "label": "Principal place of business, if different from registered office"
  },
  "sg-as:ProfitLoss": {
    "local": "ProfitLoss",
    "prefix": "sg-as",
    "id": "sg-as_ProfitLoss",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "credit",
    "label": "Profit (loss)"
  },
  "sg-as:ProfitLossAbstract": {
    "local": "ProfitLossAbstract",
    "prefix": "sg-as",
    "id": "sg-as_ProfitLossAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Profit (loss) [abstract]"
  },
  "sg-as:ProfitLossAttributableToAbstract": {
    "local": "ProfitLossAttributableToAbstract",
    "prefix": "sg-as",
    "id": "sg-as_ProfitLossAttributableToAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Profit (loss), attributable to [abstract]"
  },
  "sg-as:ProfitLossAttributableToNoncontrollingInterests": {
    "local": "ProfitLossAttributableToNoncontrollingInterests",
    "prefix": "sg-as",
    "id": "sg-as_ProfitLossAttributableToNoncontrollingInterests",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "credit",
    "label": "Profit (loss), attributable to non-controlling interests"
  },
  "sg-as:ProfitLossAttributableToOwnersOfCompany": {
    "local": "ProfitLossAttributableToOwnersOfCompany",
    "prefix": "sg-as",
    "id": "sg-as_ProfitLossAttributableToOwnersOfCompany",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "credit",
    "label": "Profit (loss), attributable to owners of company"
  },
  "sg-as:ProfitLossBeforeTaxation": {
    "local": "ProfitLossBeforeTaxation",
    "prefix": "sg-as",
    "id": "sg-as_ProfitLossBeforeTaxation",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "credit",
    "label": "Profit (loss) before taxation"
  },
  "sg-as:ProfitLossFromDiscontinuedOperations": {
    "local": "ProfitLossFromDiscontinuedOperations",
    "prefix": "sg-as",
    "id": "sg-as_ProfitLossFromDiscontinuedOperations",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "credit",
    "label": "Profit (loss) from discontinued operations"
  },
  "sg-as:PropertyPlantAndEquipment": {
    "local": "PropertyPlantAndEquipment",
    "prefix": "sg-as",
    "id": "sg-as_PropertyPlantAndEquipment",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit",
    "label": "Property, plant and equipment"
  },
  "sg-as:PropertyPlantAndEquipmentAtCost": {
    "local": "PropertyPlantAndEquipmentAtCost",
    "prefix": "sg-as",
    "id": "sg-as_PropertyPlantAndEquipmentAtCost",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit"
  },
  "sg-as:PropertyPlantAndEquipmentAtValuation": {
    "local": "PropertyPlantAndEquipmentAtValuation",
    "prefix": "sg-as",
    "id": "sg-as_PropertyPlantAndEquipmentAtValuation",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit"
  },
  "sg-as:PropertyPlantAndEquipmentMember": {
    "local": "PropertyPlantAndEquipmentMember",
    "prefix": "sg-as",
    "id": "sg-as_PropertyPlantAndEquipmentMember",
    "type": "nonnum:domainItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Property, plant and equipment [member]"
  },
  "sg-as:PurchasesFromRelatedPartyTransactions": {
    "local": "PurchasesFromRelatedPartyTransactions",
    "prefix": "sg-as",
    "id": "sg-as_PurchasesFromRelatedPartyTransactions",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration"
  },
  "sg-as:RawMaterialsAndConsumablesUsed": {
    "local": "RawMaterialsAndConsumablesUsed",
    "prefix": "sg-as",
    "id": "sg-as_RawMaterialsAndConsumablesUsed",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "debit",
    "label": "Raw materials and consumables used"
  },
  "sg-as:RelatedPartyTransactionsAbstract": {
    "local": "RelatedPartyTransactionsAbstract",
    "prefix": "sg-as",
    "id": "sg-as_RelatedPartyTransactionsAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Related party transactions [abstract]"
  },
  "sg-as:RelatedPartyTransactionsTable": {
    "local": "RelatedPartyTransactionsTable",
    "prefix": "sg-as",
    "id": "sg-as_RelatedPartyTransactionsTable",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Related party transactions [table]"
  },
  "sg-as:RepairsAndMaintenanceExpense": {
    "local": "RepairsAndMaintenanceExpense",
    "prefix": "sg-as",
    "id": "sg-as_RepairsAndMaintenanceExpense",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "debit",
    "label": "Repairs and maintenance expense"
  },
  "sg-as:ReservesOtherThanAccumulatedProfitsLosses": {
    "local": "ReservesOtherThanAccumulatedProfitsLosses",
    "prefix": "sg-as",
    "id": "sg-as_ReservesOtherThanAccumulatedProfitsLosses",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Reserves other than accumulated profits (losses)"
  },
  "sg-as:Revenue": {
    "local": "Revenue",
    "prefix": "sg-as",
    "id": "sg-as_Revenue",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "credit",
    "label": "Revenue"
  },
  "sg-as:RevenueAbstract": {
    "local": "RevenueAbstract",
    "prefix": "sg-as",
    "id": "sg-as_RevenueAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Revenue [abstract]"
  },
  "sg-as:RevenueFromConstructionContractsOverTime": {
    "local": "RevenueFromConstructionContractsOverTime",
    "prefix": "sg-as",
    "id": "sg-as_RevenueFromConstructionContractsOverTime",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "credit"
  },
  "sg-as:RevenueFromGoodsTransferredAtPointInTime": {
    "local": "RevenueFromGoodsTransferredAtPointInTime",
    "prefix": "sg-as",
    "id": "sg-as_RevenueFromGoodsTransferredAtPointInTime",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "credit"
  },
  "sg-as:RevenueFromPropertyTransferredAtPointInTime": {
    "local": "RevenueFromPropertyTransferredAtPointInTime",
    "prefix": "sg-as",
    "id": "sg-as_RevenueFromPropertyTransferredAtPointInTime",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "credit"
  },
  "sg-as:RevenueFromPropertyTransferredOverTime": {
    "local": "RevenueFromPropertyTransferredOverTime",
    "prefix": "sg-as",
    "id": "sg-as_RevenueFromPropertyTransferredOverTime",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "credit"
  },
  "sg-as:RevenueFromRelatedPartyTransactions": {
    "local": "RevenueFromRelatedPartyTransactions",
    "prefix": "sg-as",
    "id": "sg-as_RevenueFromRelatedPartyTransactions",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration"
  },
  "sg-as:RevenueFromServicesTransferredAtPointInTime": {
    "local": "RevenueFromServicesTransferredAtPointInTime",
    "prefix": "sg-as",
    "id": "sg-as_RevenueFromServicesTransferredAtPointInTime",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "credit"
  },
  "sg-as:RevenueFromServicesTransferredOverTime": {
    "local": "RevenueFromServicesTransferredOverTime",
    "prefix": "sg-as",
    "id": "sg-as_RevenueFromServicesTransferredOverTime",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "credit"
  },
  "sg-as:ReversalOfImpairmentLossPropertyPlantAndEquipment": {
    "local": "ReversalOfImpairmentLossPropertyPlantAndEquipment",
    "prefix": "sg-as",
    "id": "sg-as_ReversalOfImpairmentLossPropertyPlantAndEquipment",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "debit",
    "label": "Reversal of impairment loss , property, plant and equipment"
  },
  "sg-as:ReversalOfImpairmentLossRecognisedInProfitOrLossIntangibleAssetsOtherThanGoodwill": {
    "local": "ReversalOfImpairmentLossRecognisedInProfitOrLossIntangibleAssetsOtherThanGoodwill",
    "prefix": "sg-as",
    "id": "sg-as_ReversalOfImpairmentLossRecognisedInProfitOrLossIntangibleAssetsOtherThanGoodwill",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "debit",
    "label": "Reversal of impairment loss recognised in profit or loss, intangible assets other than goodwill"
  },
  "sg-as:RightofuseAssetsAbstract": {
    "local": "RightofuseAssetsAbstract",
    "prefix": "sg-as",
    "id": "sg-as_RightofuseAssetsAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration"
  },
  "sg-as:RightofuseAssetsClassifiedInIntangibleAssetsOtherThanGoodwill": {
    "local": "RightofuseAssetsClassifiedInIntangibleAssetsOtherThanGoodwill",
    "prefix": "sg-as",
    "id": "sg-as_RightofuseAssetsClassifiedInIntangibleAssetsOtherThanGoodwill",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit"
  },
  "sg-as:RightofuseAssetsClassifiedInOtherAssets": {
    "local": "RightofuseAssetsClassifiedInOtherAssets",
    "prefix": "sg-as",
    "id": "sg-as_RightofuseAssetsClassifiedInOtherAssets",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit"
  },
  "sg-as:RightofuseAssetsClassifiedInPropertyPlantAndEquipment": {
    "local": "RightofuseAssetsClassifiedInPropertyPlantAndEquipment",
    "prefix": "sg-as",
    "id": "sg-as_RightofuseAssetsClassifiedInPropertyPlantAndEquipment",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit"
  },
  "sg-as:SalesAndMarketingExpense": {
    "local": "SalesAndMarketingExpense",
    "prefix": "sg-as",
    "id": "sg-as_SalesAndMarketingExpense",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "debit",
    "label": "Sales and marketing expense"
  },
  "sg-as:SecuredBankBorrowings": {
    "local": "SecuredBankBorrowings",
    "prefix": "sg-as",
    "id": "sg-as_SecuredBankBorrowings",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Secured bank borrowings"
  },
  "sg-as:SeparateMember": {
    "local": "SeparateMember",
    "prefix": "sg-as",
    "id": "sg-as_SeparateMember",
    "type": "nonnum:domainItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Separate [member]"
  },
  "sg-as:ShareCapital": {
    "local": "ShareCapital",
    "prefix": "sg-as",
    "id": "sg-as_ShareCapital",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Share capital"
  },
  "sg-as:ShareOfProfitLossOfAssociatesAndJointVenturesAccountedForUsingEquityMethod": {
    "local": "ShareOfProfitLossOfAssociatesAndJointVenturesAccountedForUsingEquityMethod",
    "prefix": "sg-as",
    "id": "sg-as_ShareOfProfitLossOfAssociatesAndJointVenturesAccountedForUsingEquityMethod",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "credit",
    "label": "Share of profit (loss) of associates and joint ventures accounted for using equity method"
  },
  "sg-as:StatementOfCashFlowsAbstract": {
    "local": "StatementOfCashFlowsAbstract",
    "prefix": "sg-as",
    "id": "sg-as_StatementOfCashFlowsAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Statement of cash flows [abstract]"
  },
  "sg-as:StatementOfCashFlowsLineItems": {
    "local": "StatementOfCashFlowsLineItems",
    "prefix": "sg-as",
    "id": "sg-as_StatementOfCashFlowsLineItems",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration"
  },
  "sg-as:StatementOfCashFlowsTable": {
    "local": "StatementOfCashFlowsTable",
    "prefix": "sg-as",
    "id": "sg-as_StatementOfCashFlowsTable",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration"
  },
  "sg-as:StatementOfFinancialPositionAbstract": {
    "local": "StatementOfFinancialPositionAbstract",
    "prefix": "sg-as",
    "id": "sg-as_StatementOfFinancialPositionAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration"
  },
  "sg-as:StatementOfFinancialPositionLineItems": {
    "local": "StatementOfFinancialPositionLineItems",
    "prefix": "sg-as",
    "id": "sg-as_StatementOfFinancialPositionLineItems",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration"
  },
  "sg-as:StatementOfFinancialPositionTable": {
    "local": "StatementOfFinancialPositionTable",
    "prefix": "sg-as",
    "id": "sg-as_StatementOfFinancialPositionTable",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration"
  },
  "sg-as:StatementOfProfitOrLossAbstract": {
    "local": "StatementOfProfitOrLossAbstract",
    "prefix": "sg-as",
    "id": "sg-as_StatementOfProfitOrLossAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration"
  },
  "sg-as:StatementOfProfitOrLossLineItems": {
    "local": "StatementOfProfitOrLossLineItems",
    "prefix": "sg-as",
    "id": "sg-as_StatementOfProfitOrLossLineItems",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration"
  },
  "sg-as:StatementOfProfitOrLossTable": {
    "local": "StatementOfProfitOrLossTable",
    "prefix": "sg-as",
    "id": "sg-as_StatementOfProfitOrLossTable",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration"
  },
  "sg-as:SubcontractorCost": {
    "local": "SubcontractorCost",
    "prefix": "sg-as",
    "id": "sg-as_SubcontractorCost",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "debit"
  },
  "sg-as:TaxExpenseBenefitContinuingOperations": {
    "local": "TaxExpenseBenefitContinuingOperations",
    "prefix": "sg-as",
    "id": "sg-as_TaxExpenseBenefitContinuingOperations",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "duration",
    "balance": "debit",
    "label": "Tax expense (benefit) continuing operations"
  },
  "sg-as:TradeAndOtherPayables": {
    "local": "TradeAndOtherPayables",
    "prefix": "sg-as",
    "id": "sg-as_TradeAndOtherPayables",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Trade and other payables"
  },
  "sg-as:TradeAndOtherPayablesAbstract": {
    "local": "TradeAndOtherPayablesAbstract",
    "prefix": "sg-as",
    "id": "sg-as_TradeAndOtherPayablesAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Trade and other payables [abstract]"
  },
  "sg-as:TradeAndOtherPayablesCurrent": {
    "local": "TradeAndOtherPayablesCurrent",
    "prefix": "sg-as",
    "id": "sg-as_TradeAndOtherPayablesCurrent",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Trade and other payables, current"
  },
  "sg-as:TradeAndOtherPayablesDueToRelatedParties": {
    "local": "TradeAndOtherPayablesDueToRelatedParties",
    "prefix": "sg-as",
    "id": "sg-as_TradeAndOtherPayablesDueToRelatedParties",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit"
  },
  "sg-as:TradeAndOtherPayablesDueToThirdParties": {
    "local": "TradeAndOtherPayablesDueToThirdParties",
    "prefix": "sg-as",
    "id": "sg-as_TradeAndOtherPayablesDueToThirdParties",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit"
  },
  "sg-as:TradeAndOtherPayablesNoncurrent": {
    "local": "TradeAndOtherPayablesNoncurrent",
    "prefix": "sg-as",
    "id": "sg-as_TradeAndOtherPayablesNoncurrent",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Trade and other payables, non-current"
  },
  "sg-as:TradeAndOtherReceivables": {
    "local": "TradeAndOtherReceivables",
    "prefix": "sg-as",
    "id": "sg-as_TradeAndOtherReceivables",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit",
    "label": "Trade and other receivables"
  },
  "sg-as:TradeAndOtherReceivablesAbstract": {
    "local": "TradeAndOtherReceivablesAbstract",
    "prefix": "sg-as",
    "id": "sg-as_TradeAndOtherReceivablesAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Trade and other receivables [abstract]"
  },
  "sg-as:TradeAndOtherReceivablesCurrent": {
    "local": "TradeAndOtherReceivablesCurrent",
    "prefix": "sg-as",
    "id": "sg-as_TradeAndOtherReceivablesCurrent",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit",
    "label": "Trade and other receivables, current"
  },
  "sg-as:TradeAndOtherReceivablesDueFromRelatedParties": {
    "local": "TradeAndOtherReceivablesDueFromRelatedParties",
    "prefix": "sg-as",
    "id": "sg-as_TradeAndOtherReceivablesDueFromRelatedParties",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit"
  },
  "sg-as:TradeAndOtherReceivablesDueFromThirdParties": {
    "local": "TradeAndOtherReceivablesDueFromThirdParties",
    "prefix": "sg-as",
    "id": "sg-as_TradeAndOtherReceivablesDueFromThirdParties",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit"
  },
  "sg-as:TradeAndOtherReceivablesNoncurrent": {
    "local": "TradeAndOtherReceivablesNoncurrent",
    "prefix": "sg-as",
    "id": "sg-as_TradeAndOtherReceivablesNoncurrent",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit",
    "label": "Trade and other receivables, non-current"
  },
  "sg-as:TreasuryShares": {
    "local": "TreasuryShares",
    "prefix": "sg-as",
    "id": "sg-as_TreasuryShares",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Treasury shares"
  },
  "sg-as:UnbilledReceivables": {
    "local": "UnbilledReceivables",
    "prefix": "sg-as",
    "id": "sg-as_UnbilledReceivables",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "debit",
    "label": "Unbilled receivables"
  },
  "sg-as:UniqueEntityNumberOfSingaporeParentCompanyPreparingConsolidatedFinancialStatements": {
    "local": "UniqueEntityNumberOfSingaporeParentCompanyPreparingConsolidatedFinancialStatements",
    "prefix": "sg-as",
    "id": "sg-as_UniqueEntityNumberOfSingaporeParentCompanyPreparingConsolidatedFinancialStatements",
    "type": "sg-types:UENItemType",
    "abstract": false,
    "periodType": "duration",
    "label": "UEN of Singapore parent company preparing consolidated financial statements"
  },
  "sg-as:UnsecuredBankBorrowings": {
    "local": "UnsecuredBankBorrowings",
    "prefix": "sg-as",
    "id": "sg-as_UnsecuredBankBorrowings",
    "type": "xbrli:monetaryItemType",
    "abstract": false,
    "periodType": "instant",
    "balance": "credit",
    "label": "Unsecured bank borrowings"
  },
  "sg-as:WhetherCompanyHasAnySubsidiaryAssociateOrJointVenture": {
    "local": "WhetherCompanyHasAnySubsidiaryAssociateOrJointVenture",
    "prefix": "sg-as",
    "id": "sg-as_WhetherCompanyHasAnySubsidiaryAssociateOrJointVenture",
    "type": "sg-types:YesNoItemType",
    "abstract": false,
    "periodType": "duration",
    "label": "Whether the company has any subsidiary/associate/joint venture?"
  },
  "sg-as:WhetherCompanyHasOverseasInvestmentsInSubsidiariesAssociatesOrJointVentures": {
    "local": "WhetherCompanyHasOverseasInvestmentsInSubsidiariesAssociatesOrJointVentures",
    "prefix": "sg-as",
    "id": "sg-as_WhetherCompanyHasOverseasInvestmentsInSubsidiariesAssociatesOrJointVentures",
    "type": "sg-types:YesNoItemType",
    "abstract": false,
    "periodType": "duration"
  },
  "sg-as:WhetherCompanyIsSubsidiary": {
    "local": "WhetherCompanyIsSubsidiary",
    "prefix": "sg-as",
    "id": "sg-as_WhetherCompanyIsSubsidiary",
    "type": "sg-types:WhetherCompanyIsSubsidiaryItemType",
    "abstract": false,
    "periodType": "duration",
    "label": "Whether the company is a subsidiary?"
  },
  "sg-as:WhetherEntityHasAnySingaporeIncorporatedParentCompany": {
    "local": "WhetherEntityHasAnySingaporeIncorporatedParentCompany",
    "prefix": "sg-as",
    "id": "sg-as_WhetherEntityHasAnySingaporeIncorporatedParentCompany",
    "type": "sg-types:YesNoItemType",
    "abstract": false,
    "periodType": "duration",
    "label": "Do you have any Singapore-incorporated parent company (immediate/intermediate/ultimate parent)?"
  },
  "sg-as:WhetherEntityIsForeignIncorporatedCompanyPreparingAndFilingSetOfConsolidatedFinancialStatementsIndicateWebsiteOrAvenueWhereConsolidatedFinancialStatementsCanBeFound": {
    "local": "WhetherEntityIsForeignIncorporatedCompanyPreparingAndFilingSetOfConsolidatedFinancialStatementsIndicateWebsiteOrAvenueWhereConsolidatedFinancialStatementsCanBeFound",
    "prefix": "sg-as",
    "id": "sg-as_WhetherEntityIsForeignIncorporatedCompanyPreparingAndFilingSetOfConsolidatedFinancialStatementsIndicateWebsiteOrAvenueWhereConsolidatedFinancialStatementsCanBeFound",
    "type": "xbrli:stringItemType",
    "abstract": false,
    "periodType": "duration",
    "label": "If you have a foreign-incorporated parent company (immediate/intermediate/ultimate parent) that prepares and makes its set of consolidated financial statements (which included itself) public, indicate the website/avenue where the consolidated financial statements can be found."
  },
  "sg-as:WhetherEntityIsSingaporeIncorporatedParentPreparingAndFilingSetOfConsolidatedFinancialStatementsWithACRA": {
    "local": "WhetherEntityIsSingaporeIncorporatedParentPreparingAndFilingSetOfConsolidatedFinancialStatementsWithACRA",
    "prefix": "sg-as",
    "id": "sg-as_WhetherEntityIsSingaporeIncorporatedParentPreparingAndFilingSetOfConsolidatedFinancialStatementsWithACRA",
    "type": "sg-types:YesNoItemType",
    "abstract": false,
    "periodType": "duration",
    "label": "Does the Singapore parent company file this set of consolidated financial statements (which included the company) with ACRA?"
  },
  "sg-ca:DisclosureInStatementByDirectorsAbstract": {
    "local": "DisclosureInStatementByDirectorsAbstract",
    "prefix": "sg-ca",
    "id": "sg-ca_DisclosureInStatementByDirectorsAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration"
  },
  "sg-ca:WhetherInAuditorsOpinionAccountingAndOtherRecordsRequiredAreProperlyKeptInAccordanceWithCompaniesAct": {
    "local": "WhetherInAuditorsOpinionAccountingAndOtherRecordsRequiredAreProperlyKeptInAccordanceWithCompaniesAct",
    "prefix": "sg-ca",
    "id": "sg-ca_WhetherInAuditorsOpinionAccountingAndOtherRecordsRequiredAreProperlyKeptInAccordanceWithCompaniesAct",
    "type": "sg-types:YesNoNotApplicableItemType",
    "abstract": false,
    "periodType": "duration",
    "label": "Whether in auditors' opinion, accounting and other records required are properly kept in accordance with Companies Act"
  },
  "sg-ca:WhetherInDirectorsOpinionFinancialStatementsAreDrawnUpSoAsToExhibitATrueAndFairView": {
    "local": "WhetherInDirectorsOpinionFinancialStatementsAreDrawnUpSoAsToExhibitATrueAndFairView",
    "prefix": "sg-ca",
    "id": "sg-ca_WhetherInDirectorsOpinionFinancialStatementsAreDrawnUpSoAsToExhibitATrueAndFairView",
    "type": "sg-types:YesNoItemType",
    "abstract": false,
    "periodType": "duration",
    "label": "Whether in directors' opinion financial statements are drawn up so as to exhibit true and fair view"
  },
  "sg-ca:WhetherThereAreReasonableGroundsToBelieveThatCompanyWillBeAbleToPayItsDebtsAsAndWhenTheyFallDueAtDateOfStatement": {
    "local": "WhetherThereAreReasonableGroundsToBelieveThatCompanyWillBeAbleToPayItsDebtsAsAndWhenTheyFallDueAtDateOfStatement",
    "prefix": "sg-ca",
    "id": "sg-ca_WhetherThereAreReasonableGroundsToBelieveThatCompanyWillBeAbleToPayItsDebtsAsAndWhenTheyFallDueAtDateOfStatement",
    "type": "sg-types:YesNoItemType",
    "abstract": false,
    "periodType": "duration",
    "label": "Whether there are reasonable grounds to believe that company will be able to pay its debts as and when they fall due at date of statement"
  },
  "sg-dei:CurrentPeriodEndDate": {
    "local": "CurrentPeriodEndDate",
    "prefix": "sg-dei",
    "id": "sg-dei_CurrentPeriodEndDate",
    "type": "xbrli:dateItemType",
    "abstract": false,
    "periodType": "instant",
    "label": "Current period end date"
  },
  "sg-dei:CurrentPeriodStartDate": {
    "local": "CurrentPeriodStartDate",
    "prefix": "sg-dei",
    "id": "sg-dei_CurrentPeriodStartDate",
    "type": "xbrli:dateItemType",
    "abstract": false,
    "periodType": "instant",
    "label": "Current period start date"
  },
  "sg-dei:DescriptionOfPresentationCurrency": {
    "local": "DescriptionOfPresentationCurrency",
    "prefix": "sg-dei",
    "id": "sg-dei_DescriptionOfPresentationCurrency",
    "type": "sg-types:CurrencyCodeItemType",
    "abstract": false,
    "periodType": "duration",
    "label": "Description of presentation currency"
  },
  "sg-dei:DetailsOfInstanceDocumentAbstract": {
    "local": "DetailsOfInstanceDocumentAbstract",
    "prefix": "sg-dei",
    "id": "sg-dei_DetailsOfInstanceDocumentAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Details of instance document [abstract]"
  },
  "sg-dei:DisclosureOfFilingInformationAbstract": {
    "local": "DisclosureOfFilingInformationAbstract",
    "prefix": "sg-dei",
    "id": "sg-dei_DisclosureOfFilingInformationAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration",
    "label": "Disclosure of filing information [abstract]"
  },
  "sg-dei:HowWasXBRLInstanceDocumentPrepared": {
    "local": "HowWasXBRLInstanceDocumentPrepared",
    "prefix": "sg-dei",
    "id": "sg-dei_HowWasXBRLInstanceDocumentPrepared",
    "type": "sg-types:PreparationOfXBRLFileItemType",
    "abstract": false,
    "periodType": "duration",
    "label": "How was XBRL file prepared"
  },
  "sg-dei:LevelOfRoundingUsedInFinancialStatements": {
    "local": "LevelOfRoundingUsedInFinancialStatements",
    "prefix": "sg-dei",
    "id": "sg-dei_LevelOfRoundingUsedInFinancialStatements",
    "type": "sg-types:LevelOfRoundingItemType",
    "abstract": false,
    "periodType": "duration",
    "label": "Level of rounding used in financial statements"
  },
  "sg-dei:NameAndVersionOfSoftwareUsedToGenerateInstanceDocument": {
    "local": "NameAndVersionOfSoftwareUsedToGenerateInstanceDocument",
    "prefix": "sg-dei",
    "id": "sg-dei_NameAndVersionOfSoftwareUsedToGenerateInstanceDocument",
    "type": "xbrli:stringItemType",
    "abstract": false,
    "periodType": "duration"
  },
  "sg-dei:NameOfCompany": {
    "local": "NameOfCompany",
    "prefix": "sg-dei",
    "id": "sg-dei_NameOfCompany",
    "type": "xbrli:stringItemType",
    "abstract": false,
    "periodType": "duration",
    "label": "Name of Company (as registered in BizFile)"
  },
  "sg-dei:NatureOfFinancialStatementsCompanyLevelOrConsolidated": {
    "local": "NatureOfFinancialStatementsCompanyLevelOrConsolidated",
    "prefix": "sg-dei",
    "id": "sg-dei_NatureOfFinancialStatementsCompanyLevelOrConsolidated",
    "type": "sg-types:NatureOfFinancialStatementsItemType",
    "abstract": false,
    "periodType": "duration",
    "label": "Nature of financial statements - company level or consolidated"
  },
  "sg-dei:PriorPeriodStartDate": {
    "local": "PriorPeriodStartDate",
    "prefix": "sg-dei",
    "id": "sg-dei_PriorPeriodStartDate",
    "type": "xbrli:dateItemType",
    "abstract": false,
    "periodType": "instant",
    "label": "Prior period start date"
  },
  "sg-dei:TaxonomyVersion": {
    "local": "TaxonomyVersion",
    "prefix": "sg-dei",
    "id": "sg-dei_TaxonomyVersion",
    "type": "sg-types:TaxonomyVersionItemType",
    "abstract": false,
    "periodType": "duration",
    "label": "Taxonomy version"
  },
  "sg-dei:TypeOfAccountingStandardUsedToPrepareFinancialStatements": {
    "local": "TypeOfAccountingStandardUsedToPrepareFinancialStatements",
    "prefix": "sg-dei",
    "id": "sg-dei_TypeOfAccountingStandardUsedToPrepareFinancialStatements",
    "type": "sg-types:AccountingStandardsItemType",
    "abstract": false,
    "periodType": "duration",
    "label": "Type of accounting standard used to prepare financial statements"
  },
  "sg-dei:TypeOfStatementOfFinancialPosition": {
    "local": "TypeOfStatementOfFinancialPosition",
    "prefix": "sg-dei",
    "id": "sg-dei_TypeOfStatementOfFinancialPosition",
    "type": "sg-types:StatementOfFinancialPositionItemType",
    "abstract": false,
    "periodType": "duration",
    "label": "Type of statement of financial position"
  },
  "sg-dei:TypeOfXBRLFiling": {
    "local": "TypeOfXBRLFiling",
    "prefix": "sg-dei",
    "id": "sg-dei_TypeOfXBRLFiling",
    "type": "sg-types:XBRLFilingItemType",
    "abstract": false,
    "periodType": "duration"
  },
  "sg-dei:UniqueEntityNumber": {
    "local": "UniqueEntityNumber",
    "prefix": "sg-dei",
    "id": "sg-dei_UniqueEntityNumber",
    "type": "sg-types:UENItemType",
    "abstract": false,
    "periodType": "duration",
    "label": "Unique entity number"
  },
  "sg-dei:WhetherCompanyOrGroupIfConsolidatedAccountsArePreparedHasMoreThan50Employees": {
    "local": "WhetherCompanyOrGroupIfConsolidatedAccountsArePreparedHasMoreThan50Employees",
    "prefix": "sg-dei",
    "id": "sg-dei_WhetherCompanyOrGroupIfConsolidatedAccountsArePreparedHasMoreThan50Employees",
    "type": "sg-types:YesNoItemType",
    "abstract": false,
    "periodType": "duration",
    "label": "Whether company (or group if consolidated accounts are prepared) has more than 50 employees"
  },
  "sg-dei:WhetherFinancialStatementsArePreparedOnGoingConcernBasis": {
    "local": "WhetherFinancialStatementsArePreparedOnGoingConcernBasis",
    "prefix": "sg-dei",
    "id": "sg-dei_WhetherFinancialStatementsArePreparedOnGoingConcernBasis",
    "type": "sg-types:YesNoItemType",
    "abstract": false,
    "periodType": "duration"
  },
  "sg-dei:WhetherThereAreChangesToComparativeAmountsDueToRestatementsReclassificationOrOtherReasons": {
    "local": "WhetherThereAreChangesToComparativeAmountsDueToRestatementsReclassificationOrOtherReasons",
    "prefix": "sg-dei",
    "id": "sg-dei_WhetherThereAreChangesToComparativeAmountsDueToRestatementsReclassificationOrOtherReasons",
    "type": "sg-types:YesNoItemType",
    "abstract": false,
    "periodType": "duration"
  },
  "sg-lm:YearOfAppointmentOfSigningAuditor": {
    "local": "YearOfAppointmentOfSigningAuditor",
    "prefix": "sg-lm",
    "id": "sg-lm_YearOfAppointmentOfSigningAuditor",
    "type": "xbrli:gYearItemType",
    "abstract": false,
    "periodType": "instant",
    "label": "Year of appointment of signing auditor"
  },
  "sg-ssa:AuditingStandardsUsedToConductAudit": {
    "local": "AuditingStandardsUsedToConductAudit",
    "prefix": "sg-ssa",
    "id": "sg-ssa_AuditingStandardsUsedToConductAudit",
    "type": "sg-types:TypeOfAccountingStandardsItemType",
    "abstract": false,
    "periodType": "duration"
  },
  "sg-ssa:DidAuditorConcludeThatThereIsMaterialMisstatementOfOtherInformation": {
    "local": "DidAuditorConcludeThatThereIsMaterialMisstatementOfOtherInformation",
    "prefix": "sg-ssa",
    "id": "sg-ssa_DidAuditorConcludeThatThereIsMaterialMisstatementOfOtherInformation",
    "type": "sg-types:YesNoUnableToConcludeItemType",
    "abstract": false,
    "periodType": "duration"
  },
  "sg-ssa:DisclosuresInIndependentAuditorsReportAbstract": {
    "local": "DisclosuresInIndependentAuditorsReportAbstract",
    "prefix": "sg-ssa",
    "id": "sg-ssa_DisclosuresInIndependentAuditorsReportAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration"
  },
  "sg-ssa:DisclosuresOnKeyAuditMattersAbstract": {
    "local": "DisclosuresOnKeyAuditMattersAbstract",
    "prefix": "sg-ssa",
    "id": "sg-ssa_DisclosuresOnKeyAuditMattersAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration"
  },
  "sg-ssa:KeyAuditMattersImpairmentOfGoodwillAndOtherIntangibleAssets": {
    "local": "KeyAuditMattersImpairmentOfGoodwillAndOtherIntangibleAssets",
    "prefix": "sg-ssa",
    "id": "sg-ssa_KeyAuditMattersImpairmentOfGoodwillAndOtherIntangibleAssets",
    "type": "xbrli:nonNegativeIntegerItemType",
    "abstract": false,
    "periodType": "duration"
  },
  "sg-ssa:KeyAuditMattersOthers": {
    "local": "KeyAuditMattersOthers",
    "prefix": "sg-ssa",
    "id": "sg-ssa_KeyAuditMattersOthers",
    "type": "xbrli:nonNegativeIntegerItemType",
    "abstract": false,
    "periodType": "duration"
  },
  "sg-ssa:KeyAuditMattersRevenueRecognition": {
    "local": "KeyAuditMattersRevenueRecognition",
    "prefix": "sg-ssa",
    "id": "sg-ssa_KeyAuditMattersRevenueRecognition",
    "type": "xbrli:nonNegativeIntegerItemType",
    "abstract": false,
    "periodType": "duration"
  },
  "sg-ssa:KeyAuditMattersValuationOfInvestmentProperty": {
    "local": "KeyAuditMattersValuationOfInvestmentProperty",
    "prefix": "sg-ssa",
    "id": "sg-ssa_KeyAuditMattersValuationOfInvestmentProperty",
    "type": "xbrli:nonNegativeIntegerItemType",
    "abstract": false,
    "periodType": "duration"
  },
  "sg-ssa:KeyAuditMattersValuationOfPropertyPlantAndEquipment": {
    "local": "KeyAuditMattersValuationOfPropertyPlantAndEquipment",
    "prefix": "sg-ssa",
    "id": "sg-ssa_KeyAuditMattersValuationOfPropertyPlantAndEquipment",
    "type": "xbrli:nonNegativeIntegerItemType",
    "abstract": false,
    "periodType": "duration"
  },
  "sg-ssa:KeyAuditMattersValuationOfReceivablesAndOtherFinancialInstruments": {
    "local": "KeyAuditMattersValuationOfReceivablesAndOtherFinancialInstruments",
    "prefix": "sg-ssa",
    "id": "sg-ssa_KeyAuditMattersValuationOfReceivablesAndOtherFinancialInstruments",
    "type": "xbrli:nonNegativeIntegerItemType",
    "abstract": false,
    "periodType": "duration"
  },
  "sg-ssa:NumberOfKeyAuditMattersReported": {
    "local": "NumberOfKeyAuditMattersReported",
    "prefix": "sg-ssa",
    "id": "sg-ssa_NumberOfKeyAuditMattersReported",
    "type": "xbrli:nonNegativeIntegerItemType",
    "abstract": false,
    "periodType": "duration"
  },
  "sg-ssa:ReasonForModifiedAuditOpinionAbstract": {
    "local": "ReasonForModifiedAuditOpinionAbstract",
    "prefix": "sg-ssa",
    "id": "sg-ssa_ReasonForModifiedAuditOpinionAbstract",
    "type": "xbrli:stringItemType",
    "abstract": true,
    "periodType": "duration"
  },
  "sg-ssa:ReasonForModifiedAuditOpinionRelatedToAuditOfOpeningBalance": {
    "local": "ReasonForModifiedAuditOpinionRelatedToAuditOfOpeningBalance",
    "prefix": "sg-ssa",
    "id": "sg-ssa_ReasonForModifiedAuditOpinionRelatedToAuditOfOpeningBalance",
    "type": "sg-types:YesItemType",
    "abstract": false,
    "periodType": "duration"
  },
  "sg-ssa:ReasonForModifiedAuditOpinionRelatedToConsolidatedOrEquityAccounting": {
    "local": "ReasonForModifiedAuditOpinionRelatedToConsolidatedOrEquityAccounting",
    "prefix": "sg-ssa",
    "id": "sg-ssa_ReasonForModifiedAuditOpinionRelatedToConsolidatedOrEquityAccounting",
    "type": "sg-types:YesItemType",
    "abstract": false,
    "periodType": "duration"
  },
  "sg-ssa:ReasonForModifiedAuditOpinionRelatedToGoingConcern": {
    "local": "ReasonForModifiedAuditOpinionRelatedToGoingConcern",
    "prefix": "sg-ssa",
    "id": "sg-ssa_ReasonForModifiedAuditOpinionRelatedToGoingConcern",
    "type": "sg-types:YesItemType",
    "abstract": false,
    "periodType": "duration"
  },
  "sg-ssa:ReasonForModifiedAuditOpinionRelatedToImpairmentOfAssets": {
    "local": "ReasonForModifiedAuditOpinionRelatedToImpairmentOfAssets",
    "prefix": "sg-ssa",
    "id": "sg-ssa_ReasonForModifiedAuditOpinionRelatedToImpairmentOfAssets",
    "type": "sg-types:YesItemType",
    "abstract": false,
    "periodType": "duration"
  },
  "sg-ssa:ReasonForModifiedAuditOpinionRelatedToOngoingInvestigationOrLegalCases": {
    "local": "ReasonForModifiedAuditOpinionRelatedToOngoingInvestigationOrLegalCases",
    "prefix": "sg-ssa",
    "id": "sg-ssa_ReasonForModifiedAuditOpinionRelatedToOngoingInvestigationOrLegalCases",
    "type": "sg-types:YesItemType",
    "abstract": false,
    "periodType": "duration"
  },
  "sg-ssa:ReasonForModifiedAuditOpinionRelatedToOthers": {
    "local": "ReasonForModifiedAuditOpinionRelatedToOthers",
    "prefix": "sg-ssa",
    "id": "sg-ssa_ReasonForModifiedAuditOpinionRelatedToOthers",
    "type": "sg-types:YesItemType",
    "abstract": false,
    "periodType": "duration"
  },
  "sg-ssa:TypeOfAuditOpinionInIndependentAuditorsReport": {
    "local": "TypeOfAuditOpinionInIndependentAuditorsReport",
    "prefix": "sg-ssa",
    "id": "sg-ssa_TypeOfAuditOpinionInIndependentAuditorsReport",
    "type": "sg-types:TypeOfAuditOpinionItemType",
    "abstract": false,
    "periodType": "duration"
  },
  "sg-ssa:WhetherThereIsAnyMaterialUncertaintyRelatingToGoingConcern": {
    "local": "WhetherThereIsAnyMaterialUncertaintyRelatingToGoingConcern",
    "prefix": "sg-ssa",
    "id": "sg-ssa_WhetherThereIsAnyMaterialUncertaintyRelatingToGoingConcern",
    "type": "sg-types:YesNoItemType",
    "abstract": false,
    "periodType": "duration"
  },
};

/** Element namespace prefix -> the schema file that declares it, relative to the taxonomy root. */
export const ELEMENT_SCHEMAS: Record<string, { path: string; namespace: string }> = {
  "sg-as": { path: "elts/sg-as-cor_2026-01-01.xsd", namespace: "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/elts/sg-as" },
  "sg-ca": { path: "elts/sg-ca-cor_2026-01-01.xsd", namespace: "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/elts/sg-ca" },
  "sg-dei": { path: "elts/sg-dei-cor_2026-01-01.xsd", namespace: "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/elts/sg-dei" },
  "sg-ee-sfrs": { path: "elts/sg-ee/sg-ee-sfrs/sg-ee-sfrs_2026-01-01.xsd", namespace: "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/elts/sg-ee/sg-ee-sfrs" },
  "sg-fsh": { path: "elts/sg-fsh-cor_2026-01-01.xsd", namespace: "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/elts/sg-fsh" },
  "sg-lab-rol": { path: "elts/sg-lab-rol_2026-01-01.xsd", namespace: "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/elts/sg-lab-rol" },
  "sg-lm": { path: "elts/sg-lm-cor_2026-01-01.xsd", namespace: "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/elts/sg-lm" },
  "sg-parts": { path: "elts/sg-parts_2026-01-01.xsd", namespace: "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/elts/sg-parts" },
  "sg-ssa": { path: "elts/sg-ssa-cor_2026-01-01.xsd", namespace: "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/elts/sg-ssa" },
  "sg-ty-dim": { path: "elts/sg-ty-dim_2026-01-01.xsd", namespace: "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/elts/sg-ty-dim" },
  "sg-types": { path: "elts/sg-types_2026-01-01.xsd", namespace: "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/elts/sg-types" },
};

export const TEMPLATES: Record<TaxonomyTemplate, TaxonomyTemplateInfo> = {
  sim: {
    "entryPoint": "elts/sg-sim-ent_2026-01-01.xsd",
    "framework": "fr/sg-sim",
    "roleNamespace": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sim",
    "roles": [
      {
        "role": "FilingInformation",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sim/role/FilingInformation",
        "definition": "[10000000] Filing information",
        "order": 10000000
      },
      {
        "role": "StatementByDirectors",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sim/role/StatementByDirectors",
        "definition": "[11000000] Statement by directors",
        "order": 11000000
      },
      {
        "role": "IndependentAuditorsReport",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sim/role/IndependentAuditorsReport",
        "definition": "[12000000] Independent auditors' report",
        "order": 12000000
      },
      {
        "role": "AdditionalInformation",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sim/role/AdditionalInformation",
        "definition": "[13000000] Additional information",
        "order": 13000000
      },
      {
        "role": "SFPCurrentNonCurrent",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sim/role/SFPCurrentNonCurrent",
        "definition": "[21100000] Statement of financial position, current and non-current",
        "order": 21100000
      },
      {
        "role": "SFPOrderOfLiquidity",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sim/role/SFPOrderOfLiquidity",
        "definition": "[21200000] Statement of financial position, order of liquidity",
        "order": 21200000
      },
      {
        "role": "ISNature",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sim/role/ISNature",
        "definition": "[22000000] Income statement, by nature of expense",
        "order": 22000000
      },
      {
        "role": "AdditionalCalculations",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sim/role/AdditionalCalculations",
        "definition": "[22100000] Additional calculations",
        "order": 22100000
      },
      {
        "role": "NoteTradeAndOtherReceivables",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sim/role/NoteTradeAndOtherReceivables",
        "definition": "[31000000] Note - Trade and other receivables",
        "order": 31000000
      },
      {
        "role": "NoteTradeAndOtherPayables",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sim/role/NoteTradeAndOtherPayables",
        "definition": "[32000000] Note - Trade and other payables",
        "order": 32000000
      },
      {
        "role": "NoteRevenue",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sim/role/NoteRevenue",
        "definition": "[33000000] Note - Revenue",
        "order": 33000000
      },
      {
        "role": "AxisConsolidatedAndSeparateFinancialStatements",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sim/role/AxisConsolidatedAndSeparateFinancialStatements",
        "definition": "[90050000] Axis - Consolidated and separate financial statements",
        "order": 90050000
      },
      {
        "role": "AxisDefaults",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sim/role/AxisDefaults",
        "definition": "[99999999] Axis - Defaults",
        "order": 99999999
      }
    ],
    "sections": [
      {
        "role": "FilingInformation",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sim/role/FilingInformation",
        "definition": "[10000000] Filing information",
        "order": 10000000,
        "presentation": [
          {
            "element": "sg-dei:DisclosureOfFilingInformationAbstract",
            "depth": 0,
            "order": 1
          },
          {
            "element": "sg-dei:NameOfCompany",
            "depth": 1,
            "order": 1
          },
          {
            "element": "sg-dei:UniqueEntityNumber",
            "depth": 1,
            "order": 2
          },
          {
            "element": "sg-dei:CurrentPeriodStartDate",
            "depth": 1,
            "order": 3
          },
          {
            "element": "sg-dei:CurrentPeriodEndDate",
            "depth": 1,
            "order": 4
          },
          {
            "element": "sg-dei:PriorPeriodStartDate",
            "depth": 1,
            "order": 5
          },
          {
            "element": "sg-dei:TypeOfXBRLFiling",
            "depth": 1,
            "order": 6
          },
          {
            "element": "sg-dei:NatureOfFinancialStatementsCompanyLevelOrConsolidated",
            "depth": 1,
            "order": 7
          },
          {
            "element": "sg-dei:TypeOfAccountingStandardUsedToPrepareFinancialStatements",
            "depth": 1,
            "order": 8
          },
          {
            "element": "sg-as:DateOfAuthorisationForIssueOfFinancialStatements",
            "depth": 1,
            "order": 9
          },
          {
            "element": "sg-dei:TypeOfStatementOfFinancialPosition",
            "depth": 1,
            "order": 10
          },
          {
            "element": "sg-dei:WhetherFinancialStatementsArePreparedOnGoingConcernBasis",
            "depth": 1,
            "order": 11
          },
          {
            "element": "sg-dei:WhetherThereAreChangesToComparativeAmountsDueToRestatementsReclassificationOrOtherReasons",
            "depth": 1,
            "order": 12
          },
          {
            "element": "sg-dei:DescriptionOfPresentationCurrency",
            "depth": 1,
            "order": 13
          },
          {
            "element": "sg-as:DescriptionOfFunctionalCurrency",
            "depth": 1,
            "order": 14
          },
          {
            "element": "sg-dei:LevelOfRoundingUsedInFinancialStatements",
            "depth": 1,
            "order": 15
          },
          {
            "element": "sg-as:DescriptionOfNatureOfEntitysOperationsAndPrincipalActivities",
            "depth": 1,
            "order": 16
          },
          {
            "element": "sg-as:PrincipalPlaceOfBusinessIfDifferentFromRegisteredOffice",
            "depth": 1,
            "order": 17
          },
          {
            "element": "sg-dei:WhetherCompanyOrGroupIfConsolidatedAccountsArePreparedHasMoreThan50Employees",
            "depth": 1,
            "order": 18
          },
          {
            "element": "sg-as:NameOfParentEntity",
            "depth": 1,
            "order": 19
          },
          {
            "element": "sg-as:NameOfUltimateParentOfGroup",
            "depth": 1,
            "order": 20
          },
          {
            "element": "sg-dei:DetailsOfInstanceDocumentAbstract",
            "depth": 1,
            "order": 21
          },
          {
            "element": "sg-dei:TaxonomyVersion",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-dei:NameAndVersionOfSoftwareUsedToGenerateInstanceDocument",
            "depth": 2,
            "order": 2
          },
          {
            "element": "sg-dei:HowWasXBRLInstanceDocumentPrepared",
            "depth": 2,
            "order": 3
          }
        ]
      },
      {
        "role": "StatementByDirectors",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sim/role/StatementByDirectors",
        "definition": "[11000000] Statement by directors",
        "order": 11000000,
        "presentation": [
          {
            "element": "sg-ca:DisclosureInStatementByDirectorsAbstract",
            "depth": 0,
            "order": 1
          },
          {
            "element": "sg-ca:WhetherInDirectorsOpinionFinancialStatementsAreDrawnUpSoAsToExhibitATrueAndFairView",
            "depth": 1,
            "order": 1
          },
          {
            "element": "sg-ca:WhetherThereAreReasonableGroundsToBelieveThatCompanyWillBeAbleToPayItsDebtsAsAndWhenTheyFallDueAtDateOfStatement",
            "depth": 1,
            "order": 2
          }
        ]
      },
      {
        "role": "IndependentAuditorsReport",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sim/role/IndependentAuditorsReport",
        "definition": "[12000000] Independent auditors' report",
        "order": 12000000,
        "presentation": [
          {
            "element": "sg-ssa:DisclosuresInIndependentAuditorsReportAbstract",
            "depth": 0,
            "order": 1
          },
          {
            "element": "sg-ssa:TypeOfAuditOpinionInIndependentAuditorsReport",
            "depth": 1,
            "order": 1
          },
          {
            "element": "sg-ssa:AuditingStandardsUsedToConductAudit",
            "depth": 1,
            "order": 2
          },
          {
            "element": "sg-ssa:WhetherThereIsAnyMaterialUncertaintyRelatingToGoingConcern",
            "depth": 1,
            "order": 3
          },
          {
            "element": "sg-ca:WhetherInAuditorsOpinionAccountingAndOtherRecordsRequiredAreProperlyKeptInAccordanceWithCompaniesAct",
            "depth": 1,
            "order": 4
          }
        ]
      },
      {
        "role": "AdditionalInformation",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sim/role/AdditionalInformation",
        "definition": "[13000000] Additional information",
        "order": 13000000,
        "presentation": [
          {
            "element": "sg-as:DisclosureOfAdditionalInformationAbstract",
            "depth": 0,
            "order": 1
          },
          {
            "element": "sg-as:NumberOfEmployeesOfCompany",
            "depth": 1,
            "order": 1
          },
          {
            "element": "sg-as:NumberOfEmployeesOfGroup",
            "depth": 1,
            "order": 2
          },
          {
            "element": "sg-as:WhetherCompanyIsSubsidiary",
            "depth": 1,
            "order": 3
          },
          {
            "element": "sg-as:UniqueEntityNumberOfSingaporeParentCompanyPreparingConsolidatedFinancialStatements",
            "depth": 1,
            "order": 4
          },
          {
            "element": "sg-as:WhetherEntityIsSingaporeIncorporatedParentPreparingAndFilingSetOfConsolidatedFinancialStatementsWithACRA",
            "depth": 1,
            "order": 5
          },
          {
            "element": "sg-as:WhetherEntityHasAnySingaporeIncorporatedParentCompany",
            "depth": 1,
            "order": 6
          },
          {
            "element": "sg-as:WhetherCompanyHasAnySubsidiaryAssociateOrJointVenture",
            "depth": 1,
            "order": 7
          },
          {
            "element": "sg-as:WhetherEntityIsForeignIncorporatedCompanyPreparingAndFilingSetOfConsolidatedFinancialStatementsIndicateWebsiteOrAvenueWhereConsolidatedFinancialStatementsCanBeFound",
            "depth": 1,
            "order": 8
          }
        ]
      },
      {
        "role": "SFPCurrentNonCurrent",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sim/role/SFPCurrentNonCurrent",
        "definition": "[21100000] Statement of financial position, current and non-current",
        "order": 21100000,
        "presentation": [
          {
            "element": "sg-as:StatementOfFinancialPositionAbstract",
            "depth": 0,
            "order": 1
          },
          {
            "element": "sg-as:StatementOfFinancialPositionTable",
            "depth": 1,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedMember",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:SeparateMember",
            "depth": 4,
            "order": 1
          },
          {
            "element": "sg-as:StatementOfFinancialPositionLineItems",
            "depth": 1,
            "order": 2
          },
          {
            "element": "sg-as:AssetsAbstract",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:CurrentAssetsAbstract",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:CashAndBankBalances",
            "depth": 4,
            "order": 1
          },
          {
            "element": "sg-as:TradeAndOtherReceivablesCurrent",
            "depth": 4,
            "order": 2
          },
          {
            "element": "sg-as:CurrentFinanceLeaseReceivables",
            "depth": 4,
            "order": 3
          },
          {
            "element": "sg-as:CurrentDerivativeFinancialAssets",
            "depth": 4,
            "order": 4
          },
          {
            "element": "sg-as:CurrentFinancialAssetsMeasuredAtFairValueThroughProfitOrLoss",
            "depth": 4,
            "order": 5
          },
          {
            "element": "sg-as:OtherCurrentFinancialAssets",
            "depth": 4,
            "order": 6
          },
          {
            "element": "sg-as:DevelopmentProperties",
            "depth": 4,
            "order": 7
          },
          {
            "element": "sg-as:Inventories",
            "depth": 4,
            "order": 8
          },
          {
            "element": "sg-as:OtherCurrentNonfinancialAssets",
            "depth": 4,
            "order": 9
          },
          {
            "element": "sg-as:NoncurrentAssetsOrDisposalGroupsClassifiedAsHeldForSaleOrAsHeldForDistributionToOwners",
            "depth": 4,
            "order": 10
          },
          {
            "element": "sg-as:CurrentAssets",
            "depth": 4,
            "order": 11
          },
          {
            "element": "sg-as:NoncurrentAssetsAbstract",
            "depth": 3,
            "order": 2
          },
          {
            "element": "sg-as:TradeAndOtherReceivablesNoncurrent",
            "depth": 4,
            "order": 1
          },
          {
            "element": "sg-as:NoncurrentFinanceLeaseReceivables",
            "depth": 4,
            "order": 2
          },
          {
            "element": "sg-as:NoncurrentDerivativeFinancialAssets",
            "depth": 4,
            "order": 3
          },
          {
            "element": "sg-as:NoncurrentFinancialAssetsMeasuredAtFairValueThroughProfitOrLoss",
            "depth": 4,
            "order": 4
          },
          {
            "element": "sg-as:OtherNoncurrentFinancialAssets",
            "depth": 4,
            "order": 5
          },
          {
            "element": "sg-as:PropertyPlantAndEquipment",
            "depth": 4,
            "order": 6
          },
          {
            "element": "sg-as:InvestmentProperties",
            "depth": 4,
            "order": 7
          },
          {
            "element": "sg-as:Goodwill",
            "depth": 4,
            "order": 8
          },
          {
            "element": "sg-as:IntangibleAssetsOtherThanGoodwill",
            "depth": 4,
            "order": 9
          },
          {
            "element": "sg-as:InvestmentsInSubsidiariesAssociatesOrJointVentures",
            "depth": 4,
            "order": 10
          },
          {
            "element": "sg-as:DeferredTaxAssets",
            "depth": 4,
            "order": 11
          },
          {
            "element": "sg-as:OtherNoncurrentNonfinancialAssets",
            "depth": 4,
            "order": 12
          },
          {
            "element": "sg-as:NoncurrentAssets",
            "depth": 4,
            "order": 13
          },
          {
            "element": "sg-as:Assets",
            "depth": 3,
            "order": 3
          },
          {
            "element": "sg-as:LiabilitiesAbstract",
            "depth": 2,
            "order": 2
          },
          {
            "element": "sg-as:CurrentLiabilitiesAbstract",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:TradeAndOtherPayablesCurrent",
            "depth": 4,
            "order": 1
          },
          {
            "element": "sg-as:CurrentLoansAndBorrowings",
            "depth": 4,
            "order": 2
          },
          {
            "element": "sg-as:CurrentFinancialLiabilitiesMeasuredAtFairValueThroughProfitOrLoss",
            "depth": 4,
            "order": 3
          },
          {
            "element": "sg-as:CurrentFinanceLeaseLiabilities",
            "depth": 4,
            "order": 4
          },
          {
            "element": "sg-as:OtherCurrentFinancialLiabilities",
            "depth": 4,
            "order": 5
          },
          {
            "element": "sg-as:CurrentIncomeTaxLiabilities",
            "depth": 4,
            "order": 6
          },
          {
            "element": "sg-as:CurrentProvisions",
            "depth": 4,
            "order": 7
          },
          {
            "element": "sg-as:OtherCurrentNonfinancialLiabilities",
            "depth": 4,
            "order": 8
          },
          {
            "element": "sg-as:LiabilitiesClassifiedAsHeldForSale",
            "depth": 4,
            "order": 9
          },
          {
            "element": "sg-as:CurrentLiabilities",
            "depth": 4,
            "order": 10
          },
          {
            "element": "sg-as:NoncurrentLiabilitiesAbstract",
            "depth": 3,
            "order": 2
          },
          {
            "element": "sg-as:TradeAndOtherPayablesNoncurrent",
            "depth": 4,
            "order": 1
          },
          {
            "element": "sg-as:NoncurrentLoansAndBorrowings",
            "depth": 4,
            "order": 2
          },
          {
            "element": "sg-as:NoncurrentFinancialLiabilitiesMeasuredAtFairValueThroughProfitOrLoss",
            "depth": 4,
            "order": 3
          },
          {
            "element": "sg-as:NoncurrentFinanceLeaseLiabilities",
            "depth": 4,
            "order": 4
          },
          {
            "element": "sg-as:OtherNoncurrentFinancialLiabilities",
            "depth": 4,
            "order": 5
          },
          {
            "element": "sg-as:DeferredTaxLiabilities",
            "depth": 4,
            "order": 6
          },
          {
            "element": "sg-as:NoncurrentProvisions",
            "depth": 4,
            "order": 7
          },
          {
            "element": "sg-as:OtherNoncurrentNonfinancialLiabilities",
            "depth": 4,
            "order": 8
          },
          {
            "element": "sg-as:NoncurrentLiabilities",
            "depth": 4,
            "order": 9
          },
          {
            "element": "sg-as:Liabilities",
            "depth": 3,
            "order": 3
          },
          {
            "element": "sg-as:EquityAbstract",
            "depth": 2,
            "order": 3
          },
          {
            "element": "sg-as:ShareCapital",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:TreasuryShares",
            "depth": 3,
            "order": 2
          },
          {
            "element": "sg-as:AccumulatedProfitsLosses",
            "depth": 3,
            "order": 3
          },
          {
            "element": "sg-as:ReservesOtherThanAccumulatedProfitsLosses",
            "depth": 3,
            "order": 4
          },
          {
            "element": "sg-as:NoncontrollingInterests",
            "depth": 3,
            "order": 5
          },
          {
            "element": "sg-as:Equity",
            "depth": 3,
            "order": 6
          }
        ]
      },
      {
        "role": "SFPOrderOfLiquidity",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sim/role/SFPOrderOfLiquidity",
        "definition": "[21200000] Statement of financial position, order of liquidity",
        "order": 21200000,
        "presentation": [
          {
            "element": "sg-as:StatementOfFinancialPositionAbstract",
            "depth": 0,
            "order": 1
          },
          {
            "element": "sg-as:StatementOfFinancialPositionTable",
            "depth": 1,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedMember",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:SeparateMember",
            "depth": 4,
            "order": 1
          },
          {
            "element": "sg-as:StatementOfFinancialPositionLineItems",
            "depth": 1,
            "order": 2
          },
          {
            "element": "sg-as:AssetsAbstract",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:Assets",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:LiabilitiesAbstract",
            "depth": 2,
            "order": 2
          },
          {
            "element": "sg-as:Liabilities",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:EquityAbstract",
            "depth": 2,
            "order": 3
          },
          {
            "element": "sg-as:ShareCapital",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:TreasuryShares",
            "depth": 3,
            "order": 2
          },
          {
            "element": "sg-as:AccumulatedProfitsLosses",
            "depth": 3,
            "order": 3
          },
          {
            "element": "sg-as:ReservesOtherThanAccumulatedProfitsLosses",
            "depth": 3,
            "order": 4
          },
          {
            "element": "sg-as:NoncontrollingInterests",
            "depth": 3,
            "order": 5
          },
          {
            "element": "sg-as:Equity",
            "depth": 3,
            "order": 6
          }
        ]
      },
      {
        "role": "ISNature",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sim/role/ISNature",
        "definition": "[22000000] Income statement, by nature of expense",
        "order": 22000000,
        "presentation": [
          {
            "element": "sg-as:StatementOfProfitOrLossAbstract",
            "depth": 0,
            "order": 1
          },
          {
            "element": "sg-as:StatementOfProfitOrLossTable",
            "depth": 1,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedMember",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:SeparateMember",
            "depth": 4,
            "order": 1
          },
          {
            "element": "sg-as:StatementOfProfitOrLossLineItems",
            "depth": 1,
            "order": 2
          },
          {
            "element": "sg-as:ProfitLossAbstract",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:Revenue",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:OtherIncome",
            "depth": 3,
            "order": 2
          },
          {
            "element": "sg-as:EmployeeBenefitsExpense",
            "depth": 3,
            "order": 3
          },
          {
            "element": "sg-as:DepreciationExpense",
            "depth": 3,
            "order": 4
          },
          {
            "element": "sg-as:AmortisationExpense",
            "depth": 3,
            "order": 5
          },
          {
            "element": "sg-as:RepairsAndMaintenanceExpense",
            "depth": 3,
            "order": 6
          },
          {
            "element": "sg-as:SalesAndMarketingExpense",
            "depth": 3,
            "order": 7
          },
          {
            "element": "sg-as:OtherExpensesByNature",
            "depth": 3,
            "order": 8
          },
          {
            "element": "sg-as:OtherGainsLosses",
            "depth": 3,
            "order": 9
          },
          {
            "element": "sg-as:FinanceCosts",
            "depth": 3,
            "order": 10
          },
          {
            "element": "sg-as:ShareOfProfitLossOfAssociatesAndJointVenturesAccountedForUsingEquityMethod",
            "depth": 3,
            "order": 11
          },
          {
            "element": "sg-as:ProfitLossBeforeTaxation",
            "depth": 3,
            "order": 12
          },
          {
            "element": "sg-as:TaxExpenseBenefitContinuingOperations",
            "depth": 3,
            "order": 13
          },
          {
            "element": "sg-as:ProfitLossFromDiscontinuedOperations",
            "depth": 3,
            "order": 14
          },
          {
            "element": "sg-as:ProfitLoss",
            "depth": 3,
            "order": 15
          },
          {
            "element": "sg-as:ProfitLossAttributableToAbstract",
            "depth": 2,
            "order": 2
          },
          {
            "element": "sg-as:ProfitLossAttributableToOwnersOfCompany",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:ProfitLossAttributableToNoncontrollingInterests",
            "depth": 3,
            "order": 2
          }
        ]
      },
      {
        "role": "NoteTradeAndOtherReceivables",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sim/role/NoteTradeAndOtherReceivables",
        "definition": "[31000000] Note - Trade and other receivables",
        "order": 31000000,
        "presentation": [
          {
            "element": "sg-as:TradeAndOtherReceivablesAbstract",
            "depth": 0,
            "order": 1
          },
          {
            "element": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherReceivablesTable",
            "depth": 1,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedMember",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:SeparateMember",
            "depth": 4,
            "order": 1
          },
          {
            "element": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherReceivablesLineItems",
            "depth": 1,
            "order": 2
          },
          {
            "element": "sg-as:TradeAndOtherReceivablesDueFromThirdParties",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:TradeAndOtherReceivablesDueFromRelatedParties",
            "depth": 2,
            "order": 2
          },
          {
            "element": "sg-as:UnbilledReceivables",
            "depth": 2,
            "order": 3
          },
          {
            "element": "sg-as:OtherReceivables",
            "depth": 2,
            "order": 4
          },
          {
            "element": "sg-as:TradeAndOtherReceivables",
            "depth": 2,
            "order": 5
          },
          {
            "element": "sg-as:ClassesOfPartiesAxis",
            "depth": 0,
            "order": 2
          }
        ]
      },
      {
        "role": "NoteTradeAndOtherPayables",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sim/role/NoteTradeAndOtherPayables",
        "definition": "[32000000] Note - Trade and other payables",
        "order": 32000000,
        "presentation": [
          {
            "element": "sg-as:TradeAndOtherPayablesAbstract",
            "depth": 0,
            "order": 1
          },
          {
            "element": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherPayablesTable",
            "depth": 1,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedMember",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:SeparateMember",
            "depth": 4,
            "order": 1
          },
          {
            "element": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherPayablesLineItems",
            "depth": 1,
            "order": 2
          },
          {
            "element": "sg-as:TradeAndOtherPayablesDueToThirdParties",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:TradeAndOtherPayablesDueToRelatedParties",
            "depth": 2,
            "order": 2
          },
          {
            "element": "sg-as:DeferredIncome",
            "depth": 2,
            "order": 3
          },
          {
            "element": "sg-as:OtherPayables",
            "depth": 2,
            "order": 4
          },
          {
            "element": "sg-as:TradeAndOtherPayables",
            "depth": 2,
            "order": 5
          }
        ]
      },
      {
        "role": "NoteRevenue",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sim/role/NoteRevenue",
        "definition": "[33000000] Note - Revenue",
        "order": 33000000,
        "presentation": [
          {
            "element": "sg-as:DisclosureOfRevenueAbstract",
            "depth": 0,
            "order": 1
          },
          {
            "element": "sg-as:DisclosureOfRevenueTable",
            "depth": 1,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedMember",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:SeparateMember",
            "depth": 4,
            "order": 1
          },
          {
            "element": "sg-as:DisclosureOfRevenueLineItems",
            "depth": 1,
            "order": 2
          },
          {
            "element": "sg-as:RevenueAbstract",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:RevenueFromPropertyTransferredAtPointInTime",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:RevenueFromGoodsTransferredAtPointInTime",
            "depth": 3,
            "order": 2
          },
          {
            "element": "sg-as:RevenueFromServicesTransferredAtPointInTime",
            "depth": 3,
            "order": 3
          },
          {
            "element": "sg-as:RevenueFromPropertyTransferredOverTime",
            "depth": 3,
            "order": 4
          },
          {
            "element": "sg-as:RevenueFromConstructionContractsOverTime",
            "depth": 3,
            "order": 5
          },
          {
            "element": "sg-as:RevenueFromServicesTransferredOverTime",
            "depth": 3,
            "order": 6
          },
          {
            "element": "sg-as:OtherRevenue",
            "depth": 3,
            "order": 7
          },
          {
            "element": "sg-as:Revenue",
            "depth": 3,
            "order": 8
          }
        ]
      }
    ],
    "checks": [
      {
        "role": "NoteRevenue",
        "parent": "sg-as:Revenue",
        "children": [
          {
            "element": "sg-as:RevenueFromPropertyTransferredAtPointInTime",
            "weight": 1
          },
          {
            "element": "sg-as:RevenueFromGoodsTransferredAtPointInTime",
            "weight": 1
          },
          {
            "element": "sg-as:RevenueFromServicesTransferredAtPointInTime",
            "weight": 1
          },
          {
            "element": "sg-as:RevenueFromPropertyTransferredOverTime",
            "weight": 1
          },
          {
            "element": "sg-as:RevenueFromConstructionContractsOverTime",
            "weight": 1
          },
          {
            "element": "sg-as:RevenueFromServicesTransferredOverTime",
            "weight": 1
          },
          {
            "element": "sg-as:OtherRevenue",
            "weight": 1
          }
        ]
      },
      {
        "role": "ISNature",
        "parent": "sg-as:ProfitLoss",
        "children": [
          {
            "element": "sg-as:ProfitLossBeforeTaxation",
            "weight": 1
          },
          {
            "element": "sg-as:TaxExpenseBenefitContinuingOperations",
            "weight": -1
          },
          {
            "element": "sg-as:ProfitLossFromDiscontinuedOperations",
            "weight": 1
          }
        ]
      },
      {
        "role": "ISNature",
        "parent": "sg-as:ProfitLossBeforeTaxation",
        "children": [
          {
            "element": "sg-as:Revenue",
            "weight": 1
          },
          {
            "element": "sg-as:OtherIncome",
            "weight": 1
          },
          {
            "element": "sg-as:EmployeeBenefitsExpense",
            "weight": -1
          },
          {
            "element": "sg-as:DepreciationExpense",
            "weight": -1
          },
          {
            "element": "sg-as:AmortisationExpense",
            "weight": -1
          },
          {
            "element": "sg-as:RepairsAndMaintenanceExpense",
            "weight": -1
          },
          {
            "element": "sg-as:SalesAndMarketingExpense",
            "weight": -1
          },
          {
            "element": "sg-as:OtherExpensesByNature",
            "weight": -1
          },
          {
            "element": "sg-as:OtherGainsLosses",
            "weight": 1
          },
          {
            "element": "sg-as:FinanceCosts",
            "weight": -1
          },
          {
            "element": "sg-as:ShareOfProfitLossOfAssociatesAndJointVenturesAccountedForUsingEquityMethod",
            "weight": 1
          }
        ]
      },
      {
        "role": "SFPCurrentNonCurrent",
        "parent": "sg-as:Assets",
        "children": [
          {
            "element": "sg-as:CurrentAssets",
            "weight": 1
          },
          {
            "element": "sg-as:NoncurrentAssets",
            "weight": 1
          }
        ]
      },
      {
        "role": "SFPCurrentNonCurrent",
        "parent": "sg-as:CurrentAssets",
        "children": [
          {
            "element": "sg-as:CashAndBankBalances",
            "weight": 1
          },
          {
            "element": "sg-as:TradeAndOtherReceivablesCurrent",
            "weight": 1
          },
          {
            "element": "sg-as:CurrentFinanceLeaseReceivables",
            "weight": 1
          },
          {
            "element": "sg-as:CurrentDerivativeFinancialAssets",
            "weight": 1
          },
          {
            "element": "sg-as:CurrentFinancialAssetsMeasuredAtFairValueThroughProfitOrLoss",
            "weight": 1
          },
          {
            "element": "sg-as:OtherCurrentFinancialAssets",
            "weight": 1
          },
          {
            "element": "sg-as:DevelopmentProperties",
            "weight": 1
          },
          {
            "element": "sg-as:Inventories",
            "weight": 1
          },
          {
            "element": "sg-as:OtherCurrentNonfinancialAssets",
            "weight": 1
          },
          {
            "element": "sg-as:NoncurrentAssetsOrDisposalGroupsClassifiedAsHeldForSaleOrAsHeldForDistributionToOwners",
            "weight": 1
          }
        ]
      },
      {
        "role": "SFPCurrentNonCurrent",
        "parent": "sg-as:NoncurrentAssets",
        "children": [
          {
            "element": "sg-as:TradeAndOtherReceivablesNoncurrent",
            "weight": 1
          },
          {
            "element": "sg-as:NoncurrentFinanceLeaseReceivables",
            "weight": 1
          },
          {
            "element": "sg-as:NoncurrentDerivativeFinancialAssets",
            "weight": 1
          },
          {
            "element": "sg-as:NoncurrentFinancialAssetsMeasuredAtFairValueThroughProfitOrLoss",
            "weight": 1
          },
          {
            "element": "sg-as:OtherNoncurrentFinancialAssets",
            "weight": 1
          },
          {
            "element": "sg-as:PropertyPlantAndEquipment",
            "weight": 1
          },
          {
            "element": "sg-as:InvestmentProperties",
            "weight": 1
          },
          {
            "element": "sg-as:Goodwill",
            "weight": 1
          },
          {
            "element": "sg-as:IntangibleAssetsOtherThanGoodwill",
            "weight": 1
          },
          {
            "element": "sg-as:InvestmentsInSubsidiariesAssociatesOrJointVentures",
            "weight": 1
          },
          {
            "element": "sg-as:DeferredTaxAssets",
            "weight": 1
          },
          {
            "element": "sg-as:OtherNoncurrentNonfinancialAssets",
            "weight": 1
          }
        ]
      },
      {
        "role": "SFPCurrentNonCurrent",
        "parent": "sg-as:Liabilities",
        "children": [
          {
            "element": "sg-as:CurrentLiabilities",
            "weight": 1
          },
          {
            "element": "sg-as:NoncurrentLiabilities",
            "weight": 1
          }
        ]
      },
      {
        "role": "SFPCurrentNonCurrent",
        "parent": "sg-as:CurrentLiabilities",
        "children": [
          {
            "element": "sg-as:TradeAndOtherPayablesCurrent",
            "weight": 1
          },
          {
            "element": "sg-as:CurrentLoansAndBorrowings",
            "weight": 1
          },
          {
            "element": "sg-as:CurrentFinancialLiabilitiesMeasuredAtFairValueThroughProfitOrLoss",
            "weight": 1
          },
          {
            "element": "sg-as:CurrentFinanceLeaseLiabilities",
            "weight": 1
          },
          {
            "element": "sg-as:OtherCurrentFinancialLiabilities",
            "weight": 1
          },
          {
            "element": "sg-as:CurrentIncomeTaxLiabilities",
            "weight": 1
          },
          {
            "element": "sg-as:CurrentProvisions",
            "weight": 1
          },
          {
            "element": "sg-as:OtherCurrentNonfinancialLiabilities",
            "weight": 1
          },
          {
            "element": "sg-as:LiabilitiesClassifiedAsHeldForSale",
            "weight": 1
          }
        ]
      },
      {
        "role": "SFPCurrentNonCurrent",
        "parent": "sg-as:NoncurrentLiabilities",
        "children": [
          {
            "element": "sg-as:TradeAndOtherPayablesNoncurrent",
            "weight": 1
          },
          {
            "element": "sg-as:NoncurrentLoansAndBorrowings",
            "weight": 1
          },
          {
            "element": "sg-as:NoncurrentFinancialLiabilitiesMeasuredAtFairValueThroughProfitOrLoss",
            "weight": 1
          },
          {
            "element": "sg-as:NoncurrentFinanceLeaseLiabilities",
            "weight": 1
          },
          {
            "element": "sg-as:OtherNoncurrentFinancialLiabilities",
            "weight": 1
          },
          {
            "element": "sg-as:DeferredTaxLiabilities",
            "weight": 1
          },
          {
            "element": "sg-as:NoncurrentProvisions",
            "weight": 1
          },
          {
            "element": "sg-as:OtherNoncurrentNonfinancialLiabilities",
            "weight": 1
          }
        ]
      },
      {
        "role": "SFPCurrentNonCurrent",
        "parent": "sg-as:Equity",
        "children": [
          {
            "element": "sg-as:NoncontrollingInterests",
            "weight": 1
          },
          {
            "element": "sg-as:ShareCapital",
            "weight": 1
          },
          {
            "element": "sg-as:TreasuryShares",
            "weight": 1
          },
          {
            "element": "sg-as:AccumulatedProfitsLosses",
            "weight": 1
          },
          {
            "element": "sg-as:ReservesOtherThanAccumulatedProfitsLosses",
            "weight": 1
          }
        ]
      },
      {
        "role": "SFPOrderOfLiquidity",
        "parent": "sg-as:Equity",
        "children": [
          {
            "element": "sg-as:ShareCapital",
            "weight": 1
          },
          {
            "element": "sg-as:TreasuryShares",
            "weight": 1
          },
          {
            "element": "sg-as:AccumulatedProfitsLosses",
            "weight": 1
          },
          {
            "element": "sg-as:ReservesOtherThanAccumulatedProfitsLosses",
            "weight": 1
          },
          {
            "element": "sg-as:NoncontrollingInterests",
            "weight": 1
          }
        ]
      },
      {
        "role": "NoteTradeAndOtherReceivables",
        "parent": "sg-as:TradeAndOtherReceivables",
        "children": [
          {
            "element": "sg-as:TradeAndOtherReceivablesDueFromThirdParties",
            "weight": 1
          },
          {
            "element": "sg-as:TradeAndOtherReceivablesDueFromRelatedParties",
            "weight": 1
          },
          {
            "element": "sg-as:UnbilledReceivables",
            "weight": 1
          },
          {
            "element": "sg-as:OtherReceivables",
            "weight": 1
          }
        ]
      },
      {
        "role": "NoteTradeAndOtherPayables",
        "parent": "sg-as:TradeAndOtherPayables",
        "children": [
          {
            "element": "sg-as:TradeAndOtherPayablesDueToThirdParties",
            "weight": 1
          },
          {
            "element": "sg-as:TradeAndOtherPayablesDueToRelatedParties",
            "weight": 1
          },
          {
            "element": "sg-as:DeferredIncome",
            "weight": 1
          },
          {
            "element": "sg-as:OtherPayables",
            "weight": 1
          }
        ]
      },
      {
        "role": "AdditionalCalculations",
        "parent": "sg-as:ProfitLoss",
        "children": [
          {
            "element": "sg-as:ProfitLossAttributableToOwnersOfCompany",
            "weight": 1
          },
          {
            "element": "sg-as:ProfitLossAttributableToNoncontrollingInterests",
            "weight": 1
          }
        ]
      }
    ],
    "dimensions": [
      {
        "role": "NoteTradeAndOtherReceivables",
        "arcrole": "all",
        "from": "sg-as:TradeAndOtherReceivablesAbstract",
        "to": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherReceivablesTable",
        "order": 1
      },
      {
        "role": "NoteTradeAndOtherReceivables",
        "arcrole": "hypercube-dimension",
        "from": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherReceivablesTable",
        "to": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
        "order": 2
      },
      {
        "role": "NoteTradeAndOtherReceivables",
        "arcrole": "domain-member",
        "from": "sg-as:TradeAndOtherReceivablesAbstract",
        "to": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherReceivablesLineItems",
        "order": 2
      },
      {
        "role": "NoteTradeAndOtherReceivables",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherReceivablesLineItems",
        "to": "sg-as:TradeAndOtherReceivablesDueFromThirdParties",
        "order": 1
      },
      {
        "role": "NoteTradeAndOtherReceivables",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherReceivablesLineItems",
        "to": "sg-as:TradeAndOtherReceivablesDueFromRelatedParties",
        "order": 2
      },
      {
        "role": "NoteTradeAndOtherReceivables",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherReceivablesLineItems",
        "to": "sg-as:UnbilledReceivables",
        "order": 3
      },
      {
        "role": "NoteTradeAndOtherReceivables",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherReceivablesLineItems",
        "to": "sg-as:OtherReceivables",
        "order": 4
      },
      {
        "role": "NoteTradeAndOtherReceivables",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherReceivablesLineItems",
        "to": "sg-as:TradeAndOtherReceivables",
        "order": 5
      },
      {
        "role": "NoteTradeAndOtherPayables",
        "arcrole": "all",
        "from": "sg-as:TradeAndOtherPayablesAbstract",
        "to": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherPayablesTable",
        "order": 1
      },
      {
        "role": "NoteTradeAndOtherPayables",
        "arcrole": "hypercube-dimension",
        "from": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherPayablesTable",
        "to": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
        "order": 2
      },
      {
        "role": "NoteTradeAndOtherPayables",
        "arcrole": "domain-member",
        "from": "sg-as:TradeAndOtherPayablesAbstract",
        "to": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherPayablesLineItems",
        "order": 2
      },
      {
        "role": "NoteTradeAndOtherPayables",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherPayablesLineItems",
        "to": "sg-as:TradeAndOtherPayablesDueToThirdParties",
        "order": 1
      },
      {
        "role": "NoteTradeAndOtherPayables",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherPayablesLineItems",
        "to": "sg-as:TradeAndOtherPayablesDueToRelatedParties",
        "order": 2
      },
      {
        "role": "NoteTradeAndOtherPayables",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherPayablesLineItems",
        "to": "sg-as:DeferredIncome",
        "order": 3
      },
      {
        "role": "NoteTradeAndOtherPayables",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherPayablesLineItems",
        "to": "sg-as:OtherPayables",
        "order": 4
      },
      {
        "role": "NoteTradeAndOtherPayables",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherPayablesLineItems",
        "to": "sg-as:TradeAndOtherPayables",
        "order": 5
      },
      {
        "role": "AxisDefaults",
        "arcrole": "dimension-default",
        "from": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
        "to": "sg-as:ConsolidatedMember",
        "order": 1
      },
      {
        "role": "AxisDefaults",
        "arcrole": "dimension-default",
        "from": "sg-as:ClassesOfPropertyPlantAndEquipmentAxis",
        "to": "sg-as:PropertyPlantAndEquipmentMember",
        "order": 1
      },
      {
        "role": "AxisDefaults",
        "arcrole": "dimension-default",
        "from": "sg-as:ClassesOfIntangibleAssetsAxis",
        "to": "sg-as:IntangibleAssetsMember",
        "order": 1
      },
      {
        "role": "AxisDefaults",
        "arcrole": "dimension-default",
        "from": "sg-as:CategoriesOfRelatedPartiesAxis",
        "to": "sg-as:CategoriesOfRelatedPartiesMember",
        "order": 1
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "all",
        "from": "sg-as:StatementOfFinancialPositionAbstract",
        "to": "sg-as:StatementOfFinancialPositionTable",
        "order": 1
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "hypercube-dimension",
        "from": "sg-as:StatementOfFinancialPositionTable",
        "to": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
        "order": 1
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:StatementOfFinancialPositionAbstract",
        "to": "sg-as:StatementOfFinancialPositionLineItems",
        "order": 2
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:StatementOfFinancialPositionLineItems",
        "to": "sg-as:AssetsAbstract",
        "order": 1
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:AssetsAbstract",
        "to": "sg-as:CurrentAssetsAbstract",
        "order": 1
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentAssetsAbstract",
        "to": "sg-as:CashAndBankBalances",
        "order": 1
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentAssetsAbstract",
        "to": "sg-as:TradeAndOtherReceivablesCurrent",
        "order": 2
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentAssetsAbstract",
        "to": "sg-as:CurrentFinanceLeaseReceivables",
        "order": 3
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentAssetsAbstract",
        "to": "sg-as:CurrentDerivativeFinancialAssets",
        "order": 4
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentAssetsAbstract",
        "to": "sg-as:CurrentFinancialAssetsMeasuredAtFairValueThroughProfitOrLoss",
        "order": 5
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentAssetsAbstract",
        "to": "sg-as:OtherCurrentFinancialAssets",
        "order": 6
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentAssetsAbstract",
        "to": "sg-as:DevelopmentProperties",
        "order": 7
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentAssetsAbstract",
        "to": "sg-as:Inventories",
        "order": 8
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentAssetsAbstract",
        "to": "sg-as:OtherCurrentNonfinancialAssets",
        "order": 9
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentAssetsAbstract",
        "to": "sg-as:NoncurrentAssetsOrDisposalGroupsClassifiedAsHeldForSaleOrAsHeldForDistributionToOwners",
        "order": 10
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentAssetsAbstract",
        "to": "sg-as:CurrentAssets",
        "order": 11
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:AssetsAbstract",
        "to": "sg-as:NoncurrentAssetsAbstract",
        "order": 2
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentAssetsAbstract",
        "to": "sg-as:TradeAndOtherReceivablesNoncurrent",
        "order": 1
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentAssetsAbstract",
        "to": "sg-as:NoncurrentFinanceLeaseReceivables",
        "order": 2
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentAssetsAbstract",
        "to": "sg-as:NoncurrentDerivativeFinancialAssets",
        "order": 3
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentAssetsAbstract",
        "to": "sg-as:NoncurrentFinancialAssetsMeasuredAtFairValueThroughProfitOrLoss",
        "order": 4
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentAssetsAbstract",
        "to": "sg-as:OtherNoncurrentFinancialAssets",
        "order": 5
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentAssetsAbstract",
        "to": "sg-as:PropertyPlantAndEquipment",
        "order": 6
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentAssetsAbstract",
        "to": "sg-as:InvestmentProperties",
        "order": 7
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentAssetsAbstract",
        "to": "sg-as:Goodwill",
        "order": 8
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentAssetsAbstract",
        "to": "sg-as:IntangibleAssetsOtherThanGoodwill",
        "order": 9
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentAssetsAbstract",
        "to": "sg-as:InvestmentsInSubsidiariesAssociatesOrJointVentures",
        "order": 10
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentAssetsAbstract",
        "to": "sg-as:DeferredTaxAssets",
        "order": 11
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentAssetsAbstract",
        "to": "sg-as:OtherNoncurrentNonfinancialAssets",
        "order": 12
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentAssetsAbstract",
        "to": "sg-as:NoncurrentAssets",
        "order": 13
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:AssetsAbstract",
        "to": "sg-as:Assets",
        "order": 3
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:StatementOfFinancialPositionLineItems",
        "to": "sg-as:LiabilitiesAbstract",
        "order": 3
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:LiabilitiesAbstract",
        "to": "sg-as:CurrentLiabilitiesAbstract",
        "order": 1
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentLiabilitiesAbstract",
        "to": "sg-as:TradeAndOtherPayablesCurrent",
        "order": 1
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentLiabilitiesAbstract",
        "to": "sg-as:CurrentLoansAndBorrowings",
        "order": 2
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentLiabilitiesAbstract",
        "to": "sg-as:CurrentFinancialLiabilitiesMeasuredAtFairValueThroughProfitOrLoss",
        "order": 3
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentLiabilitiesAbstract",
        "to": "sg-as:CurrentFinanceLeaseLiabilities",
        "order": 4
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentLiabilitiesAbstract",
        "to": "sg-as:OtherCurrentFinancialLiabilities",
        "order": 5
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentLiabilitiesAbstract",
        "to": "sg-as:CurrentIncomeTaxLiabilities",
        "order": 6
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentLiabilitiesAbstract",
        "to": "sg-as:CurrentProvisions",
        "order": 7
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentLiabilitiesAbstract",
        "to": "sg-as:OtherCurrentNonfinancialLiabilities",
        "order": 8
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentLiabilitiesAbstract",
        "to": "sg-as:LiabilitiesClassifiedAsHeldForSale",
        "order": 9
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentLiabilitiesAbstract",
        "to": "sg-as:CurrentLiabilities",
        "order": 10
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:LiabilitiesAbstract",
        "to": "sg-as:NoncurrentLiabilitiesAbstract",
        "order": 2
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentLiabilitiesAbstract",
        "to": "sg-as:TradeAndOtherPayablesNoncurrent",
        "order": 1
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentLiabilitiesAbstract",
        "to": "sg-as:NoncurrentLoansAndBorrowings",
        "order": 2
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentLiabilitiesAbstract",
        "to": "sg-as:NoncurrentFinancialLiabilitiesMeasuredAtFairValueThroughProfitOrLoss",
        "order": 3
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentLiabilitiesAbstract",
        "to": "sg-as:NoncurrentFinanceLeaseLiabilities",
        "order": 4
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentLiabilitiesAbstract",
        "to": "sg-as:OtherNoncurrentFinancialLiabilities",
        "order": 5
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentLiabilitiesAbstract",
        "to": "sg-as:DeferredTaxLiabilities",
        "order": 6
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentLiabilitiesAbstract",
        "to": "sg-as:NoncurrentProvisions",
        "order": 7
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentLiabilitiesAbstract",
        "to": "sg-as:OtherNoncurrentNonfinancialLiabilities",
        "order": 8
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentLiabilitiesAbstract",
        "to": "sg-as:NoncurrentLiabilities",
        "order": 9
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:LiabilitiesAbstract",
        "to": "sg-as:Liabilities",
        "order": 3
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:StatementOfFinancialPositionLineItems",
        "to": "sg-as:EquityAbstract",
        "order": 4
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:EquityAbstract",
        "to": "sg-as:CapitalAndReservesAttributableToEquityOwnersOfCompanyAbstract",
        "order": 1
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CapitalAndReservesAttributableToEquityOwnersOfCompanyAbstract",
        "to": "sg-as:ShareCapital",
        "order": 1
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CapitalAndReservesAttributableToEquityOwnersOfCompanyAbstract",
        "to": "sg-as:TreasuryShares",
        "order": 2
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CapitalAndReservesAttributableToEquityOwnersOfCompanyAbstract",
        "to": "sg-as:AccumulatedProfitsLosses",
        "order": 3
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CapitalAndReservesAttributableToEquityOwnersOfCompanyAbstract",
        "to": "sg-as:ReservesOtherThanAccumulatedProfitsLosses",
        "order": 4
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:EquityAbstract",
        "to": "sg-as:NoncontrollingInterests",
        "order": 2
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:EquityAbstract",
        "to": "sg-as:Equity",
        "order": 3
      },
      {
        "role": "ISNature",
        "arcrole": "all",
        "from": "sg-as:StatementOfProfitOrLossAbstract",
        "to": "sg-as:StatementOfProfitOrLossTable",
        "order": 1
      },
      {
        "role": "ISNature",
        "arcrole": "hypercube-dimension",
        "from": "sg-as:StatementOfProfitOrLossTable",
        "to": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
        "order": 1
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:StatementOfProfitOrLossAbstract",
        "to": "sg-as:StatementOfProfitOrLossLineItems",
        "order": 2
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:StatementOfProfitOrLossLineItems",
        "to": "sg-as:ProfitLossAbstract",
        "order": 1
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:ProfitLossAbstract",
        "to": "sg-as:Revenue",
        "order": 1
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:ProfitLossAbstract",
        "to": "sg-as:OtherIncome",
        "order": 2
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:ProfitLossAbstract",
        "to": "sg-as:EmployeeBenefitsExpense",
        "order": 3
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:ProfitLossAbstract",
        "to": "sg-as:DepreciationExpense",
        "order": 4
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:ProfitLossAbstract",
        "to": "sg-as:AmortisationExpense",
        "order": 5
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:ProfitLossAbstract",
        "to": "sg-as:RepairsAndMaintenanceExpense",
        "order": 6
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:ProfitLossAbstract",
        "to": "sg-as:SalesAndMarketingExpense",
        "order": 7
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:ProfitLossAbstract",
        "to": "sg-as:OtherExpensesByNature",
        "order": 8
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:ProfitLossAbstract",
        "to": "sg-as:OtherGainsLosses",
        "order": 9
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:ProfitLossAbstract",
        "to": "sg-as:FinanceCosts",
        "order": 10
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:ProfitLossAbstract",
        "to": "sg-as:ShareOfProfitLossOfAssociatesAndJointVenturesAccountedForUsingEquityMethod",
        "order": 11
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:ProfitLossAbstract",
        "to": "sg-as:ProfitLossBeforeTaxation",
        "order": 12
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:ProfitLossAbstract",
        "to": "sg-as:TaxExpenseBenefitContinuingOperations",
        "order": 13
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:ProfitLossAbstract",
        "to": "sg-as:ProfitLossFromDiscontinuedOperations",
        "order": 14
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:ProfitLossAbstract",
        "to": "sg-as:ProfitLoss",
        "order": 15
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:StatementOfProfitOrLossLineItems",
        "to": "sg-as:ProfitLossAttributableToAbstract",
        "order": 2
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:ProfitLossAttributableToAbstract",
        "to": "sg-as:ProfitLossAttributableToOwnersOfCompany",
        "order": 1
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:ProfitLossAttributableToAbstract",
        "to": "sg-as:ProfitLossAttributableToNoncontrollingInterests",
        "order": 2
      },
      {
        "role": "NoteRevenue",
        "arcrole": "all",
        "from": "sg-as:DisclosureOfRevenueAbstract",
        "to": "sg-as:DisclosureOfRevenueTable",
        "order": 1
      },
      {
        "role": "NoteRevenue",
        "arcrole": "hypercube-dimension",
        "from": "sg-as:DisclosureOfRevenueTable",
        "to": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
        "order": 1
      },
      {
        "role": "NoteRevenue",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfRevenueAbstract",
        "to": "sg-as:DisclosureOfRevenueLineItems",
        "order": 2
      },
      {
        "role": "NoteRevenue",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfRevenueLineItems",
        "to": "sg-as:RevenueAbstract",
        "order": 1
      },
      {
        "role": "NoteRevenue",
        "arcrole": "domain-member",
        "from": "sg-as:RevenueAbstract",
        "to": "sg-as:RevenueFromPropertyTransferredAtPointInTime",
        "order": 1
      },
      {
        "role": "NoteRevenue",
        "arcrole": "domain-member",
        "from": "sg-as:RevenueAbstract",
        "to": "sg-as:RevenueFromGoodsTransferredAtPointInTime",
        "order": 2
      },
      {
        "role": "NoteRevenue",
        "arcrole": "domain-member",
        "from": "sg-as:RevenueAbstract",
        "to": "sg-as:RevenueFromServicesTransferredAtPointInTime",
        "order": 3
      },
      {
        "role": "NoteRevenue",
        "arcrole": "domain-member",
        "from": "sg-as:RevenueAbstract",
        "to": "sg-as:RevenueFromPropertyTransferredOverTime",
        "order": 4
      },
      {
        "role": "NoteRevenue",
        "arcrole": "domain-member",
        "from": "sg-as:RevenueAbstract",
        "to": "sg-as:RevenueFromConstructionContractsOverTime",
        "order": 5
      },
      {
        "role": "NoteRevenue",
        "arcrole": "domain-member",
        "from": "sg-as:RevenueAbstract",
        "to": "sg-as:RevenueFromServicesTransferredOverTime",
        "order": 6
      },
      {
        "role": "NoteRevenue",
        "arcrole": "domain-member",
        "from": "sg-as:RevenueAbstract",
        "to": "sg-as:OtherRevenue",
        "order": 7
      },
      {
        "role": "NoteRevenue",
        "arcrole": "domain-member",
        "from": "sg-as:RevenueAbstract",
        "to": "sg-as:Revenue",
        "order": 8
      },
      {
        "role": "SFPOrderOfLiquidity",
        "arcrole": "all",
        "from": "sg-as:StatementOfFinancialPositionAbstract",
        "to": "sg-as:StatementOfFinancialPositionTable",
        "order": 1
      },
      {
        "role": "SFPOrderOfLiquidity",
        "arcrole": "hypercube-dimension",
        "from": "sg-as:StatementOfFinancialPositionTable",
        "to": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
        "order": 1
      },
      {
        "role": "SFPOrderOfLiquidity",
        "arcrole": "domain-member",
        "from": "sg-as:StatementOfFinancialPositionAbstract",
        "to": "sg-as:StatementOfFinancialPositionLineItems",
        "order": 2
      },
      {
        "role": "SFPOrderOfLiquidity",
        "arcrole": "domain-member",
        "from": "sg-as:StatementOfFinancialPositionLineItems",
        "to": "sg-as:AssetsAbstract",
        "order": 1
      },
      {
        "role": "SFPOrderOfLiquidity",
        "arcrole": "domain-member",
        "from": "sg-as:AssetsAbstract",
        "to": "sg-as:Assets",
        "order": 1
      },
      {
        "role": "SFPOrderOfLiquidity",
        "arcrole": "domain-member",
        "from": "sg-as:LiabilitiesAbstract",
        "to": "sg-as:Liabilities",
        "order": 1
      },
      {
        "role": "SFPOrderOfLiquidity",
        "arcrole": "domain-member",
        "from": "sg-as:EquityAbstract",
        "to": "sg-as:NoncontrollingInterests",
        "order": 5
      },
      {
        "role": "SFPOrderOfLiquidity",
        "arcrole": "domain-member",
        "from": "sg-as:EquityAbstract",
        "to": "sg-as:Equity",
        "order": 6
      },
      {
        "role": "SFPOrderOfLiquidity",
        "arcrole": "domain-member",
        "from": "sg-as:EquityAbstract",
        "to": "sg-as:ShareCapital",
        "order": 1
      },
      {
        "role": "SFPOrderOfLiquidity",
        "arcrole": "domain-member",
        "from": "sg-as:EquityAbstract",
        "to": "sg-as:TreasuryShares",
        "order": 2
      },
      {
        "role": "SFPOrderOfLiquidity",
        "arcrole": "domain-member",
        "from": "sg-as:EquityAbstract",
        "to": "sg-as:AccumulatedProfitsLosses",
        "order": 3
      },
      {
        "role": "SFPOrderOfLiquidity",
        "arcrole": "domain-member",
        "from": "sg-as:EquityAbstract",
        "to": "sg-as:ReservesOtherThanAccumulatedProfitsLosses",
        "order": 4
      },
      {
        "role": "SFPOrderOfLiquidity",
        "arcrole": "domain-member",
        "from": "sg-as:StatementOfFinancialPositionLineItems",
        "to": "sg-as:LiabilitiesAndEquityAbstract",
        "order": 2
      },
      {
        "role": "SFPOrderOfLiquidity",
        "arcrole": "domain-member",
        "from": "sg-as:LiabilitiesAndEquityAbstract",
        "to": "sg-as:LiabilitiesAbstract",
        "order": 1
      },
      {
        "role": "SFPOrderOfLiquidity",
        "arcrole": "domain-member",
        "from": "sg-as:LiabilitiesAndEquityAbstract",
        "to": "sg-as:EquityAbstract",
        "order": 2
      }
    ]
  },
  full: {
    "entryPoint": "elts/sg-sfrs-ent_2026-01-01.xsd",
    "framework": "fr/sg-sfrs",
    "roleNamespace": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs",
    "roles": [
      {
        "role": "FilingInformation",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/FilingInformation",
        "definition": "[10000000] Filing information",
        "order": 10000000
      },
      {
        "role": "FullSetOfFinancialStatements",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/FullSetOfFinancialStatements",
        "definition": "[11000000] Full set of financial statements",
        "order": 11000000
      },
      {
        "role": "StatementByDirectors",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/StatementByDirectors",
        "definition": "[12000000] Statement by directors",
        "order": 12000000
      },
      {
        "role": "IndependentAuditorsReport",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/IndependentAuditorsReport",
        "definition": "[13000000] Independent auditors' report",
        "order": 13000000
      },
      {
        "role": "AdditionalInformation",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/AdditionalInformation",
        "definition": "[14000000] Additional information",
        "order": 14000000
      },
      {
        "role": "SFPCurrentNonCurrent",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/SFPCurrentNonCurrent",
        "definition": "[21100000] Statement of financial position, current and non-current",
        "order": 21100000
      },
      {
        "role": "SFPOrderOfLiquidity",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/SFPOrderOfLiquidity",
        "definition": "[21200000] Statement of financial position, order of liquidity",
        "order": 21200000
      },
      {
        "role": "ISNature",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/ISNature",
        "definition": "[22000000] Income statement, by nature of expense",
        "order": 22000000
      },
      {
        "role": "AdditionalCalculations",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/AdditionalCalculations",
        "definition": "[22900000] Additional calculations",
        "order": 22900000
      },
      {
        "role": "SCF",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/SCF",
        "definition": "[23000000] Statement of cash flows",
        "order": 23000000
      },
      {
        "role": "NoteTradeAndOtherReceivables",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/NoteTradeAndOtherReceivables",
        "definition": "[31000000] Note - Trade and other receivables",
        "order": 31000000
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/NotePropertyPlantAndEquipment",
        "definition": "[32000000] Note - Property, plant and equipment",
        "order": 32000000
      },
      {
        "role": "NoteIntangibleAssets",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/NoteIntangibleAssets",
        "definition": "[33000000] Note - Intangible assets (excluding goodwill)",
        "order": 33000000
      },
      {
        "role": "NoteRightOfUseAssets",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/NoteRightOfUseAssets",
        "definition": "[34000000] Note - Right-of-use assets",
        "order": 34000000
      },
      {
        "role": "NoteTradeAndOtherPayables",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/NoteTradeAndOtherPayables",
        "definition": "[35000000] Note - Trade and other payables",
        "order": 35000000
      },
      {
        "role": "NoteLoansAndBorrowings",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/NoteLoansAndBorrowings",
        "definition": "[36000000] Note - Loans and borrowings",
        "order": 36000000
      },
      {
        "role": "NoteRevenue",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/NoteRevenue",
        "definition": "[37000000] Note - Revenue",
        "order": 37000000
      },
      {
        "role": "NoteSelectedIncomeExpense",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/NoteSelectedIncomeExpense",
        "definition": "[38000000] Note - Selected income (expense)",
        "order": 38000000
      },
      {
        "role": "NoteRelatedParty",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/NoteRelatedParty",
        "definition": "[39000000] Note - Related party",
        "order": 39000000
      },
      {
        "role": "AxisConsolidatedAndSeparateFinancialStatements",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/AxisConsolidatedAndSeparateFinancialStatements",
        "definition": "[90050000] Axis - Consolidated and separate financial statements",
        "order": 90050000
      },
      {
        "role": "AxisDefaults",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/AxisDefaults",
        "definition": "[99999999] Axis - Defaults",
        "order": 99999999
      }
    ],
    "sections": [
      {
        "role": "FilingInformation",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/FilingInformation",
        "definition": "[10000000] Filing information",
        "order": 10000000,
        "presentation": [
          {
            "element": "sg-dei:DisclosureOfFilingInformationAbstract",
            "depth": 0,
            "order": 1
          },
          {
            "element": "sg-dei:NameOfCompany",
            "depth": 1,
            "order": 1
          },
          {
            "element": "sg-dei:UniqueEntityNumber",
            "depth": 1,
            "order": 2
          },
          {
            "element": "sg-dei:CurrentPeriodStartDate",
            "depth": 1,
            "order": 3
          },
          {
            "element": "sg-dei:CurrentPeriodEndDate",
            "depth": 1,
            "order": 4
          },
          {
            "element": "sg-dei:PriorPeriodStartDate",
            "depth": 1,
            "order": 5
          },
          {
            "element": "sg-dei:TypeOfXBRLFiling",
            "depth": 1,
            "order": 6
          },
          {
            "element": "sg-dei:NatureOfFinancialStatementsCompanyLevelOrConsolidated",
            "depth": 1,
            "order": 7
          },
          {
            "element": "sg-dei:TypeOfAccountingStandardUsedToPrepareFinancialStatements",
            "depth": 1,
            "order": 8
          },
          {
            "element": "sg-as:DateOfAuthorisationForIssueOfFinancialStatements",
            "depth": 1,
            "order": 9
          },
          {
            "element": "sg-dei:TypeOfStatementOfFinancialPosition",
            "depth": 1,
            "order": 10
          },
          {
            "element": "sg-dei:WhetherFinancialStatementsArePreparedOnGoingConcernBasis",
            "depth": 1,
            "order": 11
          },
          {
            "element": "sg-dei:WhetherThereAreChangesToComparativeAmountsDueToRestatementsReclassificationOrOtherReasons",
            "depth": 1,
            "order": 12
          },
          {
            "element": "sg-dei:DescriptionOfPresentationCurrency",
            "depth": 1,
            "order": 13
          },
          {
            "element": "sg-as:DescriptionOfFunctionalCurrency",
            "depth": 1,
            "order": 14
          },
          {
            "element": "sg-dei:LevelOfRoundingUsedInFinancialStatements",
            "depth": 1,
            "order": 15
          },
          {
            "element": "sg-as:DescriptionOfNatureOfEntitysOperationsAndPrincipalActivities",
            "depth": 1,
            "order": 16
          },
          {
            "element": "sg-as:PrincipalPlaceOfBusinessIfDifferentFromRegisteredOffice",
            "depth": 1,
            "order": 17
          },
          {
            "element": "sg-dei:WhetherCompanyOrGroupIfConsolidatedAccountsArePreparedHasMoreThan50Employees",
            "depth": 1,
            "order": 18
          },
          {
            "element": "sg-as:NameOfParentEntity",
            "depth": 1,
            "order": 19
          },
          {
            "element": "sg-as:NameOfUltimateParentOfGroup",
            "depth": 1,
            "order": 20
          },
          {
            "element": "sg-dei:DetailsOfInstanceDocumentAbstract",
            "depth": 1,
            "order": 21
          },
          {
            "element": "sg-dei:TaxonomyVersion",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-dei:NameAndVersionOfSoftwareUsedToGenerateInstanceDocument",
            "depth": 2,
            "order": 2
          },
          {
            "element": "sg-dei:HowWasXBRLInstanceDocumentPrepared",
            "depth": 2,
            "order": 3
          }
        ]
      },
      {
        "role": "FullSetOfFinancialStatements",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/FullSetOfFinancialStatements",
        "definition": "[11000000] Full set of financial statements",
        "order": 11000000,
        "presentation": [
          {
            "element": "sg-as:DisclosureOfCompleteSetOfFinancialStatementsAbstract",
            "depth": 0,
            "order": 1
          },
          {
            "element": "sg-as:DisclosureOfCompleteSetOfFinancialStatementsTextBlock",
            "depth": 1,
            "order": 1
          }
        ]
      },
      {
        "role": "StatementByDirectors",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/StatementByDirectors",
        "definition": "[12000000] Statement by directors",
        "order": 12000000,
        "presentation": [
          {
            "element": "sg-ca:DisclosureInStatementByDirectorsAbstract",
            "depth": 0,
            "order": 1
          },
          {
            "element": "sg-ca:WhetherInDirectorsOpinionFinancialStatementsAreDrawnUpSoAsToExhibitATrueAndFairView",
            "depth": 1,
            "order": 1
          },
          {
            "element": "sg-ca:WhetherThereAreReasonableGroundsToBelieveThatCompanyWillBeAbleToPayItsDebtsAsAndWhenTheyFallDueAtDateOfStatement",
            "depth": 1,
            "order": 2
          }
        ]
      },
      {
        "role": "IndependentAuditorsReport",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/IndependentAuditorsReport",
        "definition": "[13000000] Independent auditors' report",
        "order": 13000000,
        "presentation": [
          {
            "element": "sg-ssa:DisclosuresInIndependentAuditorsReportAbstract",
            "depth": 0,
            "order": 1
          },
          {
            "element": "sg-ssa:TypeOfAuditOpinionInIndependentAuditorsReport",
            "depth": 1,
            "order": 1
          },
          {
            "element": "sg-ssa:AuditingStandardsUsedToConductAudit",
            "depth": 1,
            "order": 2
          },
          {
            "element": "sg-ssa:ReasonForModifiedAuditOpinionAbstract",
            "depth": 1,
            "order": 3
          },
          {
            "element": "sg-ssa:ReasonForModifiedAuditOpinionRelatedToImpairmentOfAssets",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-ssa:ReasonForModifiedAuditOpinionRelatedToGoingConcern",
            "depth": 2,
            "order": 2
          },
          {
            "element": "sg-ssa:ReasonForModifiedAuditOpinionRelatedToAuditOfOpeningBalance",
            "depth": 2,
            "order": 3
          },
          {
            "element": "sg-ssa:ReasonForModifiedAuditOpinionRelatedToConsolidatedOrEquityAccounting",
            "depth": 2,
            "order": 4
          },
          {
            "element": "sg-ssa:ReasonForModifiedAuditOpinionRelatedToOngoingInvestigationOrLegalCases",
            "depth": 2,
            "order": 5
          },
          {
            "element": "sg-ssa:ReasonForModifiedAuditOpinionRelatedToOthers",
            "depth": 2,
            "order": 6
          },
          {
            "element": "sg-ssa:WhetherThereIsAnyMaterialUncertaintyRelatingToGoingConcern",
            "depth": 1,
            "order": 4
          },
          {
            "element": "sg-ssa:DidAuditorConcludeThatThereIsMaterialMisstatementOfOtherInformation",
            "depth": 1,
            "order": 5
          },
          {
            "element": "sg-ca:WhetherInAuditorsOpinionAccountingAndOtherRecordsRequiredAreProperlyKeptInAccordanceWithCompaniesAct",
            "depth": 1,
            "order": 6
          },
          {
            "element": "sg-lm:YearOfAppointmentOfSigningAuditor",
            "depth": 1,
            "order": 7
          },
          {
            "element": "sg-ssa:NumberOfKeyAuditMattersReported",
            "depth": 1,
            "order": 8
          },
          {
            "element": "sg-ssa:DisclosuresOnKeyAuditMattersAbstract",
            "depth": 1,
            "order": 9
          },
          {
            "element": "sg-ssa:KeyAuditMattersValuationOfReceivablesAndOtherFinancialInstruments",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-ssa:KeyAuditMattersImpairmentOfGoodwillAndOtherIntangibleAssets",
            "depth": 2,
            "order": 2
          },
          {
            "element": "sg-ssa:KeyAuditMattersValuationOfInvestmentProperty",
            "depth": 2,
            "order": 3
          },
          {
            "element": "sg-ssa:KeyAuditMattersValuationOfPropertyPlantAndEquipment",
            "depth": 2,
            "order": 4
          },
          {
            "element": "sg-ssa:KeyAuditMattersRevenueRecognition",
            "depth": 2,
            "order": 5
          },
          {
            "element": "sg-ssa:KeyAuditMattersOthers",
            "depth": 2,
            "order": 6
          }
        ]
      },
      {
        "role": "AdditionalInformation",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/AdditionalInformation",
        "definition": "[14000000] Additional information",
        "order": 14000000,
        "presentation": [
          {
            "element": "sg-as:DisclosureOfAdditionalInformationAbstract",
            "depth": 0,
            "order": 1
          },
          {
            "element": "sg-as:NumberOfEmployeesOfCompany",
            "depth": 1,
            "order": 1
          },
          {
            "element": "sg-as:NumberOfEmployeesOfGroup",
            "depth": 1,
            "order": 2
          },
          {
            "element": "sg-as:WhetherCompanyIsSubsidiary",
            "depth": 1,
            "order": 3
          },
          {
            "element": "sg-as:UniqueEntityNumberOfSingaporeParentCompanyPreparingConsolidatedFinancialStatements",
            "depth": 1,
            "order": 4
          },
          {
            "element": "sg-as:WhetherEntityIsSingaporeIncorporatedParentPreparingAndFilingSetOfConsolidatedFinancialStatementsWithACRA",
            "depth": 1,
            "order": 5
          },
          {
            "element": "sg-as:WhetherEntityHasAnySingaporeIncorporatedParentCompany",
            "depth": 1,
            "order": 6
          },
          {
            "element": "sg-as:WhetherCompanyHasAnySubsidiaryAssociateOrJointVenture",
            "depth": 1,
            "order": 7
          },
          {
            "element": "sg-as:WhetherEntityIsForeignIncorporatedCompanyPreparingAndFilingSetOfConsolidatedFinancialStatementsIndicateWebsiteOrAvenueWhereConsolidatedFinancialStatementsCanBeFound",
            "depth": 1,
            "order": 8
          }
        ]
      },
      {
        "role": "SFPCurrentNonCurrent",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/SFPCurrentNonCurrent",
        "definition": "[21100000] Statement of financial position, current and non-current",
        "order": 21100000,
        "presentation": [
          {
            "element": "sg-as:StatementOfFinancialPositionAbstract",
            "depth": 0,
            "order": 1
          },
          {
            "element": "sg-as:StatementOfFinancialPositionTable",
            "depth": 1,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedMember",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:SeparateMember",
            "depth": 4,
            "order": 1
          },
          {
            "element": "sg-as:StatementOfFinancialPositionLineItems",
            "depth": 1,
            "order": 2
          },
          {
            "element": "sg-as:AssetsAbstract",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:CurrentAssetsAbstract",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:CashAndBankBalances",
            "depth": 4,
            "order": 1
          },
          {
            "element": "sg-as:TradeAndOtherReceivablesCurrent",
            "depth": 4,
            "order": 2
          },
          {
            "element": "sg-as:CurrentFinanceLeaseReceivables",
            "depth": 4,
            "order": 3
          },
          {
            "element": "sg-as:CurrentDerivativeFinancialAssets",
            "depth": 4,
            "order": 4
          },
          {
            "element": "sg-as:CurrentFinancialAssetsMeasuredAtFairValueThroughProfitOrLoss",
            "depth": 4,
            "order": 5
          },
          {
            "element": "sg-as:OtherCurrentFinancialAssets",
            "depth": 4,
            "order": 6
          },
          {
            "element": "sg-as:DevelopmentProperties",
            "depth": 4,
            "order": 7
          },
          {
            "element": "sg-as:Inventories",
            "depth": 4,
            "order": 8
          },
          {
            "element": "sg-as:OtherCurrentNonfinancialAssets",
            "depth": 4,
            "order": 9
          },
          {
            "element": "sg-as:NoncurrentAssetsOrDisposalGroupsClassifiedAsHeldForSaleOrAsHeldForDistributionToOwners",
            "depth": 4,
            "order": 10
          },
          {
            "element": "sg-as:CurrentAssets",
            "depth": 4,
            "order": 11
          },
          {
            "element": "sg-as:NoncurrentAssetsAbstract",
            "depth": 3,
            "order": 2
          },
          {
            "element": "sg-as:TradeAndOtherReceivablesNoncurrent",
            "depth": 4,
            "order": 1
          },
          {
            "element": "sg-as:NoncurrentFinanceLeaseReceivables",
            "depth": 4,
            "order": 2
          },
          {
            "element": "sg-as:NoncurrentDerivativeFinancialAssets",
            "depth": 4,
            "order": 3
          },
          {
            "element": "sg-as:NoncurrentFinancialAssetsMeasuredAtFairValueThroughProfitOrLoss",
            "depth": 4,
            "order": 4
          },
          {
            "element": "sg-as:OtherNoncurrentFinancialAssets",
            "depth": 4,
            "order": 5
          },
          {
            "element": "sg-as:PropertyPlantAndEquipment",
            "depth": 4,
            "order": 6
          },
          {
            "element": "sg-as:InvestmentProperties",
            "depth": 4,
            "order": 7
          },
          {
            "element": "sg-as:Goodwill",
            "depth": 4,
            "order": 8
          },
          {
            "element": "sg-as:IntangibleAssetsOtherThanGoodwill",
            "depth": 4,
            "order": 9
          },
          {
            "element": "sg-as:InvestmentsInSubsidiariesAssociatesOrJointVentures",
            "depth": 4,
            "order": 10
          },
          {
            "element": "sg-as:DeferredTaxAssets",
            "depth": 4,
            "order": 11
          },
          {
            "element": "sg-as:OtherNoncurrentNonfinancialAssets",
            "depth": 4,
            "order": 12
          },
          {
            "element": "sg-as:NoncurrentAssets",
            "depth": 4,
            "order": 13
          },
          {
            "element": "sg-as:Assets",
            "depth": 3,
            "order": 3
          },
          {
            "element": "sg-as:LiabilitiesAbstract",
            "depth": 2,
            "order": 2
          },
          {
            "element": "sg-as:CurrentLiabilitiesAbstract",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:TradeAndOtherPayablesCurrent",
            "depth": 4,
            "order": 1
          },
          {
            "element": "sg-as:CurrentLoansAndBorrowings",
            "depth": 4,
            "order": 2
          },
          {
            "element": "sg-as:CurrentFinancialLiabilitiesMeasuredAtFairValueThroughProfitOrLoss",
            "depth": 4,
            "order": 3
          },
          {
            "element": "sg-as:CurrentFinanceLeaseLiabilities",
            "depth": 4,
            "order": 4
          },
          {
            "element": "sg-as:OtherCurrentFinancialLiabilities",
            "depth": 4,
            "order": 5
          },
          {
            "element": "sg-as:CurrentIncomeTaxLiabilities",
            "depth": 4,
            "order": 6
          },
          {
            "element": "sg-as:CurrentProvisions",
            "depth": 4,
            "order": 7
          },
          {
            "element": "sg-as:OtherCurrentNonfinancialLiabilities",
            "depth": 4,
            "order": 8
          },
          {
            "element": "sg-as:LiabilitiesClassifiedAsHeldForSale",
            "depth": 4,
            "order": 9
          },
          {
            "element": "sg-as:CurrentLiabilities",
            "depth": 4,
            "order": 10
          },
          {
            "element": "sg-as:NoncurrentLiabilitiesAbstract",
            "depth": 3,
            "order": 2
          },
          {
            "element": "sg-as:TradeAndOtherPayablesNoncurrent",
            "depth": 4,
            "order": 1
          },
          {
            "element": "sg-as:NoncurrentLoansAndBorrowings",
            "depth": 4,
            "order": 2
          },
          {
            "element": "sg-as:NoncurrentFinancialLiabilitiesMeasuredAtFairValueThroughProfitOrLoss",
            "depth": 4,
            "order": 3
          },
          {
            "element": "sg-as:NoncurrentFinanceLeaseLiabilities",
            "depth": 4,
            "order": 4
          },
          {
            "element": "sg-as:OtherNoncurrentFinancialLiabilities",
            "depth": 4,
            "order": 5
          },
          {
            "element": "sg-as:DeferredTaxLiabilities",
            "depth": 4,
            "order": 6
          },
          {
            "element": "sg-as:NoncurrentProvisions",
            "depth": 4,
            "order": 7
          },
          {
            "element": "sg-as:OtherNoncurrentNonfinancialLiabilities",
            "depth": 4,
            "order": 8
          },
          {
            "element": "sg-as:NoncurrentLiabilities",
            "depth": 4,
            "order": 9
          },
          {
            "element": "sg-as:Liabilities",
            "depth": 3,
            "order": 3
          },
          {
            "element": "sg-as:EquityAbstract",
            "depth": 2,
            "order": 3
          },
          {
            "element": "sg-as:ShareCapital",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:TreasuryShares",
            "depth": 3,
            "order": 2
          },
          {
            "element": "sg-as:AccumulatedProfitsLosses",
            "depth": 3,
            "order": 3
          },
          {
            "element": "sg-as:ReservesOtherThanAccumulatedProfitsLosses",
            "depth": 3,
            "order": 4
          },
          {
            "element": "sg-as:NoncontrollingInterests",
            "depth": 3,
            "order": 5
          },
          {
            "element": "sg-as:Equity",
            "depth": 3,
            "order": 6
          }
        ]
      },
      {
        "role": "SFPOrderOfLiquidity",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/SFPOrderOfLiquidity",
        "definition": "[21200000] Statement of financial position, order of liquidity",
        "order": 21200000,
        "presentation": [
          {
            "element": "sg-as:StatementOfFinancialPositionAbstract",
            "depth": 0,
            "order": 1
          },
          {
            "element": "sg-as:StatementOfFinancialPositionTable",
            "depth": 1,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedMember",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:SeparateMember",
            "depth": 4,
            "order": 1
          },
          {
            "element": "sg-as:StatementOfFinancialPositionLineItems",
            "depth": 1,
            "order": 2
          },
          {
            "element": "sg-as:AssetsAbstract",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:Assets",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:LiabilitiesAbstract",
            "depth": 2,
            "order": 2
          },
          {
            "element": "sg-as:Liabilities",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:EquityAbstract",
            "depth": 2,
            "order": 3
          },
          {
            "element": "sg-as:ShareCapital",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:TreasuryShares",
            "depth": 3,
            "order": 2
          },
          {
            "element": "sg-as:AccumulatedProfitsLosses",
            "depth": 3,
            "order": 3
          },
          {
            "element": "sg-as:ReservesOtherThanAccumulatedProfitsLosses",
            "depth": 3,
            "order": 4
          },
          {
            "element": "sg-as:NoncontrollingInterests",
            "depth": 3,
            "order": 5
          },
          {
            "element": "sg-as:Equity",
            "depth": 3,
            "order": 6
          }
        ]
      },
      {
        "role": "ISNature",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/ISNature",
        "definition": "[22000000] Income statement, by nature of expense",
        "order": 22000000,
        "presentation": [
          {
            "element": "sg-as:StatementOfProfitOrLossAbstract",
            "depth": 0,
            "order": 1
          },
          {
            "element": "sg-as:StatementOfProfitOrLossTable",
            "depth": 1,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedMember",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:SeparateMember",
            "depth": 4,
            "order": 1
          },
          {
            "element": "sg-as:StatementOfProfitOrLossLineItems",
            "depth": 1,
            "order": 2
          },
          {
            "element": "sg-as:ProfitLossAbstract",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:Revenue",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:OtherIncome",
            "depth": 3,
            "order": 2
          },
          {
            "element": "sg-as:EmployeeBenefitsExpense",
            "depth": 3,
            "order": 3
          },
          {
            "element": "sg-as:DepreciationExpense",
            "depth": 3,
            "order": 4
          },
          {
            "element": "sg-as:AmortisationExpense",
            "depth": 3,
            "order": 5
          },
          {
            "element": "sg-as:RepairsAndMaintenanceExpense",
            "depth": 3,
            "order": 6
          },
          {
            "element": "sg-as:SalesAndMarketingExpense",
            "depth": 3,
            "order": 7
          },
          {
            "element": "sg-as:OtherExpensesByNature",
            "depth": 3,
            "order": 8
          },
          {
            "element": "sg-as:OtherGainsLosses",
            "depth": 3,
            "order": 9
          },
          {
            "element": "sg-as:FinanceCosts",
            "depth": 3,
            "order": 10
          },
          {
            "element": "sg-as:ShareOfProfitLossOfAssociatesAndJointVenturesAccountedForUsingEquityMethod",
            "depth": 3,
            "order": 11
          },
          {
            "element": "sg-as:ProfitLossBeforeTaxation",
            "depth": 3,
            "order": 12
          },
          {
            "element": "sg-as:TaxExpenseBenefitContinuingOperations",
            "depth": 3,
            "order": 13
          },
          {
            "element": "sg-as:ProfitLossFromDiscontinuedOperations",
            "depth": 3,
            "order": 14
          },
          {
            "element": "sg-as:ProfitLoss",
            "depth": 3,
            "order": 15
          },
          {
            "element": "sg-as:ProfitLossAttributableToAbstract",
            "depth": 2,
            "order": 2
          },
          {
            "element": "sg-as:ProfitLossAttributableToOwnersOfCompany",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:ProfitLossAttributableToNoncontrollingInterests",
            "depth": 3,
            "order": 2
          }
        ]
      },
      {
        "role": "SCF",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/SCF",
        "definition": "[23000000] Statement of cash flows",
        "order": 23000000,
        "presentation": [
          {
            "element": "sg-as:StatementOfCashFlowsAbstract",
            "depth": 0,
            "order": 1
          },
          {
            "element": "sg-as:StatementOfCashFlowsTable",
            "depth": 1,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedMember",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:SeparateMember",
            "depth": 4,
            "order": 1
          },
          {
            "element": "sg-as:StatementOfCashFlowsLineItems",
            "depth": 1,
            "order": 2
          },
          {
            "element": "sg-as:NetCashFlowsAbstract",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:CashFlowsFromUsedInOperatingActivities",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:CashFlowsFromUsedInInvestingActivities",
            "depth": 3,
            "order": 2
          },
          {
            "element": "sg-as:CashFlowsFromUsedInFinancingActivities",
            "depth": 3,
            "order": 3
          }
        ]
      },
      {
        "role": "NoteTradeAndOtherReceivables",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/NoteTradeAndOtherReceivables",
        "definition": "[31000000] Note - Trade and other receivables",
        "order": 31000000,
        "presentation": [
          {
            "element": "sg-as:TradeAndOtherReceivablesAbstract",
            "depth": 0,
            "order": 1
          },
          {
            "element": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherReceivablesTable",
            "depth": 1,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedMember",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:SeparateMember",
            "depth": 4,
            "order": 1
          },
          {
            "element": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherReceivablesLineItems",
            "depth": 1,
            "order": 2
          },
          {
            "element": "sg-as:TradeAndOtherReceivablesDueFromThirdParties",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:TradeAndOtherReceivablesDueFromRelatedParties",
            "depth": 2,
            "order": 2
          },
          {
            "element": "sg-as:UnbilledReceivables",
            "depth": 2,
            "order": 3
          },
          {
            "element": "sg-as:OtherReceivables",
            "depth": 2,
            "order": 4
          },
          {
            "element": "sg-as:TradeAndOtherReceivables",
            "depth": 2,
            "order": 5
          },
          {
            "element": "sg-as:ClassesOfPartiesAxis",
            "depth": 0,
            "order": 2
          }
        ]
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/NotePropertyPlantAndEquipment",
        "definition": "[32000000] Note - Property, plant and equipment",
        "order": 32000000,
        "presentation": [
          {
            "element": "sg-as:DisclosureOfDetailedInformationAboutPropertyPlantAndEquipmentAbstract",
            "depth": 0,
            "order": 1
          },
          {
            "element": "sg-as:DisclosureOfDetailedInformationAboutPropertyPlantAndEquipmentTable",
            "depth": 1,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedMember",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:SeparateMember",
            "depth": 4,
            "order": 1
          },
          {
            "element": "sg-as:ClassesOfPropertyPlantAndEquipmentAxis",
            "depth": 2,
            "order": 2
          },
          {
            "element": "sg-as:PropertyPlantAndEquipmentMember",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:LandAndBuildingMember",
            "depth": 4,
            "order": 1
          },
          {
            "element": "sg-as:MotorAndOtherVehiclesMember",
            "depth": 4,
            "order": 2
          },
          {
            "element": "sg-as:MachineryAndOtherEquipmentMember",
            "depth": 4,
            "order": 3
          },
          {
            "element": "sg-as:ComputerOfficeEquipmentAndFurnitureFixturesAndFittingsMember",
            "depth": 4,
            "order": 4
          },
          {
            "element": "sg-as:CommunicationAndNetworkEquipmentMember",
            "depth": 4,
            "order": 5
          },
          {
            "element": "sg-as:LeaseholdImprovementsMember",
            "depth": 4,
            "order": 6
          },
          {
            "element": "sg-as:ConstructionInProgressMember",
            "depth": 4,
            "order": 7
          },
          {
            "element": "sg-as:OtherPropertyPlantAndEquipmentMember",
            "depth": 4,
            "order": 8
          },
          {
            "element": "sg-as:DisclosureOfDetailedInformationAboutPropertyPlantAndEquipmentLineItems",
            "depth": 1,
            "order": 2
          },
          {
            "element": "sg-as:GrossCarryingAmountOfPropertyPlantAndEquipmentAbstract",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:GrossCarryingAmountOfPropertyPlantAndEquipment",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:IncreaseDecreaseThroughNetExchangeDifferencesPropertyPlantAndEquipment",
            "depth": 3,
            "order": 2
          },
          {
            "element": "sg-as:AdditionsOtherThanThroughBusinessCombinationsPropertyPlantAndEquipment",
            "depth": 3,
            "order": 3
          },
          {
            "element": "sg-as:DecreaseThroughLossOfControlOfSubsidiaryPropertyPlantAndEquipment",
            "depth": 3,
            "order": 4
          },
          {
            "element": "sg-as:IncreaseDecreaseThroughOtherChangesPropertyPlantAndEquipment",
            "depth": 3,
            "order": 5
          },
          {
            "element": "sg-as:GrossCarryingAmountOfPropertyPlantAndEquipment",
            "depth": 3,
            "order": 6
          },
          {
            "element": "sg-as:AccumulatedDepreciationAmortisationAndImpairmentOnPropertyPlantAndEquipmentAbstract",
            "depth": 2,
            "order": 2
          },
          {
            "element": "sg-as:AccumulatedDepreciationAmortisationAndImpairmentOnPropertyPlantAndEquipment",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:AccumulatedDepreciationAmortisationAndImpairmentOnIncreaseDecreaseThroughNetExchangeDifferencesOnPropertyPlantAndEquipment",
            "depth": 3,
            "order": 2
          },
          {
            "element": "sg-as:DepreciationPropertyPlantAndEquipment",
            "depth": 3,
            "order": 3
          },
          {
            "element": "sg-as:ImpairmentLossPropertyPlantAndEquipment",
            "depth": 3,
            "order": 4
          },
          {
            "element": "sg-as:ReversalOfImpairmentLossPropertyPlantAndEquipment",
            "depth": 3,
            "order": 5
          },
          {
            "element": "sg-as:AccumulatedDepreciationAmortisationAndImpairmentOnDecreaseThroughLossOfControlOfSubsidiaryOnPropertyPlantAndEquipment",
            "depth": 3,
            "order": 6
          },
          {
            "element": "sg-as:AccumulatedDepreciationAmortisationAndImpairmentOnIncreaseDecreaseThroughOtherChangesPropertyPlantAndEquipment",
            "depth": 3,
            "order": 7
          },
          {
            "element": "sg-as:AccumulatedDepreciationAmortisationAndImpairmentOnPropertyPlantAndEquipment",
            "depth": 3,
            "order": 8
          },
          {
            "element": "sg-as:CarryingAmountOfPropertyPlantAndEquipmentAbstract",
            "depth": 2,
            "order": 3
          },
          {
            "element": "sg-as:PropertyPlantAndEquipment",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:PropertyPlantAndEquipment",
            "depth": 3,
            "order": 2
          },
          {
            "element": "sg-as:AnalysisOfPropertyPlantAndEquipmenByMeasurementBasistAbstract",
            "depth": 2,
            "order": 4
          },
          {
            "element": "sg-as:PropertyPlantAndEquipmentAtCost",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:PropertyPlantAndEquipmentAtValuation",
            "depth": 3,
            "order": 2
          }
        ]
      },
      {
        "role": "NoteIntangibleAssets",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/NoteIntangibleAssets",
        "definition": "[33000000] Note - Intangible assets (excluding goodwill)",
        "order": 33000000,
        "presentation": [
          {
            "element": "sg-as:DisclosureOfIntangibleAssetsAbstract",
            "depth": 0,
            "order": 1
          },
          {
            "element": "sg-as:DisclosureOfDetailedInformationAboutIntangibleAssetsTable",
            "depth": 1,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedMember",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:SeparateMember",
            "depth": 4,
            "order": 1
          },
          {
            "element": "sg-as:ClassesOfIntangibleAssetsAxis",
            "depth": 2,
            "order": 2
          },
          {
            "element": "sg-as:IntangibleAssetsMember",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:BrandNameMastheadsAndPublishingTitlesMember",
            "depth": 4,
            "order": 1
          },
          {
            "element": "sg-as:ComputerSoftwareMember",
            "depth": 4,
            "order": 2
          },
          {
            "element": "sg-as:LicencesAndFranchisesMember",
            "depth": 4,
            "order": 3
          },
          {
            "element": "sg-as:CopyrightsPatentsAndIndustrialPropertyRightsServiceAndOperatingRightsRecipesFormulaeModelsDesignsPrototypesCapitalDevelopmentExpenditureMember",
            "depth": 4,
            "order": 4
          },
          {
            "element": "sg-as:IntangibleAssetsUnderDevelopmentMember",
            "depth": 4,
            "order": 5
          },
          {
            "element": "sg-as:OtherIntangibleAssetsMember",
            "depth": 4,
            "order": 6
          },
          {
            "element": "sg-as:DisclosureOfDetailedInformationAboutIntangibleAssetsLineItems",
            "depth": 1,
            "order": 2
          },
          {
            "element": "sg-as:IntangibleAssetsOtherThanGoodwillGrossAbstract",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:GrossCarryingAmountOfIntangibleAssets",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:IncreaseDecreaseThroughNetExchangeDifferencesIntangibleAssetsOtherThanGoodwill",
            "depth": 3,
            "order": 2
          },
          {
            "element": "sg-as:AcquisitionsThroughBusinessCombinationsIntangibleAssetsOtherThanGoodwill",
            "depth": 3,
            "order": 3
          },
          {
            "element": "sg-as:DecreaseThroughLossOfControlOfSubsidiaryIntangibleAssetsOtherThanGoodwill",
            "depth": 3,
            "order": 4
          },
          {
            "element": "sg-as:IncreaseDecreaseThroughOtherChangesIntangibleAssetsOtherThanGoodwill",
            "depth": 3,
            "order": 5
          },
          {
            "element": "sg-as:GrossCarryingAmountOfIntangibleAssets",
            "depth": 3,
            "order": 6
          },
          {
            "element": "sg-as:AmortisationAndImpairmentOnIntangibleAssetsOtherThanGoodwillAbstract",
            "depth": 2,
            "order": 2
          },
          {
            "element": "sg-as:AmortisationAndImpairmentOnIntangibleAssetsOtherThanGoodwillGross",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:AmortisationOfIncreaseDecreaseThroughNetExchangeDifferencesOnIntangibleAssetsOtherThanGoodwill",
            "depth": 3,
            "order": 2
          },
          {
            "element": "sg-as:AmortisationIntangibleAssetsOtherThanGoodwill",
            "depth": 3,
            "order": 3
          },
          {
            "element": "sg-as:ImpairmentLossRecognisedInProfitOrLossIntangibleAssetsOtherThanGoodwill",
            "depth": 3,
            "order": 4
          },
          {
            "element": "sg-as:ReversalOfImpairmentLossRecognisedInProfitOrLossIntangibleAssetsOtherThanGoodwill",
            "depth": 3,
            "order": 5
          },
          {
            "element": "sg-as:AmortisationOfDecreaseThroughLossOfControlOfSubsidiaryOnIntangibleAssetsOtherThanGoodwill",
            "depth": 3,
            "order": 6
          },
          {
            "element": "sg-as:AmortisationOfIncreaseDecreaseThroughOtherChangesOnIntangibleAssetsOtherThanGoodwill",
            "depth": 3,
            "order": 7
          },
          {
            "element": "sg-as:AmortisationAndImpairmentOnIntangibleAssetsOtherThanGoodwillGross",
            "depth": 3,
            "order": 8
          },
          {
            "element": "sg-as:IntangibleAssetsOtherThanGoodwillNetAbstract",
            "depth": 2,
            "order": 3
          },
          {
            "element": "sg-as:IntangibleAssetsOtherThanGoodwill",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:IntangibleAssetsOtherThanGoodwill",
            "depth": 3,
            "order": 2
          },
          {
            "element": "sg-as:AnalysisOfIntangibleAssetsOtherThanGoodwillByMeasurementBasisAbstract",
            "depth": 2,
            "order": 4
          },
          {
            "element": "sg-as:IntangibleAssetsOtherThanGoodwillAtCost",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:IntangibleAssetsOtherThanGoodwillAtValuation",
            "depth": 3,
            "order": 2
          }
        ]
      },
      {
        "role": "NoteRightOfUseAssets",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/NoteRightOfUseAssets",
        "definition": "[34000000] Note - Right-of-use assets",
        "order": 34000000,
        "presentation": [
          {
            "element": "sg-as:DisclosureOfRightofuseAssetsAbstract",
            "depth": 0,
            "order": 1
          },
          {
            "element": "sg-as:DisclosureOfRightofuseAssetsTable",
            "depth": 1,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedMember",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:SeparateMember",
            "depth": 4,
            "order": 1
          },
          {
            "element": "sg-as:DisclosureOfRightofuseAssetsItems",
            "depth": 1,
            "order": 2
          },
          {
            "element": "sg-as:RightofuseAssetsAbstract",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:RightofuseAssetsClassifiedInPropertyPlantAndEquipment",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:RightofuseAssetsClassifiedInIntangibleAssetsOtherThanGoodwill",
            "depth": 3,
            "order": 2
          },
          {
            "element": "sg-as:RightofuseAssetsClassifiedInOtherAssets",
            "depth": 3,
            "order": 3
          },
          {
            "element": "sg-as:RightofuseAssetsClassifiedInPropertyPlantAndEquipment",
            "depth": 0,
            "order": 2
          },
          {
            "element": "sg-as:RightofuseAssetsClassifiedInIntangibleAssetsOtherThanGoodwill",
            "depth": 0,
            "order": 3
          },
          {
            "element": "sg-as:RightofuseAssetsClassifiedInOtherAssets",
            "depth": 0,
            "order": 4
          }
        ]
      },
      {
        "role": "NoteTradeAndOtherPayables",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/NoteTradeAndOtherPayables",
        "definition": "[35000000] Note - Trade and other payables",
        "order": 35000000,
        "presentation": [
          {
            "element": "sg-as:TradeAndOtherPayablesAbstract",
            "depth": 0,
            "order": 1
          },
          {
            "element": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherPayablesTable",
            "depth": 1,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedMember",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:SeparateMember",
            "depth": 4,
            "order": 1
          },
          {
            "element": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherPayablesLineItems",
            "depth": 1,
            "order": 2
          },
          {
            "element": "sg-as:TradeAndOtherPayablesDueToThirdParties",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:TradeAndOtherPayablesDueToRelatedParties",
            "depth": 2,
            "order": 2
          },
          {
            "element": "sg-as:DeferredIncome",
            "depth": 2,
            "order": 3
          },
          {
            "element": "sg-as:OtherPayables",
            "depth": 2,
            "order": 4
          },
          {
            "element": "sg-as:TradeAndOtherPayables",
            "depth": 2,
            "order": 5
          }
        ]
      },
      {
        "role": "NoteLoansAndBorrowings",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/NoteLoansAndBorrowings",
        "definition": "[36000000] Note - Loans and borrowings",
        "order": 36000000,
        "presentation": [
          {
            "element": "sg-as:DisclosureOfLoansAndBorrowingsAbstract",
            "depth": 0,
            "order": 1
          },
          {
            "element": "sg-as:DisclosureOfLoansAndBorrowingsTable",
            "depth": 1,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedMember",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:SeparateMember",
            "depth": 4,
            "order": 1
          },
          {
            "element": "sg-as:DisclosureOfLoansAndBorrowingsLineItems",
            "depth": 1,
            "order": 2
          },
          {
            "element": "sg-as:LoansAndBorrowingsAbstract",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:BankOverdrafts",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:SecuredBankBorrowings",
            "depth": 3,
            "order": 2
          },
          {
            "element": "sg-as:UnsecuredBankBorrowings",
            "depth": 3,
            "order": 3
          },
          {
            "element": "sg-as:OtherBorrowings",
            "depth": 3,
            "order": 4
          },
          {
            "element": "sg-as:LoansAndBorrowings",
            "depth": 3,
            "order": 5
          }
        ]
      },
      {
        "role": "NoteRevenue",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/NoteRevenue",
        "definition": "[37000000] Note - Revenue",
        "order": 37000000,
        "presentation": [
          {
            "element": "sg-as:DisclosureOfRevenueAbstract",
            "depth": 0,
            "order": 1
          },
          {
            "element": "sg-as:DisclosureOfRevenueTable",
            "depth": 1,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedMember",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:SeparateMember",
            "depth": 4,
            "order": 1
          },
          {
            "element": "sg-as:DisclosureOfRevenueLineItems",
            "depth": 1,
            "order": 2
          },
          {
            "element": "sg-as:RevenueAbstract",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:RevenueFromPropertyTransferredAtPointInTime",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:RevenueFromGoodsTransferredAtPointInTime",
            "depth": 3,
            "order": 2
          },
          {
            "element": "sg-as:RevenueFromServicesTransferredAtPointInTime",
            "depth": 3,
            "order": 3
          },
          {
            "element": "sg-as:RevenueFromPropertyTransferredOverTime",
            "depth": 3,
            "order": 4
          },
          {
            "element": "sg-as:RevenueFromConstructionContractsOverTime",
            "depth": 3,
            "order": 5
          },
          {
            "element": "sg-as:RevenueFromServicesTransferredOverTime",
            "depth": 3,
            "order": 6
          },
          {
            "element": "sg-as:OtherRevenue",
            "depth": 3,
            "order": 7
          },
          {
            "element": "sg-as:Revenue",
            "depth": 3,
            "order": 8
          }
        ]
      },
      {
        "role": "NoteSelectedIncomeExpense",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/NoteSelectedIncomeExpense",
        "definition": "[38000000] Note - Selected income (expense)",
        "order": 38000000,
        "presentation": [
          {
            "element": "sg-as:DisclosureOfSelectedIncomeExpensesAbstract",
            "depth": 0,
            "order": 1
          },
          {
            "element": "sg-as:DisclosureOfSelectedIncomeExpensesTable",
            "depth": 1,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedMember",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:SeparateMember",
            "depth": 4,
            "order": 1
          },
          {
            "element": "sg-as:DisclosureOfSelectedIncomeExpensesLineItems",
            "depth": 1,
            "order": 2
          },
          {
            "element": "sg-as:DisclosureOfOtherIncomeAbstract",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:InterestIncomeClassifiedAsOtherIncome",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:DividendIncomeClassifiedAsOtherIncome",
            "depth": 3,
            "order": 2
          },
          {
            "element": "sg-as:OtherInvestmentIncomeClassifiedAsOtherIncome",
            "depth": 3,
            "order": 3
          },
          {
            "element": "sg-as:GovernmentGrantsClassifiedAsOtherIncome",
            "depth": 3,
            "order": 4
          },
          {
            "element": "sg-as:MiscellaneousIncomeClassifiedAsOtherIncome",
            "depth": 3,
            "order": 5
          },
          {
            "element": "sg-as:OtherIncome",
            "depth": 3,
            "order": 6
          },
          {
            "element": "sg-as:MaterialExpensesAbstract",
            "depth": 2,
            "order": 2
          },
          {
            "element": "sg-as:IncreaseDecreaseInInventoriesOfFinishedGoodsAndWorkInProgress",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:RawMaterialsAndConsumablesUsed",
            "depth": 3,
            "order": 2
          },
          {
            "element": "sg-as:SubcontractorCost",
            "depth": 3,
            "order": 3
          },
          {
            "element": "sg-as:DividendDeclaredDuringTheYear",
            "depth": 3,
            "order": 4
          },
          {
            "element": "sg-as:MaterialGainsLossesAbstract",
            "depth": 2,
            "order": 3
          },
          {
            "element": "sg-as:NetGainsLossesOnForeignExchangeAdjustment",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:NetGainsLossesOnDisposalOfPropertyPlantAndEquipment",
            "depth": 3,
            "order": 2
          },
          {
            "element": "sg-as:NetGainsLossesOnDisposalOfIntangibleAssets",
            "depth": 3,
            "order": 3
          },
          {
            "element": "sg-as:ImpairmentLossReversalOfImpairmentLossOnInvestments",
            "depth": 3,
            "order": 4
          },
          {
            "element": "sg-as:ImpairmentLossReversalOfImpairmentLossOnReceivables",
            "depth": 3,
            "order": 5
          },
          {
            "element": "sg-as:ImpairmentLossReversalOfImpairmentLossOnOthers",
            "depth": 3,
            "order": 6
          }
        ]
      },
      {
        "role": "NoteRelatedParty",
        "roleUri": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs/role/NoteRelatedParty",
        "definition": "[39000000] Note - Related party",
        "order": 39000000,
        "presentation": [
          {
            "element": "sg-as:RelatedPartyTransactionsAbstract",
            "depth": 0,
            "order": 1
          },
          {
            "element": "sg-as:RelatedPartyTransactionsTable",
            "depth": 1,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:ConsolidatedMember",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:SeparateMember",
            "depth": 4,
            "order": 1
          },
          {
            "element": "sg-as:DisclosureOfTransactionsBetweenRelatedPartiesLineItems",
            "depth": 1,
            "order": 2
          },
          {
            "element": "sg-as:DisclosureOfRelatedPartyTransactionAbstract",
            "depth": 2,
            "order": 1
          },
          {
            "element": "sg-as:WhetherCompanyHasOverseasInvestmentsInSubsidiariesAssociatesOrJointVentures",
            "depth": 3,
            "order": 1
          },
          {
            "element": "sg-as:RevenueFromRelatedPartyTransactions",
            "depth": 3,
            "order": 2
          },
          {
            "element": "sg-as:PurchasesFromRelatedPartyTransactions",
            "depth": 3,
            "order": 3
          }
        ]
      }
    ],
    "checks": [
      {
        "role": "NoteRevenue",
        "parent": "sg-as:Revenue",
        "children": [
          {
            "element": "sg-as:RevenueFromPropertyTransferredAtPointInTime",
            "weight": 1
          },
          {
            "element": "sg-as:RevenueFromGoodsTransferredAtPointInTime",
            "weight": 1
          },
          {
            "element": "sg-as:RevenueFromServicesTransferredAtPointInTime",
            "weight": 1
          },
          {
            "element": "sg-as:RevenueFromPropertyTransferredOverTime",
            "weight": 1
          },
          {
            "element": "sg-as:RevenueFromConstructionContractsOverTime",
            "weight": 1
          },
          {
            "element": "sg-as:RevenueFromServicesTransferredOverTime",
            "weight": 1
          },
          {
            "element": "sg-as:OtherRevenue",
            "weight": 1
          }
        ]
      },
      {
        "role": "ISNature",
        "parent": "sg-as:ProfitLoss",
        "children": [
          {
            "element": "sg-as:ProfitLossBeforeTaxation",
            "weight": 1
          },
          {
            "element": "sg-as:TaxExpenseBenefitContinuingOperations",
            "weight": -1
          },
          {
            "element": "sg-as:ProfitLossFromDiscontinuedOperations",
            "weight": 1
          }
        ]
      },
      {
        "role": "ISNature",
        "parent": "sg-as:ProfitLossBeforeTaxation",
        "children": [
          {
            "element": "sg-as:Revenue",
            "weight": 1
          },
          {
            "element": "sg-as:OtherIncome",
            "weight": 1
          },
          {
            "element": "sg-as:EmployeeBenefitsExpense",
            "weight": -1
          },
          {
            "element": "sg-as:DepreciationExpense",
            "weight": -1
          },
          {
            "element": "sg-as:AmortisationExpense",
            "weight": -1
          },
          {
            "element": "sg-as:RepairsAndMaintenanceExpense",
            "weight": -1
          },
          {
            "element": "sg-as:SalesAndMarketingExpense",
            "weight": -1
          },
          {
            "element": "sg-as:OtherExpensesByNature",
            "weight": -1
          },
          {
            "element": "sg-as:OtherGainsLosses",
            "weight": 1
          },
          {
            "element": "sg-as:FinanceCosts",
            "weight": -1
          },
          {
            "element": "sg-as:ShareOfProfitLossOfAssociatesAndJointVenturesAccountedForUsingEquityMethod",
            "weight": 1
          }
        ]
      },
      {
        "role": "SFPCurrentNonCurrent",
        "parent": "sg-as:NoncurrentAssets",
        "children": [
          {
            "element": "sg-as:TradeAndOtherReceivablesNoncurrent",
            "weight": 1
          },
          {
            "element": "sg-as:NoncurrentFinanceLeaseReceivables",
            "weight": 1
          },
          {
            "element": "sg-as:NoncurrentDerivativeFinancialAssets",
            "weight": 1
          },
          {
            "element": "sg-as:NoncurrentFinancialAssetsMeasuredAtFairValueThroughProfitOrLoss",
            "weight": 1
          },
          {
            "element": "sg-as:OtherNoncurrentFinancialAssets",
            "weight": 1
          },
          {
            "element": "sg-as:PropertyPlantAndEquipment",
            "weight": 1
          },
          {
            "element": "sg-as:InvestmentProperties",
            "weight": 1
          },
          {
            "element": "sg-as:Goodwill",
            "weight": 1
          },
          {
            "element": "sg-as:IntangibleAssetsOtherThanGoodwill",
            "weight": 1
          },
          {
            "element": "sg-as:InvestmentsInSubsidiariesAssociatesOrJointVentures",
            "weight": 1
          },
          {
            "element": "sg-as:DeferredTaxAssets",
            "weight": 1
          },
          {
            "element": "sg-as:OtherNoncurrentNonfinancialAssets",
            "weight": 1
          }
        ]
      },
      {
        "role": "SFPCurrentNonCurrent",
        "parent": "sg-as:Assets",
        "children": [
          {
            "element": "sg-as:CurrentAssets",
            "weight": 1
          },
          {
            "element": "sg-as:NoncurrentAssets",
            "weight": 1
          }
        ]
      },
      {
        "role": "SFPCurrentNonCurrent",
        "parent": "sg-as:CurrentAssets",
        "children": [
          {
            "element": "sg-as:CashAndBankBalances",
            "weight": 1
          },
          {
            "element": "sg-as:TradeAndOtherReceivablesCurrent",
            "weight": 1
          },
          {
            "element": "sg-as:CurrentFinanceLeaseReceivables",
            "weight": 1
          },
          {
            "element": "sg-as:CurrentDerivativeFinancialAssets",
            "weight": 1
          },
          {
            "element": "sg-as:CurrentFinancialAssetsMeasuredAtFairValueThroughProfitOrLoss",
            "weight": 1
          },
          {
            "element": "sg-as:OtherCurrentFinancialAssets",
            "weight": 1
          },
          {
            "element": "sg-as:DevelopmentProperties",
            "weight": 1
          },
          {
            "element": "sg-as:Inventories",
            "weight": 1
          },
          {
            "element": "sg-as:OtherCurrentNonfinancialAssets",
            "weight": 1
          },
          {
            "element": "sg-as:NoncurrentAssetsOrDisposalGroupsClassifiedAsHeldForSaleOrAsHeldForDistributionToOwners",
            "weight": 1
          }
        ]
      },
      {
        "role": "SFPCurrentNonCurrent",
        "parent": "sg-as:NoncurrentLiabilities",
        "children": [
          {
            "element": "sg-as:TradeAndOtherPayablesNoncurrent",
            "weight": 1
          },
          {
            "element": "sg-as:NoncurrentLoansAndBorrowings",
            "weight": 1
          },
          {
            "element": "sg-as:NoncurrentFinancialLiabilitiesMeasuredAtFairValueThroughProfitOrLoss",
            "weight": 1
          },
          {
            "element": "sg-as:NoncurrentFinanceLeaseLiabilities",
            "weight": 1
          },
          {
            "element": "sg-as:OtherNoncurrentFinancialLiabilities",
            "weight": 1
          },
          {
            "element": "sg-as:DeferredTaxLiabilities",
            "weight": 1
          },
          {
            "element": "sg-as:NoncurrentProvisions",
            "weight": 1
          },
          {
            "element": "sg-as:OtherNoncurrentNonfinancialLiabilities",
            "weight": 1
          }
        ]
      },
      {
        "role": "SFPCurrentNonCurrent",
        "parent": "sg-as:Liabilities",
        "children": [
          {
            "element": "sg-as:CurrentLiabilities",
            "weight": 1
          },
          {
            "element": "sg-as:NoncurrentLiabilities",
            "weight": 1
          }
        ]
      },
      {
        "role": "SFPCurrentNonCurrent",
        "parent": "sg-as:CurrentLiabilities",
        "children": [
          {
            "element": "sg-as:TradeAndOtherPayablesCurrent",
            "weight": 1
          },
          {
            "element": "sg-as:CurrentLoansAndBorrowings",
            "weight": 1
          },
          {
            "element": "sg-as:CurrentFinancialLiabilitiesMeasuredAtFairValueThroughProfitOrLoss",
            "weight": 1
          },
          {
            "element": "sg-as:CurrentFinanceLeaseLiabilities",
            "weight": 1
          },
          {
            "element": "sg-as:OtherCurrentFinancialLiabilities",
            "weight": 1
          },
          {
            "element": "sg-as:CurrentIncomeTaxLiabilities",
            "weight": 1
          },
          {
            "element": "sg-as:CurrentProvisions",
            "weight": 1
          },
          {
            "element": "sg-as:OtherCurrentNonfinancialLiabilities",
            "weight": 1
          },
          {
            "element": "sg-as:LiabilitiesClassifiedAsHeldForSale",
            "weight": 1
          }
        ]
      },
      {
        "role": "SFPCurrentNonCurrent",
        "parent": "sg-as:Equity",
        "children": [
          {
            "element": "sg-as:NoncontrollingInterests",
            "weight": 1
          },
          {
            "element": "sg-as:ShareCapital",
            "weight": 1
          },
          {
            "element": "sg-as:TreasuryShares",
            "weight": 1
          },
          {
            "element": "sg-as:AccumulatedProfitsLosses",
            "weight": 1
          },
          {
            "element": "sg-as:ReservesOtherThanAccumulatedProfitsLosses",
            "weight": 1
          }
        ]
      },
      {
        "role": "NoteLoansAndBorrowings",
        "parent": "sg-as:LoansAndBorrowings",
        "children": [
          {
            "element": "sg-as:BankOverdrafts",
            "weight": 1
          },
          {
            "element": "sg-as:SecuredBankBorrowings",
            "weight": 1
          },
          {
            "element": "sg-as:UnsecuredBankBorrowings",
            "weight": 1
          },
          {
            "element": "sg-as:OtherBorrowings",
            "weight": 1
          }
        ]
      },
      {
        "role": "NoteSelectedIncomeExpense",
        "parent": "sg-as:OtherIncome",
        "children": [
          {
            "element": "sg-as:InterestIncomeClassifiedAsOtherIncome",
            "weight": 1
          },
          {
            "element": "sg-as:DividendIncomeClassifiedAsOtherIncome",
            "weight": 1
          },
          {
            "element": "sg-as:OtherInvestmentIncomeClassifiedAsOtherIncome",
            "weight": 1
          },
          {
            "element": "sg-as:GovernmentGrantsClassifiedAsOtherIncome",
            "weight": 1
          },
          {
            "element": "sg-as:MiscellaneousIncomeClassifiedAsOtherIncome",
            "weight": 1
          }
        ]
      },
      {
        "role": "NoteSelectedIncomeExpense",
        "parent": "sg-as:NetIncomeAsCalculatedForSelectedIncomeExpenses",
        "children": [
          {
            "element": "sg-as:OtherIncome",
            "weight": 1
          },
          {
            "element": "sg-as:IncreaseDecreaseInInventoriesOfFinishedGoodsAndWorkInProgress",
            "weight": -1
          },
          {
            "element": "sg-as:RawMaterialsAndConsumablesUsed",
            "weight": -1
          },
          {
            "element": "sg-as:SubcontractorCost",
            "weight": -1
          },
          {
            "element": "sg-as:DividendDeclaredDuringTheYear",
            "weight": -1
          },
          {
            "element": "sg-as:NetGainsLossesOnForeignExchangeAdjustment",
            "weight": 1
          },
          {
            "element": "sg-as:NetGainsLossesOnDisposalOfPropertyPlantAndEquipment",
            "weight": 1
          },
          {
            "element": "sg-as:NetGainsLossesOnDisposalOfIntangibleAssets",
            "weight": 1
          },
          {
            "element": "sg-as:ImpairmentLossReversalOfImpairmentLossOnInvestments",
            "weight": -1
          },
          {
            "element": "sg-as:ImpairmentLossReversalOfImpairmentLossOnReceivables",
            "weight": -1
          },
          {
            "element": "sg-as:ImpairmentLossReversalOfImpairmentLossOnOthers",
            "weight": -1
          }
        ]
      },
      {
        "role": "AdditionalCalculations",
        "parent": "sg-as:ProfitLoss",
        "children": [
          {
            "element": "sg-as:ProfitLossAttributableToOwnersOfCompany",
            "weight": 1
          },
          {
            "element": "sg-as:ProfitLossAttributableToNoncontrollingInterests",
            "weight": 1
          }
        ]
      },
      {
        "role": "AdditionalCalculations",
        "parent": "sg-as:IntangibleAssetsOtherThanGoodwill",
        "children": [
          {
            "element": "sg-as:IntangibleAssetsOtherThanGoodwillAtCost",
            "weight": 1
          },
          {
            "element": "sg-as:IntangibleAssetsOtherThanGoodwillAtValuation",
            "weight": 1
          }
        ]
      },
      {
        "role": "AdditionalCalculations",
        "parent": "sg-as:PropertyPlantAndEquipment",
        "children": [
          {
            "element": "sg-as:PropertyPlantAndEquipmentAtCost",
            "weight": 1
          },
          {
            "element": "sg-as:PropertyPlantAndEquipmentAtValuation",
            "weight": 1
          }
        ]
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "parent": "sg-as:PropertyPlantAndEquipment",
        "children": [
          {
            "element": "sg-as:GrossCarryingAmountOfPropertyPlantAndEquipment",
            "weight": 1
          },
          {
            "element": "sg-as:AccumulatedDepreciationAmortisationAndImpairmentOnPropertyPlantAndEquipment",
            "weight": -1
          }
        ]
      },
      {
        "role": "NoteIntangibleAssets",
        "parent": "sg-as:IntangibleAssetsOtherThanGoodwill",
        "children": [
          {
            "element": "sg-as:GrossCarryingAmountOfIntangibleAssets",
            "weight": 1
          },
          {
            "element": "sg-as:AmortisationAndImpairmentOnIntangibleAssetsOtherThanGoodwillGross",
            "weight": -1
          }
        ]
      },
      {
        "role": "NoteTradeAndOtherReceivables",
        "parent": "sg-as:TradeAndOtherReceivables",
        "children": [
          {
            "element": "sg-as:TradeAndOtherReceivablesDueFromThirdParties",
            "weight": 1
          },
          {
            "element": "sg-as:TradeAndOtherReceivablesDueFromRelatedParties",
            "weight": 1
          },
          {
            "element": "sg-as:UnbilledReceivables",
            "weight": 1
          },
          {
            "element": "sg-as:OtherReceivables",
            "weight": 1
          }
        ]
      },
      {
        "role": "NoteTradeAndOtherPayables",
        "parent": "sg-as:TradeAndOtherPayables",
        "children": [
          {
            "element": "sg-as:TradeAndOtherPayablesDueToThirdParties",
            "weight": 1
          },
          {
            "element": "sg-as:TradeAndOtherPayablesDueToRelatedParties",
            "weight": 1
          },
          {
            "element": "sg-as:DeferredIncome",
            "weight": 1
          },
          {
            "element": "sg-as:OtherPayables",
            "weight": 1
          }
        ]
      },
      {
        "role": "SFPOrderOfLiquidity",
        "parent": "sg-as:Equity",
        "children": [
          {
            "element": "sg-as:ShareCapital",
            "weight": 1
          },
          {
            "element": "sg-as:TreasuryShares",
            "weight": 1
          },
          {
            "element": "sg-as:AccumulatedProfitsLosses",
            "weight": 1
          },
          {
            "element": "sg-as:ReservesOtherThanAccumulatedProfitsLosses",
            "weight": 1
          },
          {
            "element": "sg-as:NoncontrollingInterests",
            "weight": 1
          }
        ]
      }
    ],
    "dimensions": [
      {
        "role": "NotePropertyPlantAndEquipment",
        "arcrole": "all",
        "from": "sg-as:DisclosureOfDetailedInformationAboutPropertyPlantAndEquipmentAbstract",
        "to": "sg-as:DisclosureOfDetailedInformationAboutPropertyPlantAndEquipmentTable",
        "order": 1
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "arcrole": "hypercube-dimension",
        "from": "sg-as:DisclosureOfDetailedInformationAboutPropertyPlantAndEquipmentTable",
        "to": "sg-as:ClassesOfPropertyPlantAndEquipmentAxis",
        "order": 1
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "arcrole": "dimension-domain",
        "from": "sg-as:ClassesOfPropertyPlantAndEquipmentAxis",
        "to": "sg-as:PropertyPlantAndEquipmentMember",
        "order": 1
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "arcrole": "domain-member",
        "from": "sg-as:PropertyPlantAndEquipmentMember",
        "to": "sg-as:LandAndBuildingMember",
        "order": 1
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "arcrole": "domain-member",
        "from": "sg-as:PropertyPlantAndEquipmentMember",
        "to": "sg-as:MotorAndOtherVehiclesMember",
        "order": 2
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "arcrole": "domain-member",
        "from": "sg-as:PropertyPlantAndEquipmentMember",
        "to": "sg-as:MachineryAndOtherEquipmentMember",
        "order": 3
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "arcrole": "domain-member",
        "from": "sg-as:PropertyPlantAndEquipmentMember",
        "to": "sg-as:ComputerOfficeEquipmentAndFurnitureFixturesAndFittingsMember",
        "order": 4
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "arcrole": "domain-member",
        "from": "sg-as:PropertyPlantAndEquipmentMember",
        "to": "sg-as:CommunicationAndNetworkEquipmentMember",
        "order": 5
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "arcrole": "domain-member",
        "from": "sg-as:PropertyPlantAndEquipmentMember",
        "to": "sg-as:LeaseholdImprovementsMember",
        "order": 6
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "arcrole": "domain-member",
        "from": "sg-as:PropertyPlantAndEquipmentMember",
        "to": "sg-as:ConstructionInProgressMember",
        "order": 7
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "arcrole": "domain-member",
        "from": "sg-as:PropertyPlantAndEquipmentMember",
        "to": "sg-as:OtherPropertyPlantAndEquipmentMember",
        "order": 8
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "arcrole": "hypercube-dimension",
        "from": "sg-as:DisclosureOfDetailedInformationAboutPropertyPlantAndEquipmentTable",
        "to": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
        "order": 2
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfDetailedInformationAboutPropertyPlantAndEquipmentAbstract",
        "to": "sg-as:DisclosureOfDetailedInformationAboutPropertyPlantAndEquipmentLineItems",
        "order": 2
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfDetailedInformationAboutPropertyPlantAndEquipmentLineItems",
        "to": "sg-as:GrossCarryingAmountOfPropertyPlantAndEquipmentAbstract",
        "order": 1
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "arcrole": "domain-member",
        "from": "sg-as:GrossCarryingAmountOfPropertyPlantAndEquipmentAbstract",
        "to": "sg-as:GrossCarryingAmountOfPropertyPlantAndEquipment",
        "order": 1
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "arcrole": "domain-member",
        "from": "sg-as:GrossCarryingAmountOfPropertyPlantAndEquipmentAbstract",
        "to": "sg-as:GrossCarryingAmountOfPropertyPlantAndEquipment",
        "order": 6
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "arcrole": "domain-member",
        "from": "sg-as:GrossCarryingAmountOfPropertyPlantAndEquipmentAbstract",
        "to": "sg-as:IncreaseDecreaseThroughNetExchangeDifferencesPropertyPlantAndEquipment",
        "order": 2
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "arcrole": "domain-member",
        "from": "sg-as:GrossCarryingAmountOfPropertyPlantAndEquipmentAbstract",
        "to": "sg-as:AdditionsOtherThanThroughBusinessCombinationsPropertyPlantAndEquipment",
        "order": 3
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "arcrole": "domain-member",
        "from": "sg-as:GrossCarryingAmountOfPropertyPlantAndEquipmentAbstract",
        "to": "sg-as:DecreaseThroughLossOfControlOfSubsidiaryPropertyPlantAndEquipment",
        "order": 4
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "arcrole": "domain-member",
        "from": "sg-as:GrossCarryingAmountOfPropertyPlantAndEquipmentAbstract",
        "to": "sg-as:IncreaseDecreaseThroughOtherChangesPropertyPlantAndEquipment",
        "order": 5
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfDetailedInformationAboutPropertyPlantAndEquipmentLineItems",
        "to": "sg-as:AccumulatedDepreciationAmortisationAndImpairmentOnPropertyPlantAndEquipmentAbstract",
        "order": 2
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "arcrole": "domain-member",
        "from": "sg-as:AccumulatedDepreciationAmortisationAndImpairmentOnPropertyPlantAndEquipmentAbstract",
        "to": "sg-as:AccumulatedDepreciationAmortisationAndImpairmentOnPropertyPlantAndEquipment",
        "order": 1
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "arcrole": "domain-member",
        "from": "sg-as:AccumulatedDepreciationAmortisationAndImpairmentOnPropertyPlantAndEquipmentAbstract",
        "to": "sg-as:AccumulatedDepreciationAmortisationAndImpairmentOnPropertyPlantAndEquipment",
        "order": 8
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "arcrole": "domain-member",
        "from": "sg-as:AccumulatedDepreciationAmortisationAndImpairmentOnPropertyPlantAndEquipmentAbstract",
        "to": "sg-as:AccumulatedDepreciationAmortisationAndImpairmentOnIncreaseDecreaseThroughNetExchangeDifferencesOnPropertyPlantAndEquipment",
        "order": 2
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "arcrole": "domain-member",
        "from": "sg-as:AccumulatedDepreciationAmortisationAndImpairmentOnPropertyPlantAndEquipmentAbstract",
        "to": "sg-as:DepreciationPropertyPlantAndEquipment",
        "order": 3
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "arcrole": "domain-member",
        "from": "sg-as:AccumulatedDepreciationAmortisationAndImpairmentOnPropertyPlantAndEquipmentAbstract",
        "to": "sg-as:ImpairmentLossPropertyPlantAndEquipment",
        "order": 4
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "arcrole": "domain-member",
        "from": "sg-as:AccumulatedDepreciationAmortisationAndImpairmentOnPropertyPlantAndEquipmentAbstract",
        "to": "sg-as:ReversalOfImpairmentLossPropertyPlantAndEquipment",
        "order": 5
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "arcrole": "domain-member",
        "from": "sg-as:AccumulatedDepreciationAmortisationAndImpairmentOnPropertyPlantAndEquipmentAbstract",
        "to": "sg-as:AccumulatedDepreciationAmortisationAndImpairmentOnDecreaseThroughLossOfControlOfSubsidiaryOnPropertyPlantAndEquipment",
        "order": 6
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "arcrole": "domain-member",
        "from": "sg-as:AccumulatedDepreciationAmortisationAndImpairmentOnPropertyPlantAndEquipmentAbstract",
        "to": "sg-as:AccumulatedDepreciationAmortisationAndImpairmentOnIncreaseDecreaseThroughOtherChangesPropertyPlantAndEquipment",
        "order": 7
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfDetailedInformationAboutPropertyPlantAndEquipmentLineItems",
        "to": "sg-as:CarryingAmountOfPropertyPlantAndEquipmentAbstract",
        "order": 3
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "arcrole": "domain-member",
        "from": "sg-as:CarryingAmountOfPropertyPlantAndEquipmentAbstract",
        "to": "sg-as:PropertyPlantAndEquipment",
        "order": 1
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "arcrole": "domain-member",
        "from": "sg-as:CarryingAmountOfPropertyPlantAndEquipmentAbstract",
        "to": "sg-as:PropertyPlantAndEquipment",
        "order": 2
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfDetailedInformationAboutPropertyPlantAndEquipmentLineItems",
        "to": "sg-as:AnalysisOfPropertyPlantAndEquipmenByMeasurementBasistAbstract",
        "order": 4
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "arcrole": "domain-member",
        "from": "sg-as:AnalysisOfPropertyPlantAndEquipmenByMeasurementBasistAbstract",
        "to": "sg-as:PropertyPlantAndEquipmentAtCost",
        "order": 1
      },
      {
        "role": "NotePropertyPlantAndEquipment",
        "arcrole": "domain-member",
        "from": "sg-as:AnalysisOfPropertyPlantAndEquipmenByMeasurementBasistAbstract",
        "to": "sg-as:PropertyPlantAndEquipmentAtValuation",
        "order": 2
      },
      {
        "role": "NoteIntangibleAssets",
        "arcrole": "all",
        "from": "sg-as:DisclosureOfIntangibleAssetsAbstract",
        "to": "sg-as:DisclosureOfDetailedInformationAboutIntangibleAssetsTable",
        "order": 1
      },
      {
        "role": "NoteIntangibleAssets",
        "arcrole": "hypercube-dimension",
        "from": "sg-as:DisclosureOfDetailedInformationAboutIntangibleAssetsTable",
        "to": "sg-as:ClassesOfIntangibleAssetsAxis",
        "order": 1
      },
      {
        "role": "NoteIntangibleAssets",
        "arcrole": "dimension-domain",
        "from": "sg-as:ClassesOfIntangibleAssetsAxis",
        "to": "sg-as:IntangibleAssetsMember",
        "order": 1
      },
      {
        "role": "NoteIntangibleAssets",
        "arcrole": "domain-member",
        "from": "sg-as:IntangibleAssetsMember",
        "to": "sg-as:BrandNameMastheadsAndPublishingTitlesMember",
        "order": 1
      },
      {
        "role": "NoteIntangibleAssets",
        "arcrole": "domain-member",
        "from": "sg-as:IntangibleAssetsMember",
        "to": "sg-as:ComputerSoftwareMember",
        "order": 2
      },
      {
        "role": "NoteIntangibleAssets",
        "arcrole": "domain-member",
        "from": "sg-as:IntangibleAssetsMember",
        "to": "sg-as:LicencesAndFranchisesMember",
        "order": 3
      },
      {
        "role": "NoteIntangibleAssets",
        "arcrole": "domain-member",
        "from": "sg-as:IntangibleAssetsMember",
        "to": "sg-as:IntangibleAssetsUnderDevelopmentMember",
        "order": 5
      },
      {
        "role": "NoteIntangibleAssets",
        "arcrole": "domain-member",
        "from": "sg-as:IntangibleAssetsMember",
        "to": "sg-as:OtherIntangibleAssetsMember",
        "order": 6
      },
      {
        "role": "NoteIntangibleAssets",
        "arcrole": "domain-member",
        "from": "sg-as:IntangibleAssetsMember",
        "to": "sg-as:CopyrightsPatentsAndIndustrialPropertyRightsServiceAndOperatingRightsRecipesFormulaeModelsDesignsPrototypesCapitalDevelopmentExpenditureMember",
        "order": 4
      },
      {
        "role": "NoteIntangibleAssets",
        "arcrole": "hypercube-dimension",
        "from": "sg-as:DisclosureOfDetailedInformationAboutIntangibleAssetsTable",
        "to": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
        "order": 2
      },
      {
        "role": "NoteIntangibleAssets",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfIntangibleAssetsAbstract",
        "to": "sg-as:DisclosureOfDetailedInformationAboutIntangibleAssetsLineItems",
        "order": 2
      },
      {
        "role": "NoteIntangibleAssets",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfDetailedInformationAboutIntangibleAssetsLineItems",
        "to": "sg-as:IntangibleAssetsOtherThanGoodwillGrossAbstract",
        "order": 1
      },
      {
        "role": "NoteIntangibleAssets",
        "arcrole": "domain-member",
        "from": "sg-as:IntangibleAssetsOtherThanGoodwillGrossAbstract",
        "to": "sg-as:GrossCarryingAmountOfIntangibleAssets",
        "order": 1
      },
      {
        "role": "NoteIntangibleAssets",
        "arcrole": "domain-member",
        "from": "sg-as:IntangibleAssetsOtherThanGoodwillGrossAbstract",
        "to": "sg-as:GrossCarryingAmountOfIntangibleAssets",
        "order": 6
      },
      {
        "role": "NoteIntangibleAssets",
        "arcrole": "domain-member",
        "from": "sg-as:IntangibleAssetsOtherThanGoodwillGrossAbstract",
        "to": "sg-as:IncreaseDecreaseThroughNetExchangeDifferencesIntangibleAssetsOtherThanGoodwill",
        "order": 2
      },
      {
        "role": "NoteIntangibleAssets",
        "arcrole": "domain-member",
        "from": "sg-as:IntangibleAssetsOtherThanGoodwillGrossAbstract",
        "to": "sg-as:AcquisitionsThroughBusinessCombinationsIntangibleAssetsOtherThanGoodwill",
        "order": 3
      },
      {
        "role": "NoteIntangibleAssets",
        "arcrole": "domain-member",
        "from": "sg-as:IntangibleAssetsOtherThanGoodwillGrossAbstract",
        "to": "sg-as:DecreaseThroughLossOfControlOfSubsidiaryIntangibleAssetsOtherThanGoodwill",
        "order": 4
      },
      {
        "role": "NoteIntangibleAssets",
        "arcrole": "domain-member",
        "from": "sg-as:IntangibleAssetsOtherThanGoodwillGrossAbstract",
        "to": "sg-as:IncreaseDecreaseThroughOtherChangesIntangibleAssetsOtherThanGoodwill",
        "order": 5
      },
      {
        "role": "NoteIntangibleAssets",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfDetailedInformationAboutIntangibleAssetsLineItems",
        "to": "sg-as:AmortisationAndImpairmentOnIntangibleAssetsOtherThanGoodwillAbstract",
        "order": 2
      },
      {
        "role": "NoteIntangibleAssets",
        "arcrole": "domain-member",
        "from": "sg-as:AmortisationAndImpairmentOnIntangibleAssetsOtherThanGoodwillAbstract",
        "to": "sg-as:AmortisationAndImpairmentOnIntangibleAssetsOtherThanGoodwillGross",
        "order": 1
      },
      {
        "role": "NoteIntangibleAssets",
        "arcrole": "domain-member",
        "from": "sg-as:AmortisationAndImpairmentOnIntangibleAssetsOtherThanGoodwillAbstract",
        "to": "sg-as:AmortisationAndImpairmentOnIntangibleAssetsOtherThanGoodwillGross",
        "order": 8
      },
      {
        "role": "NoteIntangibleAssets",
        "arcrole": "domain-member",
        "from": "sg-as:AmortisationAndImpairmentOnIntangibleAssetsOtherThanGoodwillAbstract",
        "to": "sg-as:AmortisationOfIncreaseDecreaseThroughNetExchangeDifferencesOnIntangibleAssetsOtherThanGoodwill",
        "order": 2
      },
      {
        "role": "NoteIntangibleAssets",
        "arcrole": "domain-member",
        "from": "sg-as:AmortisationAndImpairmentOnIntangibleAssetsOtherThanGoodwillAbstract",
        "to": "sg-as:AmortisationIntangibleAssetsOtherThanGoodwill",
        "order": 3
      },
      {
        "role": "NoteIntangibleAssets",
        "arcrole": "domain-member",
        "from": "sg-as:AmortisationAndImpairmentOnIntangibleAssetsOtherThanGoodwillAbstract",
        "to": "sg-as:ImpairmentLossRecognisedInProfitOrLossIntangibleAssetsOtherThanGoodwill",
        "order": 4
      },
      {
        "role": "NoteIntangibleAssets",
        "arcrole": "domain-member",
        "from": "sg-as:AmortisationAndImpairmentOnIntangibleAssetsOtherThanGoodwillAbstract",
        "to": "sg-as:ReversalOfImpairmentLossRecognisedInProfitOrLossIntangibleAssetsOtherThanGoodwill",
        "order": 5
      },
      {
        "role": "NoteIntangibleAssets",
        "arcrole": "domain-member",
        "from": "sg-as:AmortisationAndImpairmentOnIntangibleAssetsOtherThanGoodwillAbstract",
        "to": "sg-as:AmortisationOfDecreaseThroughLossOfControlOfSubsidiaryOnIntangibleAssetsOtherThanGoodwill",
        "order": 6
      },
      {
        "role": "NoteIntangibleAssets",
        "arcrole": "domain-member",
        "from": "sg-as:AmortisationAndImpairmentOnIntangibleAssetsOtherThanGoodwillAbstract",
        "to": "sg-as:AmortisationOfIncreaseDecreaseThroughOtherChangesOnIntangibleAssetsOtherThanGoodwill",
        "order": 7
      },
      {
        "role": "NoteIntangibleAssets",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfDetailedInformationAboutIntangibleAssetsLineItems",
        "to": "sg-as:IntangibleAssetsOtherThanGoodwillNetAbstract",
        "order": 3
      },
      {
        "role": "NoteIntangibleAssets",
        "arcrole": "domain-member",
        "from": "sg-as:IntangibleAssetsOtherThanGoodwillNetAbstract",
        "to": "sg-as:IntangibleAssetsOtherThanGoodwill",
        "order": 1
      },
      {
        "role": "NoteIntangibleAssets",
        "arcrole": "domain-member",
        "from": "sg-as:IntangibleAssetsOtherThanGoodwillNetAbstract",
        "to": "sg-as:IntangibleAssetsOtherThanGoodwill",
        "order": 2
      },
      {
        "role": "NoteIntangibleAssets",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfDetailedInformationAboutIntangibleAssetsLineItems",
        "to": "sg-as:AnalysisOfIntangibleAssetsOtherThanGoodwillByMeasurementBasisAbstract",
        "order": 4
      },
      {
        "role": "NoteIntangibleAssets",
        "arcrole": "domain-member",
        "from": "sg-as:AnalysisOfIntangibleAssetsOtherThanGoodwillByMeasurementBasisAbstract",
        "to": "sg-as:IntangibleAssetsOtherThanGoodwillAtCost",
        "order": 1
      },
      {
        "role": "NoteIntangibleAssets",
        "arcrole": "domain-member",
        "from": "sg-as:AnalysisOfIntangibleAssetsOtherThanGoodwillByMeasurementBasisAbstract",
        "to": "sg-as:IntangibleAssetsOtherThanGoodwillAtValuation",
        "order": 2
      },
      {
        "role": "NoteRelatedParty",
        "arcrole": "all",
        "from": "sg-as:RelatedPartyTransactionsAbstract",
        "to": "sg-as:RelatedPartyTransactionsTable",
        "order": 1
      },
      {
        "role": "NoteRelatedParty",
        "arcrole": "hypercube-dimension",
        "from": "sg-as:RelatedPartyTransactionsTable",
        "to": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
        "order": 2
      },
      {
        "role": "NoteRelatedParty",
        "arcrole": "domain-member",
        "from": "sg-as:RelatedPartyTransactionsAbstract",
        "to": "sg-as:DisclosureOfTransactionsBetweenRelatedPartiesLineItems",
        "order": 2
      },
      {
        "role": "NoteRelatedParty",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfTransactionsBetweenRelatedPartiesLineItems",
        "to": "sg-as:DisclosureOfRelatedPartyTransactionAbstract",
        "order": 1
      },
      {
        "role": "NoteRelatedParty",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfRelatedPartyTransactionAbstract",
        "to": "sg-as:WhetherCompanyHasOverseasInvestmentsInSubsidiariesAssociatesOrJointVentures",
        "order": 1
      },
      {
        "role": "NoteRelatedParty",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfRelatedPartyTransactionAbstract",
        "to": "sg-as:RevenueFromRelatedPartyTransactions",
        "order": 2
      },
      {
        "role": "NoteRelatedParty",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfRelatedPartyTransactionAbstract",
        "to": "sg-as:PurchasesFromRelatedPartyTransactions",
        "order": 3
      },
      {
        "role": "NoteTradeAndOtherReceivables",
        "arcrole": "all",
        "from": "sg-as:TradeAndOtherReceivablesAbstract",
        "to": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherReceivablesTable",
        "order": 1
      },
      {
        "role": "NoteTradeAndOtherReceivables",
        "arcrole": "hypercube-dimension",
        "from": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherReceivablesTable",
        "to": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
        "order": 2
      },
      {
        "role": "NoteTradeAndOtherReceivables",
        "arcrole": "domain-member",
        "from": "sg-as:TradeAndOtherReceivablesAbstract",
        "to": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherReceivablesLineItems",
        "order": 2
      },
      {
        "role": "NoteTradeAndOtherReceivables",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherReceivablesLineItems",
        "to": "sg-as:TradeAndOtherReceivablesDueFromThirdParties",
        "order": 1
      },
      {
        "role": "NoteTradeAndOtherReceivables",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherReceivablesLineItems",
        "to": "sg-as:TradeAndOtherReceivablesDueFromRelatedParties",
        "order": 2
      },
      {
        "role": "NoteTradeAndOtherReceivables",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherReceivablesLineItems",
        "to": "sg-as:UnbilledReceivables",
        "order": 3
      },
      {
        "role": "NoteTradeAndOtherReceivables",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherReceivablesLineItems",
        "to": "sg-as:OtherReceivables",
        "order": 4
      },
      {
        "role": "NoteTradeAndOtherReceivables",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherReceivablesLineItems",
        "to": "sg-as:TradeAndOtherReceivables",
        "order": 5
      },
      {
        "role": "NoteTradeAndOtherPayables",
        "arcrole": "all",
        "from": "sg-as:TradeAndOtherPayablesAbstract",
        "to": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherPayablesTable",
        "order": 1
      },
      {
        "role": "NoteTradeAndOtherPayables",
        "arcrole": "hypercube-dimension",
        "from": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherPayablesTable",
        "to": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
        "order": 2
      },
      {
        "role": "NoteTradeAndOtherPayables",
        "arcrole": "domain-member",
        "from": "sg-as:TradeAndOtherPayablesAbstract",
        "to": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherPayablesLineItems",
        "order": 2
      },
      {
        "role": "NoteTradeAndOtherPayables",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherPayablesLineItems",
        "to": "sg-as:TradeAndOtherPayablesDueToThirdParties",
        "order": 1
      },
      {
        "role": "NoteTradeAndOtherPayables",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherPayablesLineItems",
        "to": "sg-as:TradeAndOtherPayablesDueToRelatedParties",
        "order": 2
      },
      {
        "role": "NoteTradeAndOtherPayables",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherPayablesLineItems",
        "to": "sg-as:DeferredIncome",
        "order": 3
      },
      {
        "role": "NoteTradeAndOtherPayables",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherPayablesLineItems",
        "to": "sg-as:OtherPayables",
        "order": 4
      },
      {
        "role": "NoteTradeAndOtherPayables",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfDetailedInformationAboutTradeAndOtherPayablesLineItems",
        "to": "sg-as:TradeAndOtherPayables",
        "order": 5
      },
      {
        "role": "AxisDefaults",
        "arcrole": "dimension-default",
        "from": "sg-as:ClassesOfPropertyPlantAndEquipmentAxis",
        "to": "sg-as:PropertyPlantAndEquipmentMember",
        "order": 1
      },
      {
        "role": "AxisDefaults",
        "arcrole": "dimension-default",
        "from": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
        "to": "sg-as:ConsolidatedMember",
        "order": 1
      },
      {
        "role": "AxisDefaults",
        "arcrole": "dimension-default",
        "from": "sg-as:ClassesOfIntangibleAssetsAxis",
        "to": "sg-as:IntangibleAssetsMember",
        "order": 1
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "all",
        "from": "sg-as:StatementOfFinancialPositionAbstract",
        "to": "sg-as:StatementOfFinancialPositionTable",
        "order": 1
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "hypercube-dimension",
        "from": "sg-as:StatementOfFinancialPositionTable",
        "to": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
        "order": 1
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:StatementOfFinancialPositionAbstract",
        "to": "sg-as:StatementOfFinancialPositionLineItems",
        "order": 2
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:StatementOfFinancialPositionLineItems",
        "to": "sg-as:AssetsAbstract",
        "order": 1
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:AssetsAbstract",
        "to": "sg-as:CurrentAssetsAbstract",
        "order": 1
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentAssetsAbstract",
        "to": "sg-as:CashAndBankBalances",
        "order": 1
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentAssetsAbstract",
        "to": "sg-as:TradeAndOtherReceivablesCurrent",
        "order": 2
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentAssetsAbstract",
        "to": "sg-as:CurrentFinanceLeaseReceivables",
        "order": 3
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentAssetsAbstract",
        "to": "sg-as:CurrentDerivativeFinancialAssets",
        "order": 4
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentAssetsAbstract",
        "to": "sg-as:CurrentFinancialAssetsMeasuredAtFairValueThroughProfitOrLoss",
        "order": 5
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentAssetsAbstract",
        "to": "sg-as:OtherCurrentFinancialAssets",
        "order": 6
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentAssetsAbstract",
        "to": "sg-as:DevelopmentProperties",
        "order": 7
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentAssetsAbstract",
        "to": "sg-as:Inventories",
        "order": 8
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentAssetsAbstract",
        "to": "sg-as:OtherCurrentNonfinancialAssets",
        "order": 9
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentAssetsAbstract",
        "to": "sg-as:NoncurrentAssetsOrDisposalGroupsClassifiedAsHeldForSaleOrAsHeldForDistributionToOwners",
        "order": 10
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentAssetsAbstract",
        "to": "sg-as:CurrentAssets",
        "order": 11
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:AssetsAbstract",
        "to": "sg-as:NoncurrentAssetsAbstract",
        "order": 2
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentAssetsAbstract",
        "to": "sg-as:TradeAndOtherReceivablesNoncurrent",
        "order": 1
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentAssetsAbstract",
        "to": "sg-as:NoncurrentFinanceLeaseReceivables",
        "order": 2
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentAssetsAbstract",
        "to": "sg-as:NoncurrentDerivativeFinancialAssets",
        "order": 3
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentAssetsAbstract",
        "to": "sg-as:NoncurrentFinancialAssetsMeasuredAtFairValueThroughProfitOrLoss",
        "order": 4
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentAssetsAbstract",
        "to": "sg-as:OtherNoncurrentFinancialAssets",
        "order": 5
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentAssetsAbstract",
        "to": "sg-as:PropertyPlantAndEquipment",
        "order": 6
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentAssetsAbstract",
        "to": "sg-as:InvestmentProperties",
        "order": 7
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentAssetsAbstract",
        "to": "sg-as:Goodwill",
        "order": 8
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentAssetsAbstract",
        "to": "sg-as:IntangibleAssetsOtherThanGoodwill",
        "order": 9
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentAssetsAbstract",
        "to": "sg-as:InvestmentsInSubsidiariesAssociatesOrJointVentures",
        "order": 10
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentAssetsAbstract",
        "to": "sg-as:DeferredTaxAssets",
        "order": 11
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentAssetsAbstract",
        "to": "sg-as:OtherNoncurrentNonfinancialAssets",
        "order": 12
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentAssetsAbstract",
        "to": "sg-as:NoncurrentAssets",
        "order": 13
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:AssetsAbstract",
        "to": "sg-as:Assets",
        "order": 3
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:StatementOfFinancialPositionLineItems",
        "to": "sg-as:LiabilitiesAbstract",
        "order": 3
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:LiabilitiesAbstract",
        "to": "sg-as:CurrentLiabilitiesAbstract",
        "order": 1
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentLiabilitiesAbstract",
        "to": "sg-as:TradeAndOtherPayablesCurrent",
        "order": 1
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentLiabilitiesAbstract",
        "to": "sg-as:CurrentLoansAndBorrowings",
        "order": 2
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentLiabilitiesAbstract",
        "to": "sg-as:CurrentFinancialLiabilitiesMeasuredAtFairValueThroughProfitOrLoss",
        "order": 3
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentLiabilitiesAbstract",
        "to": "sg-as:CurrentFinanceLeaseLiabilities",
        "order": 4
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentLiabilitiesAbstract",
        "to": "sg-as:OtherCurrentFinancialLiabilities",
        "order": 5
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentLiabilitiesAbstract",
        "to": "sg-as:CurrentIncomeTaxLiabilities",
        "order": 6
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentLiabilitiesAbstract",
        "to": "sg-as:CurrentProvisions",
        "order": 7
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentLiabilitiesAbstract",
        "to": "sg-as:OtherCurrentNonfinancialLiabilities",
        "order": 8
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentLiabilitiesAbstract",
        "to": "sg-as:LiabilitiesClassifiedAsHeldForSale",
        "order": 9
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:CurrentLiabilitiesAbstract",
        "to": "sg-as:CurrentLiabilities",
        "order": 10
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:LiabilitiesAbstract",
        "to": "sg-as:NoncurrentLiabilitiesAbstract",
        "order": 2
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentLiabilitiesAbstract",
        "to": "sg-as:TradeAndOtherPayablesNoncurrent",
        "order": 1
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentLiabilitiesAbstract",
        "to": "sg-as:NoncurrentLoansAndBorrowings",
        "order": 2
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentLiabilitiesAbstract",
        "to": "sg-as:NoncurrentFinancialLiabilitiesMeasuredAtFairValueThroughProfitOrLoss",
        "order": 3
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentLiabilitiesAbstract",
        "to": "sg-as:NoncurrentFinanceLeaseLiabilities",
        "order": 4
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentLiabilitiesAbstract",
        "to": "sg-as:OtherNoncurrentFinancialLiabilities",
        "order": 5
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentLiabilitiesAbstract",
        "to": "sg-as:DeferredTaxLiabilities",
        "order": 6
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentLiabilitiesAbstract",
        "to": "sg-as:NoncurrentProvisions",
        "order": 7
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentLiabilitiesAbstract",
        "to": "sg-as:OtherNoncurrentNonfinancialLiabilities",
        "order": 8
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:NoncurrentLiabilitiesAbstract",
        "to": "sg-as:NoncurrentLiabilities",
        "order": 9
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:LiabilitiesAbstract",
        "to": "sg-as:Liabilities",
        "order": 3
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:StatementOfFinancialPositionLineItems",
        "to": "sg-as:EquityAbstract",
        "order": 4
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:EquityAbstract",
        "to": "sg-as:ShareCapital",
        "order": 1
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:EquityAbstract",
        "to": "sg-as:TreasuryShares",
        "order": 2
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:EquityAbstract",
        "to": "sg-as:AccumulatedProfitsLosses",
        "order": 3
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:EquityAbstract",
        "to": "sg-as:ReservesOtherThanAccumulatedProfitsLosses",
        "order": 4
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:EquityAbstract",
        "to": "sg-as:NoncontrollingInterests",
        "order": 5
      },
      {
        "role": "SFPCurrentNonCurrent",
        "arcrole": "domain-member",
        "from": "sg-as:EquityAbstract",
        "to": "sg-as:Equity",
        "order": 6
      },
      {
        "role": "ISNature",
        "arcrole": "all",
        "from": "sg-as:StatementOfProfitOrLossAbstract",
        "to": "sg-as:StatementOfProfitOrLossTable",
        "order": 1
      },
      {
        "role": "ISNature",
        "arcrole": "hypercube-dimension",
        "from": "sg-as:StatementOfProfitOrLossTable",
        "to": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
        "order": 1
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:StatementOfProfitOrLossAbstract",
        "to": "sg-as:StatementOfProfitOrLossLineItems",
        "order": 2
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:StatementOfProfitOrLossLineItems",
        "to": "sg-as:ProfitLossAbstract",
        "order": 1
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:ProfitLossAbstract",
        "to": "sg-as:Revenue",
        "order": 1
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:ProfitLossAbstract",
        "to": "sg-as:OtherIncome",
        "order": 2
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:ProfitLossAbstract",
        "to": "sg-as:EmployeeBenefitsExpense",
        "order": 3
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:ProfitLossAbstract",
        "to": "sg-as:DepreciationExpense",
        "order": 4
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:ProfitLossAbstract",
        "to": "sg-as:AmortisationExpense",
        "order": 5
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:ProfitLossAbstract",
        "to": "sg-as:RepairsAndMaintenanceExpense",
        "order": 6
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:ProfitLossAbstract",
        "to": "sg-as:SalesAndMarketingExpense",
        "order": 7
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:ProfitLossAbstract",
        "to": "sg-as:OtherExpensesByNature",
        "order": 8
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:ProfitLossAbstract",
        "to": "sg-as:OtherGainsLosses",
        "order": 9
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:ProfitLossAbstract",
        "to": "sg-as:FinanceCosts",
        "order": 10
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:ProfitLossAbstract",
        "to": "sg-as:ShareOfProfitLossOfAssociatesAndJointVenturesAccountedForUsingEquityMethod",
        "order": 11
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:ProfitLossAbstract",
        "to": "sg-as:ProfitLossBeforeTaxation",
        "order": 12
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:ProfitLossAbstract",
        "to": "sg-as:TaxExpenseBenefitContinuingOperations",
        "order": 13
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:ProfitLossAbstract",
        "to": "sg-as:ProfitLossFromDiscontinuedOperations",
        "order": 14
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:ProfitLossAbstract",
        "to": "sg-as:ProfitLoss",
        "order": 15
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:StatementOfProfitOrLossLineItems",
        "to": "sg-as:ProfitLossAttributableToAbstract",
        "order": 2
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:ProfitLossAttributableToAbstract",
        "to": "sg-as:ProfitLossAttributableToOwnersOfCompany",
        "order": 1
      },
      {
        "role": "ISNature",
        "arcrole": "domain-member",
        "from": "sg-as:ProfitLossAttributableToAbstract",
        "to": "sg-as:ProfitLossAttributableToNoncontrollingInterests",
        "order": 2
      },
      {
        "role": "SCF",
        "arcrole": "all",
        "from": "sg-as:StatementOfCashFlowsAbstract",
        "to": "sg-as:StatementOfCashFlowsTable",
        "order": 1
      },
      {
        "role": "SCF",
        "arcrole": "hypercube-dimension",
        "from": "sg-as:StatementOfCashFlowsTable",
        "to": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
        "order": 1
      },
      {
        "role": "SCF",
        "arcrole": "domain-member",
        "from": "sg-as:StatementOfCashFlowsAbstract",
        "to": "sg-as:StatementOfCashFlowsLineItems",
        "order": 2
      },
      {
        "role": "SCF",
        "arcrole": "domain-member",
        "from": "sg-as:StatementOfCashFlowsLineItems",
        "to": "sg-as:NetCashFlowsAbstract",
        "order": 1
      },
      {
        "role": "SCF",
        "arcrole": "domain-member",
        "from": "sg-as:NetCashFlowsAbstract",
        "to": "sg-as:CashFlowsFromUsedInOperatingActivities",
        "order": 1
      },
      {
        "role": "SCF",
        "arcrole": "domain-member",
        "from": "sg-as:NetCashFlowsAbstract",
        "to": "sg-as:CashFlowsFromUsedInInvestingActivities",
        "order": 2
      },
      {
        "role": "SCF",
        "arcrole": "domain-member",
        "from": "sg-as:NetCashFlowsAbstract",
        "to": "sg-as:CashFlowsFromUsedInFinancingActivities",
        "order": 3
      },
      {
        "role": "NoteLoansAndBorrowings",
        "arcrole": "all",
        "from": "sg-as:DisclosureOfLoansAndBorrowingsAbstract",
        "to": "sg-as:DisclosureOfLoansAndBorrowingsTable",
        "order": 1
      },
      {
        "role": "NoteLoansAndBorrowings",
        "arcrole": "hypercube-dimension",
        "from": "sg-as:DisclosureOfLoansAndBorrowingsTable",
        "to": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
        "order": 1
      },
      {
        "role": "NoteLoansAndBorrowings",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfLoansAndBorrowingsAbstract",
        "to": "sg-as:DisclosureOfLoansAndBorrowingsLineItems",
        "order": 2
      },
      {
        "role": "NoteLoansAndBorrowings",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfLoansAndBorrowingsLineItems",
        "to": "sg-as:LoansAndBorrowingsAbstract",
        "order": 1
      },
      {
        "role": "NoteLoansAndBorrowings",
        "arcrole": "domain-member",
        "from": "sg-as:LoansAndBorrowingsAbstract",
        "to": "sg-as:BankOverdrafts",
        "order": 1
      },
      {
        "role": "NoteLoansAndBorrowings",
        "arcrole": "domain-member",
        "from": "sg-as:LoansAndBorrowingsAbstract",
        "to": "sg-as:SecuredBankBorrowings",
        "order": 2
      },
      {
        "role": "NoteLoansAndBorrowings",
        "arcrole": "domain-member",
        "from": "sg-as:LoansAndBorrowingsAbstract",
        "to": "sg-as:UnsecuredBankBorrowings",
        "order": 3
      },
      {
        "role": "NoteLoansAndBorrowings",
        "arcrole": "domain-member",
        "from": "sg-as:LoansAndBorrowingsAbstract",
        "to": "sg-as:OtherBorrowings",
        "order": 4
      },
      {
        "role": "NoteLoansAndBorrowings",
        "arcrole": "domain-member",
        "from": "sg-as:LoansAndBorrowingsAbstract",
        "to": "sg-as:LoansAndBorrowings",
        "order": 5
      },
      {
        "role": "NoteSelectedIncomeExpense",
        "arcrole": "all",
        "from": "sg-as:DisclosureOfSelectedIncomeExpensesAbstract",
        "to": "sg-as:DisclosureOfSelectedIncomeExpensesTable",
        "order": 1
      },
      {
        "role": "NoteSelectedIncomeExpense",
        "arcrole": "hypercube-dimension",
        "from": "sg-as:DisclosureOfSelectedIncomeExpensesTable",
        "to": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
        "order": 1
      },
      {
        "role": "NoteSelectedIncomeExpense",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfSelectedIncomeExpensesAbstract",
        "to": "sg-as:DisclosureOfSelectedIncomeExpensesLineItems",
        "order": 2
      },
      {
        "role": "NoteSelectedIncomeExpense",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfSelectedIncomeExpensesLineItems",
        "to": "sg-as:DisclosureOfOtherIncomeAbstract",
        "order": 2
      },
      {
        "role": "NoteSelectedIncomeExpense",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfOtherIncomeAbstract",
        "to": "sg-as:InterestIncomeClassifiedAsOtherIncome",
        "order": 1
      },
      {
        "role": "NoteSelectedIncomeExpense",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfOtherIncomeAbstract",
        "to": "sg-as:DividendIncomeClassifiedAsOtherIncome",
        "order": 2
      },
      {
        "role": "NoteSelectedIncomeExpense",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfOtherIncomeAbstract",
        "to": "sg-as:OtherInvestmentIncomeClassifiedAsOtherIncome",
        "order": 3
      },
      {
        "role": "NoteSelectedIncomeExpense",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfOtherIncomeAbstract",
        "to": "sg-as:GovernmentGrantsClassifiedAsOtherIncome",
        "order": 4
      },
      {
        "role": "NoteSelectedIncomeExpense",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfOtherIncomeAbstract",
        "to": "sg-as:MiscellaneousIncomeClassifiedAsOtherIncome",
        "order": 5
      },
      {
        "role": "NoteSelectedIncomeExpense",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfOtherIncomeAbstract",
        "to": "sg-as:OtherIncome",
        "order": 6
      },
      {
        "role": "NoteSelectedIncomeExpense",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfSelectedIncomeExpensesLineItems",
        "to": "sg-as:MaterialExpensesAbstract",
        "order": 3
      },
      {
        "role": "NoteSelectedIncomeExpense",
        "arcrole": "domain-member",
        "from": "sg-as:MaterialExpensesAbstract",
        "to": "sg-as:IncreaseDecreaseInInventoriesOfFinishedGoodsAndWorkInProgress",
        "order": 1
      },
      {
        "role": "NoteSelectedIncomeExpense",
        "arcrole": "domain-member",
        "from": "sg-as:MaterialExpensesAbstract",
        "to": "sg-as:RawMaterialsAndConsumablesUsed",
        "order": 2
      },
      {
        "role": "NoteSelectedIncomeExpense",
        "arcrole": "domain-member",
        "from": "sg-as:MaterialExpensesAbstract",
        "to": "sg-as:SubcontractorCost",
        "order": 3
      },
      {
        "role": "NoteSelectedIncomeExpense",
        "arcrole": "domain-member",
        "from": "sg-as:MaterialExpensesAbstract",
        "to": "sg-as:DividendDeclaredDuringTheYear",
        "order": 4
      },
      {
        "role": "NoteSelectedIncomeExpense",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfSelectedIncomeExpensesLineItems",
        "to": "sg-as:MaterialGainsLossesAbstract",
        "order": 4
      },
      {
        "role": "NoteSelectedIncomeExpense",
        "arcrole": "domain-member",
        "from": "sg-as:MaterialGainsLossesAbstract",
        "to": "sg-as:NetGainsLossesOnForeignExchangeAdjustment",
        "order": 1
      },
      {
        "role": "NoteSelectedIncomeExpense",
        "arcrole": "domain-member",
        "from": "sg-as:MaterialGainsLossesAbstract",
        "to": "sg-as:NetGainsLossesOnDisposalOfPropertyPlantAndEquipment",
        "order": 2
      },
      {
        "role": "NoteSelectedIncomeExpense",
        "arcrole": "domain-member",
        "from": "sg-as:MaterialGainsLossesAbstract",
        "to": "sg-as:NetGainsLossesOnDisposalOfIntangibleAssets",
        "order": 3
      },
      {
        "role": "NoteSelectedIncomeExpense",
        "arcrole": "domain-member",
        "from": "sg-as:MaterialGainsLossesAbstract",
        "to": "sg-as:ImpairmentLossReversalOfImpairmentLossOnInvestments",
        "order": 4
      },
      {
        "role": "NoteSelectedIncomeExpense",
        "arcrole": "domain-member",
        "from": "sg-as:MaterialGainsLossesAbstract",
        "to": "sg-as:ImpairmentLossReversalOfImpairmentLossOnReceivables",
        "order": 5
      },
      {
        "role": "NoteSelectedIncomeExpense",
        "arcrole": "domain-member",
        "from": "sg-as:MaterialGainsLossesAbstract",
        "to": "sg-as:ImpairmentLossReversalOfImpairmentLossOnOthers",
        "order": 6
      },
      {
        "role": "NoteRevenue",
        "arcrole": "all",
        "from": "sg-as:DisclosureOfRevenueAbstract",
        "to": "sg-as:DisclosureOfRevenueTable",
        "order": 1
      },
      {
        "role": "NoteRevenue",
        "arcrole": "hypercube-dimension",
        "from": "sg-as:DisclosureOfRevenueTable",
        "to": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
        "order": 1
      },
      {
        "role": "NoteRevenue",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfRevenueAbstract",
        "to": "sg-as:DisclosureOfRevenueLineItems",
        "order": 2
      },
      {
        "role": "NoteRevenue",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfRevenueLineItems",
        "to": "sg-as:RevenueAbstract",
        "order": 1
      },
      {
        "role": "NoteRevenue",
        "arcrole": "domain-member",
        "from": "sg-as:RevenueAbstract",
        "to": "sg-as:RevenueFromPropertyTransferredAtPointInTime",
        "order": 1
      },
      {
        "role": "NoteRevenue",
        "arcrole": "domain-member",
        "from": "sg-as:RevenueAbstract",
        "to": "sg-as:RevenueFromGoodsTransferredAtPointInTime",
        "order": 2
      },
      {
        "role": "NoteRevenue",
        "arcrole": "domain-member",
        "from": "sg-as:RevenueAbstract",
        "to": "sg-as:RevenueFromServicesTransferredAtPointInTime",
        "order": 3
      },
      {
        "role": "NoteRevenue",
        "arcrole": "domain-member",
        "from": "sg-as:RevenueAbstract",
        "to": "sg-as:RevenueFromPropertyTransferredOverTime",
        "order": 4
      },
      {
        "role": "NoteRevenue",
        "arcrole": "domain-member",
        "from": "sg-as:RevenueAbstract",
        "to": "sg-as:RevenueFromConstructionContractsOverTime",
        "order": 5
      },
      {
        "role": "NoteRevenue",
        "arcrole": "domain-member",
        "from": "sg-as:RevenueAbstract",
        "to": "sg-as:RevenueFromServicesTransferredOverTime",
        "order": 6
      },
      {
        "role": "NoteRevenue",
        "arcrole": "domain-member",
        "from": "sg-as:RevenueAbstract",
        "to": "sg-as:OtherRevenue",
        "order": 7
      },
      {
        "role": "NoteRevenue",
        "arcrole": "domain-member",
        "from": "sg-as:RevenueAbstract",
        "to": "sg-as:Revenue",
        "order": 8
      },
      {
        "role": "link",
        "arcrole": "all",
        "from": "sg-as:DisclosureOfRightofuseAssetsAbstract",
        "to": "sg-as:DisclosureOfRightofuseAssetsTable",
        "order": 1
      },
      {
        "role": "link",
        "arcrole": "hypercube-dimension",
        "from": "sg-as:DisclosureOfRightofuseAssetsTable",
        "to": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
        "order": 1
      },
      {
        "role": "link",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfRightofuseAssetsAbstract",
        "to": "sg-as:DisclosureOfRightofuseAssetsItems",
        "order": 2
      },
      {
        "role": "link",
        "arcrole": "domain-member",
        "from": "sg-as:DisclosureOfRightofuseAssetsItems",
        "to": "sg-as:RightofuseAssetsAbstract",
        "order": 1
      },
      {
        "role": "link",
        "arcrole": "domain-member",
        "from": "sg-as:RightofuseAssetsAbstract",
        "to": "sg-as:RightofuseAssetsClassifiedInPropertyPlantAndEquipment",
        "order": 1
      },
      {
        "role": "link",
        "arcrole": "domain-member",
        "from": "sg-as:RightofuseAssetsAbstract",
        "to": "sg-as:RightofuseAssetsClassifiedInIntangibleAssetsOtherThanGoodwill",
        "order": 2
      },
      {
        "role": "link",
        "arcrole": "domain-member",
        "from": "sg-as:RightofuseAssetsAbstract",
        "to": "sg-as:RightofuseAssetsClassifiedInOtherAssets",
        "order": 3
      },
      {
        "role": "SFPOrderOfLiquidity",
        "arcrole": "all",
        "from": "sg-as:StatementOfFinancialPositionAbstract",
        "to": "sg-as:StatementOfFinancialPositionTable",
        "order": 1
      },
      {
        "role": "SFPOrderOfLiquidity",
        "arcrole": "hypercube-dimension",
        "from": "sg-as:StatementOfFinancialPositionTable",
        "to": "sg-as:ConsolidatedAndSeparateFinancialStatementsAxis",
        "order": 1
      },
      {
        "role": "SFPOrderOfLiquidity",
        "arcrole": "domain-member",
        "from": "sg-as:StatementOfFinancialPositionAbstract",
        "to": "sg-as:StatementOfFinancialPositionLineItems",
        "order": 2
      },
      {
        "role": "SFPOrderOfLiquidity",
        "arcrole": "domain-member",
        "from": "sg-as:StatementOfFinancialPositionLineItems",
        "to": "sg-as:AssetsAbstract",
        "order": 1
      },
      {
        "role": "SFPOrderOfLiquidity",
        "arcrole": "domain-member",
        "from": "sg-as:AssetsAbstract",
        "to": "sg-as:Assets",
        "order": 1
      },
      {
        "role": "SFPOrderOfLiquidity",
        "arcrole": "domain-member",
        "from": "sg-as:StatementOfFinancialPositionLineItems",
        "to": "sg-as:LiabilitiesAbstract",
        "order": 3
      },
      {
        "role": "SFPOrderOfLiquidity",
        "arcrole": "domain-member",
        "from": "sg-as:LiabilitiesAbstract",
        "to": "sg-as:Liabilities",
        "order": 1
      },
      {
        "role": "SFPOrderOfLiquidity",
        "arcrole": "domain-member",
        "from": "sg-as:StatementOfFinancialPositionLineItems",
        "to": "sg-as:EquityAbstract",
        "order": 4
      },
      {
        "role": "SFPOrderOfLiquidity",
        "arcrole": "domain-member",
        "from": "sg-as:EquityAbstract",
        "to": "sg-as:ShareCapital",
        "order": 1
      },
      {
        "role": "SFPOrderOfLiquidity",
        "arcrole": "domain-member",
        "from": "sg-as:EquityAbstract",
        "to": "sg-as:TreasuryShares",
        "order": 2
      },
      {
        "role": "SFPOrderOfLiquidity",
        "arcrole": "domain-member",
        "from": "sg-as:EquityAbstract",
        "to": "sg-as:AccumulatedProfitsLosses",
        "order": 3
      },
      {
        "role": "SFPOrderOfLiquidity",
        "arcrole": "domain-member",
        "from": "sg-as:EquityAbstract",
        "to": "sg-as:ReservesOtherThanAccumulatedProfitsLosses",
        "order": 4
      },
      {
        "role": "SFPOrderOfLiquidity",
        "arcrole": "domain-member",
        "from": "sg-as:EquityAbstract",
        "to": "sg-as:NoncontrollingInterests",
        "order": 5
      },
      {
        "role": "SFPOrderOfLiquidity",
        "arcrole": "domain-member",
        "from": "sg-as:EquityAbstract",
        "to": "sg-as:Equity",
        "order": 6
      }
    ]
  },
};
