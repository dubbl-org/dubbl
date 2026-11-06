/**
 * The one set of names for depreciation methods and conventions, shared by
 * every fixed-asset screen so the same method never reads two different ways.
 * `name` is the accounting term; `plain` says what it does in everyday words.
 */

export const DEPRECIATION_METHODS = [
  { value: "straight_line", name: "Straight line", plain: "The same amount each month" },
  { value: "declining_balance", name: "Declining balance", plain: "A yearly share of what's left, so more at the start" },
  { value: "sum_of_years_digits", name: "Sum of years' digits", plain: "Front-loaded, a little less each month" },
  { value: "units_of_production", name: "Units of production", plain: "Based on how much it's used" },
] as const;

// How much the first month takes. A shortened first month is made up in one
// extra month after the useful life ends (see calculateMonthlyDepreciation).
export const DEPRECIATION_CONVENTIONS = [
  { value: "full_month", label: "A full first month" },
  { value: "mid_month", label: "Half the first month (mid-month)" },
  { value: "half_year", label: "Half the first month (half-year)" },
  { value: "mid_quarter", label: "Half the first month (mid-quarter)" },
  { value: "pro_rata_days", label: "Day by day in the first month" },
  { value: "full_at_purchase", label: "All of it in the first month" },
] as const;

export const CONVENTION_HINT =
  "How much the first month takes. Any shortfall is taken one month after the useful life ends.";

/** Accounting name, e.g. "Declining balance". */
export function methodName(value: string): string {
  return DEPRECIATION_METHODS.find((m) => m.value === value)?.name ?? value;
}

/** Plain-language description, e.g. "The same amount each month". */
export function methodPlain(value: string): string {
  return DEPRECIATION_METHODS.find((m) => m.value === value)?.plain ?? value;
}

/** Select option label: "The same amount each month (straight line)". */
export function methodOption(value: string): string {
  const m = DEPRECIATION_METHODS.find((x) => x.value === value);
  return m ? `${m.plain} (${m.name.toLowerCase()})` : value;
}

export function conventionLabel(value: string): string {
  return DEPRECIATION_CONVENTIONS.find((c) => c.value === value)?.label ?? value;
}
