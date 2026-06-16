import { z } from "zod";
import { isValidCurrencyCode } from "./iso4217";

/**
 * Reusable Zod schema for an ISO 4217 currency code.
 * Trims, upper-cases, and validates against the active currency set so a
 * typo or unknown code is rejected at the API boundary rather than stored.
 *
 * Chain `.default("USD")`, `.optional()`, or `.nullable()` as the field needs.
 */
export const currencyCodeSchema = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .refine((v) => isValidCurrencyCode(v), {
    message: "Unrecognized ISO 4217 currency code",
  });
