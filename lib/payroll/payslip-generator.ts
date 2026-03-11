/**
 * Payslip generation utilities.
 * Computes YTD values and deduction breakdowns for payslip rendering.
 */

interface PayslipInput {
  employeeId: string;
  grossAmount: number;
  netAmount: number;
  taxAmount: number;
  deductions: { name: string; amount: number; category: string }[];
}

interface YtdValues {
  ytdGross: number;
  ytdNet: number;
  ytdTax: number;
}

export interface PayslipData {
  employeeId: string;
  grossAmount: number;
  netAmount: number;
  taxAmount: number;
  deductionsBreakdown: { name: string; amount: number; category: string }[];
  ytdGross: number;
  ytdNet: number;
  ytdTax: number;
}

/** Build payslip data by combining current item with YTD values */
export function buildPayslipData(
  input: PayslipInput,
  ytd: YtdValues
): PayslipData {
  return {
    employeeId: input.employeeId,
    grossAmount: input.grossAmount,
    netAmount: input.netAmount,
    taxAmount: input.taxAmount,
    deductionsBreakdown: input.deductions,
    ytdGross: ytd.ytdGross,
    ytdNet: ytd.ytdNet,
    ytdTax: ytd.ytdTax,
  };
}
