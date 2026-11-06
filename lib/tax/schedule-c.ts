/**
 * IRS Schedule C (Form 1040) worksheet: map revenue and expense accounts to
 * Schedule C lines, then work out the totals. Pure, so it is unit tested and
 * shared by the REST route and the MCP tool.
 *
 * Accounts are matched in this order:
 *   1. an explicit subType naming a line (e.g. "advertising", "travel"), for
 *      charts that were set up with Schedule C sub types;
 *   2. the account's type, sub type and name, which is how the standard charts
 *      describe their accounts (e.g. 5600 "Marketing & Advertising", operating
 *      expense -> Line 8; cogs -> Line 4; non-operating revenue -> Line 6).
 * Accounts that don't belong on Schedule C (income tax, unrealised currency
 * movements, gains or losses on selling assets) are left out.
 *
 * All amounts are integer cents.
 */

export interface ScheduleCAccount {
  code: string;
  name: string;
  type: "revenue" | "expense" | string;
  subType: string | null;
  /** Natural-sign balance for the period in cents (revenue credit-positive, expense debit-positive). */
  balance: number;
}

export interface ScheduleCLine {
  line: string;
  label: string;
  amount: number;
  /** The accounts making up the line (empty for computed lines). */
  accounts: { code: string; name: string; amount: number }[];
}

export const SCHEDULE_C_LINES: Record<string, string> = {
  "1": "Gross receipts or sales",
  "2": "Returns and allowances",
  "3": "Subtract line 2 from line 1",
  "4": "Cost of goods sold",
  "5": "Gross profit (line 3 minus line 4)",
  "6": "Other income",
  "7": "Gross income (line 5 plus line 6)",
  "8": "Advertising",
  "9": "Car and truck expenses",
  "10": "Commissions and fees",
  "11": "Contract labor",
  "13": "Depreciation",
  "14": "Employee benefit programs",
  "15": "Insurance (other than health)",
  "16a": "Mortgage interest",
  "16b": "Other interest",
  "17": "Legal and professional services",
  "18": "Office expense",
  "19": "Pension and profit-sharing plans",
  "20a": "Rent or lease: vehicles, machinery, equipment",
  "20b": "Rent or lease: other business property",
  "21": "Repairs and maintenance",
  "22": "Supplies",
  "23": "Taxes and licenses",
  "24a": "Travel",
  "24b": "Meals (usually 50% deductible)",
  "25": "Utilities",
  "26": "Wages",
  "27a": "Other expenses",
  "28": "Total expenses (lines 8 to 27a)",
  "29": "Tentative profit or loss (line 7 minus line 28)",
  "31": "Net profit or loss",
};

/** Explicit sub types (for charts set up with Schedule C sub types). */
const SUBTYPE_LINES: Record<string, string> = {
  income: "1",
  returns_allowances: "2",
  cogs: "4",
  advertising: "8",
  car_truck: "9",
  commissions: "10",
  contract_labor: "11",
  depreciation: "13",
  employee_benefits: "14",
  insurance: "15",
  interest_mortgage: "16a",
  interest_other: "16b",
  legal_professional: "17",
  office_expense: "18",
  pension: "19",
  rent_lease_vehicles: "20a",
  rent_lease_other: "20b",
  repairs_maintenance: "21",
  supplies: "22",
  taxes_licenses: "23",
  travel: "24a",
  meals: "24b",
  utilities: "25",
  wages: "26",
  other_expenses: "27a",
};

/** Expense name patterns, first match wins. */
const EXPENSE_NAME_RULES: [RegExp, string][] = [
  [/income tax|corporation tax/i, "skip"],
  [/unreali[sz]ed/i, "skip"],
  [/(gain|loss) on (asset )?(disposal|sale)/i, "skip"],
  [/advertis|marketing|promotion/i, "8"],
  [/motor vehicle|vehicle|car |fuel|mileage|truck/i, "9"],
  [/commission|merchant fee|payment processing/i, "10"],
  [/subcontract|contract labou?r|contractor/i, "11"],
  [/depreciat|amorti[sz]|impairment/i, "13"],
  [/pension|retirement|401k|profit.?sharing|superannuation/i, "19"],
  [/benefit|health insurance|medical/i, "14"],
  [/insurance/i, "15"],
  [/mortgage/i, "16a"],
  [/interest/i, "16b"],
  [/legal|professional|accounting|audit|bookkeeping|consult/i, "17"],
  [/office|postage|shipping|printing|stationery|courier/i, "18"],
  [/(equipment|vehicle|machinery) (rent|lease|hire)/i, "20a"],
  [/rent|lease/i, "20b"],
  [/repair|maintenance/i, "21"],
  [/suppl(y|ies)|materials/i, "22"],
  [/payroll tax|tax|licen[cs]e|permit|rates/i, "23"],
  [/travel|accommodation|airfare|lodging/i, "24a"],
  [/meal|entertainment|food/i, "24b"],
  [/utilit|electric|water|gas|internet|phone|telephone|telecom/i, "25"],
  [/wage|salar|payroll|staff cost/i, "26"],
];

/** Which Schedule C line an account belongs on, or null to leave it out. */
export function scheduleCLineFor(account: Pick<ScheduleCAccount, "name" | "type" | "subType">): string | null {
  const sub = account.subType ?? "";
  if (SUBTYPE_LINES[sub]) return SUBTYPE_LINES[sub];

  if (account.type === "revenue") {
    if (/return|allowance|discount|refund/i.test(account.name)) return "2";
    if (/unreali[sz]ed/i.test(account.name)) return null;
    if (/(gain|loss) on (asset )?(disposal|sale)/i.test(account.name)) return null;
    if (sub === "non_operating" || sub === "other_income" || sub === "other") return "6";
    return "1";
  }

  if (account.type === "expense") {
    if (sub === "cogs" || sub === "cost_of_sales" || sub === "direct_costs") return "4";
    for (const [re, line] of EXPENSE_NAME_RULES) {
      if (re.test(account.name)) return line === "skip" ? null : line;
    }
    return "27a";
  }

  return null;
}

function lineOrder(line: string): number {
  const n = parseFloat(line);
  const suffix = line.replace(/^[0-9]+/, "");
  return n + (suffix ? (suffix.charCodeAt(0) - 96) / 10 : 0);
}

/**
 * Build the Schedule C lines from account balances. Line 2 (returns and
 * allowances) is a positive amount subtracted from Line 1 to give Line 3.
 */
export function buildScheduleC(accounts: ScheduleCAccount[]) {
  const byLine = new Map<string, ScheduleCLine>();
  const add = (line: string, code: string, name: string, amount: number) => {
    const row = byLine.get(line) ?? { line, label: SCHEDULE_C_LINES[line] ?? line, amount: 0, accounts: [] };
    row.amount += amount;
    row.accounts.push({ code, name, amount });
    byLine.set(line, row);
  };

  for (const a of accounts) {
    if (a.balance === 0) continue;
    const line = scheduleCLineFor(a);
    if (!line) continue;
    // Returns on a revenue account carry a debit balance: show it as a positive deduction.
    const amount = line === "2" && a.type === "revenue" ? -a.balance : a.balance;
    add(line, a.code, a.name, amount);
  }

  const amt = (line: string) => byLine.get(line)?.amount ?? 0;
  const computed = (line: string, amount: number): ScheduleCLine => ({
    line,
    label: SCHEDULE_C_LINES[line],
    amount,
    accounts: [],
  });

  const line3 = amt("1") - amt("2");
  const line5 = line3 - amt("4");
  const line7 = line5 + amt("6");
  const expenseLines = [...byLine.values()].filter((l) => lineOrder(l.line) >= 8);
  const line28 = expenseLines.reduce((s, l) => s + l.amount, 0);
  const line29 = line7 - line28;

  const lines: ScheduleCLine[] = [
    byLine.get("1") ?? computed("1", 0),
    ...(byLine.has("2") ? [byLine.get("2")!] : []),
    computed("3", line3),
    ...(byLine.has("4") ? [byLine.get("4")!] : []),
    computed("5", line5),
    ...(byLine.has("6") ? [byLine.get("6")!] : []),
    computed("7", line7),
    ...expenseLines.sort((a, b) => lineOrder(a.line) - lineOrder(b.line)),
    computed("28", line28),
    computed("29", line29),
    computed("31", line29),
  ];

  return { lines, totalIncome: line7, totalExpenses: line28, netProfit: line29 };
}
