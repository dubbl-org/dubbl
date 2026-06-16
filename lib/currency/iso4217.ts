/**
 * Canonical ISO 4217 currency reference data.
 *
 * The list is derived from the platform's own ICU data via `Intl` so that
 * codes, display names, symbols and — crucially — minor units (decimal places)
 * stay correct without a hand-maintained table. ICU knows that JPY/KRW have 0
 * decimals and KWD/BHD/OMR have 3, which a hardcoded `× 100` gets wrong.
 *
 * This module is dependency-free and safe to import on both server and client.
 */

export interface IsoCurrency {
  code: string;
  name: string;
  symbol: string;
  decimalPlaces: number;
}

// Non-cash / fund / metal / test codes excluded from the picker and the seed.
// Most accounting apps don't offer these as transactable currencies.
const EXCLUDED = new Set([
  "XAU", "XAG", "XPT", "XPD", // precious metals
  "XDR", "XSU", "XUA", "XBA", "XBB", "XBC", "XBD", // supranational / bond units
  "XTS", "XXX", // test / "no currency"
  "XBT", // bitcoin (not ISO cash)
]);

/**
 * Minimal fallback used only if `Intl.supportedValuesOf` is unavailable
 * (very old runtimes). Minor units are hand-checked for the non-2 exceptions.
 */
const FALLBACK: IsoCurrency[] = [
  { code: "USD", name: "US Dollar", symbol: "$", decimalPlaces: 2 },
  { code: "EUR", name: "Euro", symbol: "€", decimalPlaces: 2 },
  { code: "GBP", name: "British Pound", symbol: "£", decimalPlaces: 2 },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", decimalPlaces: 0 },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF", decimalPlaces: 2 },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$", decimalPlaces: 2 },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", decimalPlaces: 2 },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥", decimalPlaces: 2 },
  { code: "INR", name: "Indian Rupee", symbol: "₹", decimalPlaces: 2 },
  { code: "ZAR", name: "South African Rand", symbol: "R", decimalPlaces: 2 },
  { code: "KES", name: "Kenyan Shilling", symbol: "KSh", decimalPlaces: 2 },
  { code: "NGN", name: "Nigerian Naira", symbol: "₦", decimalPlaces: 2 },
  { code: "VND", name: "Vietnamese Dong", symbol: "₫", decimalPlaces: 0 },
  { code: "KWD", name: "Kuwaiti Dinar", symbol: "KWD", decimalPlaces: 3 },
  { code: "BHD", name: "Bahraini Dinar", symbol: "BHD", decimalPlaces: 3 },
  { code: "OMR", name: "Omani Rial", symbol: "OMR", decimalPlaces: 3 },
];

function intlSupportedCurrencies(): string[] {
  const supportedValuesOf = (
    Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf;
  if (typeof supportedValuesOf !== "function") return [];
  try {
    return supportedValuesOf("currency");
  } catch {
    return [];
  }
}

function buildList(): IsoCurrency[] {
  const codes = intlSupportedCurrencies();
  if (codes.length === 0) return [...FALLBACK].sort((a, b) => a.code.localeCompare(b.code));

  const names = new Intl.DisplayNames(["en"], { type: "currency" });
  const list: IsoCurrency[] = [];

  for (const code of codes) {
    if (EXCLUDED.has(code)) continue;

    let decimalPlaces = 2;
    let symbol = code;
    try {
      // `narrowSymbol` prefers a real glyph (HUF -> "Ft", SEK -> "kr",
      // PLN -> "zł") over the default "symbol" display, which returns the
      // 3-letter code for many currencies. Currencies with no distinct glyph
      // (CHF, KWD, AED, ...) still come back as the code; the picker hides the
      // symbol when it just repeats the code.
      const nf = new Intl.NumberFormat("en", {
        style: "currency",
        currency: code,
        currencyDisplay: "narrowSymbol",
      });
      decimalPlaces = nf.resolvedOptions().maximumFractionDigits ?? 2;
      symbol = nf.formatToParts(0).find((p) => p.type === "currency")?.value ?? code;
    } catch {
      // ICU couldn't format it — keep defaults.
    }

    let name = code;
    try {
      name = names.of(code) ?? code;
    } catch {
      // keep code as name
    }

    list.push({ code, name, symbol, decimalPlaces });
  }

  return list.sort((a, b) => a.code.localeCompare(b.code));
}

let cachedList: IsoCurrency[] | null = null;

/** The full active ISO 4217 currency set, sorted by code. Cached after first call. */
export function getIsoCurrencies(): IsoCurrency[] {
  if (!cachedList) cachedList = buildList();
  return cachedList;
}

let cachedCodeSet: Set<string> | null = null;

/** True if `code` is a known active ISO 4217 currency (case-insensitive). */
export function isValidCurrencyCode(code: string | null | undefined): boolean {
  if (!code) return false;
  if (!cachedCodeSet) cachedCodeSet = new Set(getIsoCurrencies().map((c) => c.code));
  return cachedCodeSet.has(code.toUpperCase());
}

/**
 * Minor units (decimal places) for a currency, straight from ICU.
 * Returns 2 for unknown codes. Use this anywhere money is scaled or formatted.
 */
export function getCurrencyMinorUnits(code: string): number {
  try {
    return (
      new Intl.NumberFormat("en", { style: "currency", currency: code })
        .resolvedOptions().maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}
