/**
 * Payroll forecasting utilities.
 */

interface Employee {
  salary: number; // cents (annual)
  compensationType: string;
  hourlyRate: number | null;
  taxRate: number; // basis points
  isActive: boolean;
}

interface MonthlyProjection {
  month: string;
  gross: number;
  tax: number;
  net: number;
  headcount: number;
}

/** Project monthly payroll costs for a set of employees */
export function projectMonthlyCosts(
  employees: Employee[],
  months: number
): MonthlyProjection[] {
  const active = employees.filter((e) => e.isActive);

  const monthlyGross = active.reduce((sum, emp) => {
    if (emp.compensationType === "salary") {
      return sum + Math.round(emp.salary / 12);
    }
    if (emp.compensationType === "hourly" && emp.hourlyRate) {
      return sum + Math.round(emp.hourlyRate * 173); // avg monthly hours
    }
    return sum;
  }, 0);

  const avgTaxRate =
    active.length > 0
      ? active.reduce((sum, emp) => sum + emp.taxRate, 0) / active.length
      : 2000;

  const monthlyTax = Math.round((monthlyGross * avgTaxRate) / 10000);
  const monthlyNet = monthlyGross - monthlyTax;

  return Array.from({ length: months }, (_, i) => {
    const date = new Date();
    date.setMonth(date.getMonth() + i + 1);
    return {
      month: date.toISOString().slice(0, 7),
      gross: monthlyGross,
      tax: monthlyTax,
      net: monthlyNet,
      headcount: active.length,
    };
  });
}

/** Calculate what-if scenario */
export function whatIfAnalysis(params: {
  currentMonthlyGross: number;
  headcount: number;
  avgSalary: number;
  salaryAdjustmentPercent?: number;
  newHires?: number;
  avgNewHireSalary?: number;
  terminations?: number;
  months?: number;
}): {
  currentMonthlyGross: number;
  projectedMonthlyGross: number;
  difference: number;
  projectedHeadcount: number;
} {
  const {
    currentMonthlyGross,
    headcount,
    avgSalary,
    salaryAdjustmentPercent = 0,
    newHires = 0,
    avgNewHireSalary = 0,
    terminations = 0,
  } = params;

  const multiplier = 1 + salaryAdjustmentPercent / 100;
  let projected = Math.round(currentMonthlyGross * multiplier);

  if (newHires > 0 && avgNewHireSalary > 0) {
    projected += Math.round((avgNewHireSalary / 12) * newHires);
  }

  if (terminations > 0 && headcount > 0) {
    projected -= Math.round((avgSalary / 12) * terminations);
  }

  return {
    currentMonthlyGross,
    projectedMonthlyGross: projected,
    difference: projected - currentMonthlyGross,
    projectedHeadcount: headcount + newHires - terminations,
  };
}
