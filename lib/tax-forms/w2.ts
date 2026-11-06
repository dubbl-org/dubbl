/**
 * Pure W-2 box builder. No database access, so it can run in tests and in the
 * browser (the detail page and the PDF use the labels below).
 *
 * All amounts are integer cents in the payroll item's own currency.
 */

export interface W2DeductionInput {
  /** Deduction type name, e.g. "401(k)", "Health insurance", "Union dues". */
  name: string;
  category: "pre_tax" | "post_tax";
  amount: number;
}

export interface W2TaxInput {
  /** "income_tax", "social_security", "medicare", "additional_medicare", ... */
  taxKind: string;
  jurisdictionLevel: string; // federal | state | local
  jurisdiction: string | null; // e.g. "CA", "NYC"
  amount: number;
}

/** One payroll item (one employee in one completed run). */
export interface W2ItemInput {
  grossAmount: number;
  /** All employee tax on the item; used for Box 2 when it has no tax breakdown rows. */
  taxAmount: number;
  /** The item's pre-tax total; used when it has no itemized deduction rows. */
  preTaxDeductions: number;
  deductions: W2DeductionInput[];
  taxes: W2TaxInput[];
}

export interface W2Box12Line {
  code: string;
  amount: number;
  description: string;
}

export interface W2Box14Line {
  label: string;
  amount: number;
}

export interface W2StateLine {
  /** Box 15 state code. */
  state: string;
  /** Box 16 state wages. */
  wages: number;
  /** Box 17 state income tax. */
  tax: number;
}

export interface W2LocalLine {
  /** Box 20 locality name. */
  locality: string;
  /** Box 18 local wages. */
  wages: number;
  /** Box 19 local income tax. */
  tax: number;
}

export interface W2Boxes {
  box1_wages: number;
  box2_federal_tax: number;
  box3_ss_wages: number;
  box4_ss_tax: number;
  box5_medicare_wages: number;
  box6_medicare_tax: number;
  box12: W2Box12Line[];
  box13_retirement_plan: boolean;
  box14: W2Box14Line[];
  states: W2StateLine[];
  localities: W2LocalLine[];
  /** Totals of boxes 17 and 19 across all states / localities. */
  box17_state_income_tax: number;
  box19_local_income_tax: number;
}

const BOX12_DESCRIPTIONS: Record<string, string> = {
  D: "Elective deferrals to a 401(k)",
  E: "Elective deferrals to a 403(b)",
  G: "Elective deferrals to a 457(b)",
  S: "SIMPLE retirement contributions",
  W: "Health savings account (HSA) contributions",
  AA: "Designated Roth contributions to a 401(k)",
  BB: "Designated Roth contributions to a 403(b)",
  EE: "Designated Roth contributions to a 457(b)",
  DD: "Cost of employer-sponsored health coverage (employee share)",
};

const RETIREMENT_CODES = new Set(["D", "E", "G", "S", "AA", "BB", "EE"]);

/**
 * Box 12 code for a deduction type, from its name; null when it belongs in
 * Box 14 instead.
 */
export function box12CodeFor(name: string): string | null {
  const n = name.toLowerCase();
  const roth = n.includes("roth");
  if (n.includes("401")) return roth ? "AA" : "D";
  if (n.includes("403")) return roth ? "BB" : "E";
  if (n.includes("457")) return roth ? "EE" : "G";
  if (/\bsimple\b/.test(n)) return "S";
  if (/\bhsa\b/.test(n) || n.includes("health savings")) return "W";
  if (/health|medical|dental|vision/.test(n)) return "DD";
  return null;
}

/** Retirement deferrals are still subject to Social Security and Medicare. */
function isRetirement(name: string, code: string | null): boolean {
  if (code && RETIREMENT_CODES.has(code)) return true;
  return /pension|retire/.test(name.toLowerCase());
}

type TaxBucket = "federal_income" | "state_income" | "local_income" | "social_security" | "medicare" | "other";

function classifyTax(t: W2TaxInput): TaxBucket {
  const k = t.taxKind.toLowerCase();
  if (k.includes("social_security")) return "social_security";
  // Additional Medicare (0.9%) is part of Box 6
  if (k.includes("medicare")) return "medicare";
  if (k.includes("income_tax") || k.includes("withholding")) {
    if (t.jurisdictionLevel === "state") return "state_income";
    if (t.jurisdictionLevel === "local") return "local_income";
    return "federal_income";
  }
  return "other";
}

/**
 * Builds one employee's W-2 boxes from their payroll items for the year.
 *
 * - Box 1 = gross minus pre-tax deductions.
 * - Boxes 3 and 5 = gross minus pre-tax deductions that aren't retirement
 *   deferrals (401(k) etc. stay subject to FICA); Box 3 is capped at the
 *   Social Security wage base.
 * - Boxes 2, 4, 6, 17 and 19 are the amounts actually withheld, from the tax
 *   breakdown rows. Items without breakdown rows (older runs) put their whole
 *   taxAmount in Box 2.
 * - Box 12 and 14 come from the itemized deductions, classified by name.
 * - State and local wages are the Box 1 wages of the items that withheld tax
 *   for that state or locality.
 */
export function buildW2Boxes(items: W2ItemInput[], opts: { ssWageBaseCents: number }): W2Boxes {
  let box1 = 0;
  let ficaWages = 0;
  let box2 = 0;
  let box4 = 0;
  let box6 = 0;
  const box12 = new Map<string, number>();
  const box14 = new Map<string, number>();
  const states = new Map<string, W2StateLine>();
  const locals = new Map<string, W2LocalLine>();
  let hasRetirement = false;

  for (const item of items) {
    let preTax = 0;
    let ficaExemptPreTax = 0;
    if (item.deductions.length > 0) {
      for (const d of item.deductions) {
        const code = box12CodeFor(d.name);
        const retirement = isRetirement(d.name, code);
        if (retirement) hasRetirement = true;
        if (d.category === "pre_tax") {
          preTax += d.amount;
          if (!retirement) ficaExemptPreTax += d.amount;
        }
        if (code) box12.set(code, (box12.get(code) ?? 0) + d.amount);
        else box14.set(d.name, (box14.get(d.name) ?? 0) + d.amount);
      }
    } else {
      // Not itemized: treat the lump like the payroll engine does
      preTax = item.preTaxDeductions;
      ficaExemptPreTax = item.preTaxDeductions;
    }

    const itemWages = item.grossAmount - preTax;
    box1 += itemWages;
    ficaWages += item.grossAmount - ficaExemptPreTax;

    if (item.taxes.length === 0) {
      box2 += item.taxAmount;
      continue;
    }

    const itemStates = new Set<string>();
    const itemLocals = new Set<string>();
    for (const t of item.taxes) {
      switch (classifyTax(t)) {
        case "federal_income": box2 += t.amount; break;
        case "social_security": box4 += t.amount; break;
        case "medicare": box6 += t.amount; break;
        case "state_income": {
          const key = t.jurisdiction ?? "";
          const line = states.get(key) ?? { state: key, wages: 0, tax: 0 };
          line.tax += t.amount;
          states.set(key, line);
          itemStates.add(key);
          break;
        }
        case "local_income": {
          const key = t.jurisdiction ?? "";
          const line = locals.get(key) ?? { locality: key, wages: 0, tax: 0 };
          line.tax += t.amount;
          locals.set(key, line);
          itemLocals.add(key);
          break;
        }
        default: {
          const label = t.taxKind.replace(/_/g, " ");
          box14.set(label, (box14.get(label) ?? 0) + t.amount);
        }
      }
    }
    for (const s of itemStates) states.get(s)!.wages += itemWages;
    for (const l of itemLocals) locals.get(l)!.wages += itemWages;
  }

  const stateLines = [...states.values()].sort((a, b) => a.state.localeCompare(b.state));
  const localLines = [...locals.values()].sort((a, b) => a.locality.localeCompare(b.locality));

  return {
    box1_wages: Math.max(0, box1),
    box2_federal_tax: box2,
    box3_ss_wages: Math.min(Math.max(0, ficaWages), opts.ssWageBaseCents),
    box4_ss_tax: box4,
    box5_medicare_wages: Math.max(0, ficaWages),
    box6_medicare_tax: box6,
    box12: [...box12.entries()]
      .filter(([, amount]) => amount !== 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, amount]) => ({ code, amount, description: BOX12_DESCRIPTIONS[code] ?? code })),
    box13_retirement_plan: hasRetirement,
    box14: [...box14.entries()]
      .filter(([, amount]) => amount !== 0)
      .map(([label, amount]) => ({ label, amount })),
    states: stateLines,
    localities: localLines,
    box17_state_income_tax: stateLines.reduce((s, l) => s + l.tax, 0),
    box19_local_income_tax: localLines.reduce((s, l) => s + l.tax, 0),
  };
}

/** Labels for the single-amount W-2 boxes, in form order. */
export const W2_AMOUNT_BOXES: { key: keyof W2Boxes; label: string }[] = [
  { key: "box1_wages", label: "Box 1 - Wages, tips, other compensation" },
  { key: "box2_federal_tax", label: "Box 2 - Federal income tax withheld" },
  { key: "box3_ss_wages", label: "Box 3 - Social security wages" },
  { key: "box4_ss_tax", label: "Box 4 - Social security tax withheld" },
  { key: "box5_medicare_wages", label: "Box 5 - Medicare wages and tips" },
  { key: "box6_medicare_tax", label: "Box 6 - Medicare tax withheld" },
];

export interface W2DisplayRow {
  label: string;
  /** Cents, or null for a text value. */
  amount: number | null;
  text?: string;
}

/**
 * Every W-2 box stored on a form, as label/value rows for the detail page and
 * the PDF. Understands forms generated before Box 12/14 were itemized.
 */
export function w2DisplayRows(data: Record<string, unknown>): W2DisplayRow[] {
  const num = (v: unknown) => (typeof v === "number" ? v : 0);
  const rows: W2DisplayRow[] = W2_AMOUNT_BOXES.map((b) => ({ label: b.label, amount: num(data[b.key]) }));

  if (Array.isArray(data.box12)) {
    for (const l of data.box12 as W2Box12Line[]) {
      rows.push({ label: `Box 12${l.code ? ` code ${l.code}` : ""} - ${l.description}`, amount: l.amount });
    }
  } else if (typeof data.box12_retirement_deferrals === "number" && data.box12_retirement_deferrals > 0) {
    rows.push({ label: "Box 12 - Retirement deferrals", amount: data.box12_retirement_deferrals });
  }

  rows.push({ label: "Box 13 - Retirement plan", amount: null, text: data.box13_retirement_plan ? "Yes" : "No" });

  if (Array.isArray(data.box14)) {
    for (const l of data.box14 as W2Box14Line[]) rows.push({ label: `Box 14 - ${l.label}`, amount: l.amount });
  } else if (typeof data.box14_other === "number" && data.box14_other > 0) {
    rows.push({ label: "Box 14 - Other", amount: data.box14_other });
  }

  if (Array.isArray(data.states)) {
    for (const s of data.states as W2StateLine[]) {
      const st = s.state || "State";
      rows.push({ label: `Box 15 - State`, amount: null, text: st });
      rows.push({ label: `Box 16 - State wages (${st})`, amount: s.wages });
      rows.push({ label: `Box 17 - State income tax (${st})`, amount: s.tax });
    }
  } else if (num(data.box17_state_income_tax) > 0) {
    rows.push({ label: "Box 17 - State income tax", amount: num(data.box17_state_income_tax) });
  }

  if (Array.isArray(data.localities)) {
    for (const l of data.localities as W2LocalLine[]) {
      const loc = l.locality || "Locality";
      rows.push({ label: `Box 18 - Local wages (${loc})`, amount: l.wages });
      rows.push({ label: `Box 19 - Local income tax (${loc})`, amount: l.tax });
      rows.push({ label: `Box 20 - Locality name`, amount: null, text: loc });
    }
  } else if (num(data.box19_local_income_tax) > 0) {
    rows.push({ label: "Box 19 - Local income tax", amount: num(data.box19_local_income_tax) });
  }

  return rows;
}
