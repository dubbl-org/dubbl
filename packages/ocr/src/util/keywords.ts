// Multi-locale keyword bank for receipt parsing. Lowercase regex source strings;
// each list is OR-joined into a single regex. Keywords are matched case-insensitively
// with word boundaries on either side.

import type { Locale } from "../types";

export interface KeywordPack {
  total: string[];
  subtotal: string[];
  tax: string[];
  date: string[];
  receiptNumber: string[];
  paymentMethod: string[];
  // Words that strongly indicate a "subtotal-style" line that should NOT be picked as the grand total.
  totalNegative: string[];
  // "Cash", "Visa", "Mastercard", etc. (English-universal, but we union with locale).
  paymentLiterals: string[];
}

const en: KeywordPack = {
  total: [
    "grand total",
    "total amount",
    "amount due",
    "balance due",
    "total due",
    "total payable",
    "to pay",
    "total",
  ],
  subtotal: ["subtotal", "sub-total", "sub total", "net total", "net amount", "net"],
  tax: ["sales tax", "vat", "gst", "hst", "pst", "qst", "tax"],
  date: ["date", "issued", "issue date", "transaction date", "trans date", "purchased"],
  receiptNumber: [
    "receipt #",
    "receipt no",
    "invoice #",
    "invoice no",
    "invoice number",
    "transaction id",
    "trans id",
    "order #",
    "order no",
    "ref #",
    "ref no",
  ],
  paymentMethod: ["paid by", "payment method", "method of payment", "tendered"],
  totalNegative: [
    "subtotal",
    "sub-total",
    "sub total",
    "net total",
    "tax total",
    "items total",
    "discount",
    "change",
    "total items",
    "total tax",
    "total saved",
  ],
  paymentLiterals: [
    "cash",
    "visa",
    "mastercard",
    "amex",
    "american express",
    "discover",
    "debit",
    "credit",
    "apple pay",
    "google pay",
    "paypal",
    "contactless",
    "chip",
    "swiped",
    "emv",
    "eftpos",
  ],
};

const de: KeywordPack = {
  total: ["gesamtbetrag", "gesamtsumme", "endsumme", "summe", "zu zahlen", "rechnungsbetrag", "betrag"],
  subtotal: ["zwischensumme", "netto", "nettobetrag"],
  tax: ["mwst", "mehrwertsteuer", "ust", "umsatzsteuer", "steuer"],
  date: ["datum", "rechnungsdatum", "lieferdatum", "kassendatum"],
  receiptNumber: ["beleg-nr", "bonnr", "rechnungsnr", "rechnungsnummer", "belegnummer"],
  paymentMethod: ["zahlungsart", "zahlungsweise", "bezahlt mit"],
  totalNegative: ["zwischensumme", "netto", "rabatt", "trinkgeld", "rückgeld"],
  paymentLiterals: ["bar", "ec-karte", "girocard", "visa", "mastercard"],
};

const fr: KeywordPack = {
  total: ["total ttc", "montant total", "total à payer", "net à payer", "total"],
  subtotal: ["sous-total", "total ht", "ht"],
  tax: ["tva", "taxe"],
  date: ["date", "date de facturation", "le"],
  receiptNumber: ["facture n", "n° facture", "ticket n", "ref"],
  paymentMethod: ["mode de paiement", "réglé par", "paiement"],
  totalNegative: ["sous-total", "total ht", "remise", "rendu"],
  paymentLiterals: ["espèces", "carte", "cb", "visa", "mastercard"],
};

const es: KeywordPack = {
  total: ["total a pagar", "total importe", "importe total", "total"],
  subtotal: ["subtotal", "base imponible", "base"],
  tax: ["iva", "impuesto"],
  date: ["fecha", "fecha factura"],
  receiptNumber: ["factura n", "no factura", "ticket n"],
  paymentMethod: ["forma de pago", "pago con"],
  totalNegative: ["subtotal", "base imponible", "descuento", "cambio"],
  paymentLiterals: ["efectivo", "tarjeta", "visa", "mastercard"],
};

const it: KeywordPack = {
  total: ["totale complessivo", "totale a pagare", "importo totale", "totale"],
  subtotal: ["subtotale", "imponibile"],
  tax: ["iva", "imposta"],
  date: ["data", "data fattura"],
  receiptNumber: ["fattura n", "scontrino n"],
  paymentMethod: ["modalita di pagamento", "pagato con"],
  totalNegative: ["subtotale", "imponibile", "sconto", "resto"],
  paymentLiterals: ["contanti", "carta", "visa", "mastercard"],
};

const nl: KeywordPack = {
  total: ["totaalbedrag", "te betalen", "totaal"],
  subtotal: ["subtotaal", "netto"],
  tax: ["btw", "belasting"],
  date: ["datum"],
  receiptNumber: ["factuurnr", "bonnr"],
  paymentMethod: ["betaalmethode", "betaald met"],
  totalNegative: ["subtotaal", "netto", "korting", "wisselgeld"],
  paymentLiterals: ["contant", "pinnen", "visa", "mastercard"],
};

const pt: KeywordPack = {
  total: ["total a pagar", "valor total", "total"],
  subtotal: ["subtotal", "valor liquido"],
  tax: ["iva", "imposto"],
  date: ["data"],
  receiptNumber: ["fatura n", "fatura no"],
  paymentMethod: ["forma de pagamento", "pago com"],
  totalNegative: ["subtotal", "desconto", "troco"],
  paymentLiterals: ["dinheiro", "cartao", "visa", "mastercard"],
};

const sv: KeywordPack = {
  total: ["att betala", "totalbelopp", "totalt", "summa"],
  subtotal: ["delsumma", "netto"],
  tax: ["moms"],
  date: ["datum"],
  receiptNumber: ["kvittonummer", "fakturanr"],
  paymentMethod: ["betalsätt", "betalt med"],
  totalNegative: ["delsumma", "netto", "rabatt", "växel"],
  paymentLiterals: ["kontant", "kort", "visa", "mastercard"],
};

const da: KeywordPack = {
  total: ["total", "ialt", "i alt", "at betale"],
  subtotal: ["subtotal", "netto"],
  tax: ["moms"],
  date: ["dato"],
  receiptNumber: ["bonnr", "fakturanr"],
  paymentMethod: ["betalingsmåde", "betalt med"],
  totalNegative: ["subtotal", "netto", "rabat", "byttepenge"],
  paymentLiterals: ["kontant", "kort", "visa", "mastercard"],
};

const no: KeywordPack = {
  total: ["sum å betale", "total", "totalbeløp"],
  subtotal: ["subtotal", "netto"],
  tax: ["mva"],
  date: ["dato"],
  receiptNumber: ["kvitteringsnr", "fakturanr"],
  paymentMethod: ["betalingsmåte"],
  totalNegative: ["subtotal", "rabatt", "vekslepenger"],
  paymentLiterals: ["kontant", "kort", "visa", "mastercard"],
};

const fi: KeywordPack = {
  total: ["yhteensä", "summa", "maksettava", "kokonaissumma"],
  subtotal: ["välisumma", "veroton"],
  tax: ["alv"],
  date: ["päivämäärä", "pvm"],
  receiptNumber: ["kuittinr", "laskunr"],
  paymentMethod: ["maksutapa"],
  totalNegative: ["välisumma", "alennus", "vaihtoraha"],
  paymentLiterals: ["käteinen", "kortti", "visa", "mastercard"],
};

const pl: KeywordPack = {
  total: ["razem", "do zapłaty", "suma", "kwota"],
  subtotal: ["wartość netto", "netto"],
  tax: ["vat", "podatek"],
  date: ["data"],
  receiptNumber: ["numer paragonu", "fv", "faktura nr"],
  paymentMethod: ["sposób płatności", "płatność"],
  totalNegative: ["wartość netto", "rabat", "reszta"],
  paymentLiterals: ["gotówka", "karta", "visa", "mastercard"],
};

const hu: KeywordPack = {
  total: ["végösszeg", "fizetendő", "összeg", "össz"],
  subtotal: ["nettó"],
  tax: ["áfa", "adó"],
  date: ["dátum", "kelt"],
  receiptNumber: ["nyugtaszám", "számla sorszám"],
  paymentMethod: ["fizetési mód"],
  totalNegative: ["nettó", "kedvezmény", "visszajáró"],
  paymentLiterals: ["készpénz", "kártya", "visa", "mastercard"],
};

const PACKS: Record<Locale, KeywordPack> = {
  "en-US": en,
  "en-GB": en,
  "en-AU": en,
  "en-CA": en,
  "de-DE": de,
  "fr-FR": fr,
  "es-ES": es,
  "it-IT": it,
  "nl-NL": nl,
  "pt-PT": pt,
  "pt-BR": pt,
  "sv-SE": sv,
  "da-DK": da,
  "nb-NO": no,
  "fi-FI": fi,
  "pl-PL": pl,
  "hu-HU": hu,
};

/** Return the keyword pack for a locale, falling back to English. */
export function getKeywords(locale?: Locale): KeywordPack {
  if (!locale) return en;
  return PACKS[locale] ?? en;
}

/** Union the locale's keywords with English universals — many receipts are bilingual. */
export function getMergedKeywords(locale?: Locale): KeywordPack {
  if (!locale || locale.startsWith("en")) return en;
  const local = PACKS[locale] ?? en;
  return {
    total: dedupe([...local.total, ...en.total]),
    subtotal: dedupe([...local.subtotal, ...en.subtotal]),
    tax: dedupe([...local.tax, ...en.tax]),
    date: dedupe([...local.date, ...en.date]),
    receiptNumber: dedupe([...local.receiptNumber, ...en.receiptNumber]),
    paymentMethod: dedupe([...local.paymentMethod, ...en.paymentMethod]),
    totalNegative: dedupe([...local.totalNegative, ...en.totalNegative]),
    paymentLiterals: dedupe([...local.paymentLiterals, ...en.paymentLiterals]),
  };
}

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

/** Build a case-insensitive regex matching any of the keywords as a phrase.
 *  Anchors with word boundaries so that "Cash" doesn't match inside "Cashier"
 *  and "Tax" doesn't match inside "Taxi". For keywords whose first or last
 *  char is a non-word character (e.g. "receipt #"), the \b is moved inward to
 *  avoid the always-false case where \b sits between two non-word chars. */
export function buildKeywordRegex(words: string[]): RegExp {
  const parts = words.map((w) => {
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const left = /^\w/.test(w) ? "\\b" : "";
    const right = /\w$/.test(w) ? "\\b" : "";
    return `${left}${esc}${right}`;
  });
  return new RegExp(`(?:${parts.join("|")})`, "i");
}
