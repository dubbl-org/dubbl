/**
 * Calculate monthly payment using PMT formula.
 * @param principalCents - loan amount in cents
 * @param annualRateBasisPoints - annual interest rate in basis points
 * @param termMonths - number of months
 * @returns monthly payment in cents
 */
export function calculatePMT(
  principalCents: number,
  annualRateBasisPoints: number,
  termMonths: number
): number {
  const monthlyRate = annualRateBasisPoints / 10000 / 12;
  if (monthlyRate === 0) return Math.round(principalCents / termMonths);
  const pmt = principalCents * (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) /
    (Math.pow(1 + monthlyRate, termMonths) - 1);
  return Math.round(pmt);
}

interface ScheduleEntry {
  periodNumber: number;
  date: string;
  principalAmount: number;
  interestAmount: number;
  totalPayment: number;
  remainingBalance: number;
}

/**
 * Generate a full amortization schedule.
 */
export function generateAmortizationSchedule(
  principalCents: number,
  annualRateBasisPoints: number,
  termMonths: number,
  startDate: string
): ScheduleEntry[] {
  const monthlyPayment = calculatePMT(principalCents, annualRateBasisPoints, termMonths);
  const monthlyRate = annualRateBasisPoints / 10000 / 12;
  const schedule: ScheduleEntry[] = [];
  let balance = principalCents;

  for (let i = 1; i <= termMonths; i++) {
    const interestAmount = Math.round(balance * monthlyRate);
    let principalAmount = monthlyPayment - interestAmount;

    // Last payment adjusts for rounding
    if (i === termMonths) {
      principalAmount = balance;
    }

    const totalPayment = principalAmount + interestAmount;
    balance -= principalAmount;

    // Calculate date
    const start = new Date(startDate);
    start.setMonth(start.getMonth() + i);
    const dateStr = start.toISOString().slice(0, 10);

    schedule.push({
      periodNumber: i,
      date: dateStr,
      principalAmount,
      interestAmount,
      totalPayment,
      remainingBalance: Math.max(0, balance),
    });
  }

  return schedule;
}
