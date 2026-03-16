import type { AccountTemplate } from "./types";
import { GENERIC_ACCOUNTS } from "./generic";
import { FR_ACCOUNTS } from "./fr";
import { ES_ACCOUNTS } from "./es";
import { DE_ACCOUNTS } from "./de";
import { SE_ACCOUNTS } from "./se";
import { BR_ACCOUNTS } from "./br";
import { BE_ACCOUNTS } from "./be";
import { AT_ACCOUNTS } from "./at";
import { IT_ACCOUNTS } from "./it";
import { PT_ACCOUNTS } from "./pt";

/**
 * Maps country codes to their legally mandated or de facto standard
 * chart of accounts templates.
 *
 * Countries not listed here will use the generic template.
 */
const COUNTRY_TEMPLATES: Record<string, AccountTemplate[]> = {
  // Legally mandated
  FR: FR_ACCOUNTS, // Plan Comptable General (PCG)
  ES: ES_ACCOUNTS, // Plan General de Contabilidad (PGC)
  BE: BE_ACCOUNTS, // Plan Comptable Minimum Normalise (PCMN)
  BR: BR_ACCOUNTS, // CFC/ITG 1000 / SPED
  IT: IT_ACCOUNTS, // Piano dei Conti
  PT: PT_ACCOUNTS, // SNC (Sistema de Normalizacao Contabilistica)
  // De facto standard
  DE: DE_ACCOUNTS, // SKR03
  AT: AT_ACCOUNTS, // Einheitskontenrahmen (EKR)
  SE: SE_ACCOUNTS, // BAS
};

export function getAccountsForCountry(countryCode: string): AccountTemplate[] {
  return COUNTRY_TEMPLATES[countryCode] || GENERIC_ACCOUNTS;
}

export { GENERIC_ACCOUNTS };
export type { AccountTemplate };
