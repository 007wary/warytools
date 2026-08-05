// Pure calculation logic for the percentage, GST, interest, and EMI
// calculators, kept separate from the client components so it's testable
// without a DOM.
//
// Every function guards its result with `finite()`. Input validation happens
// upstream in calculatorInput.js, but arithmetic can still overflow from
// perfectly valid inputs — compound interest at a high rate over a long term
// reaches Infinity long before either input looks unreasonable, and the old
// code passed that straight to toFixed(), rendering the literal string
// "Infinity" as a monetary result. Throwing here forces the caller to surface
// an actionable message instead.

export class CalculationError extends Error {
  constructor(message) {
    super(message);
    this.name = "CalculationError";
  }
}

// Guards a computed result against overflow and NaN. Named for what it
// asserts, so call sites read as documentation.
function finite(value, message = "That calculation is too large to compute.") {
  if (!Number.isFinite(value)) throw new CalculationError(message);
  return value;
}

export function percentageOf(x, y) {
  return finite((x / 100) * y);
}

// Throws if y is zero — the caller is responsible for surfacing that as a
// user-facing message rather than letting Infinity/NaN reach the UI.
export function whatPercent(x, y) {
  if (y === 0) throw new CalculationError("Y can't be zero.");
  return finite((x / y) * 100);
}

// Throws if x is zero, for the same reason as whatPercent.
export function percentChange(x, y) {
  if (x === 0) throw new CalculationError("X can't be zero.");
  return finite(((y - x) / x) * 100);
}

export function addGst(amount, ratePercent) {
  const gstAmount = finite((amount * ratePercent) / 100);
  return { base: amount, gstAmount, total: finite(amount + gstAmount) };
}

// `amount` is treated as GST-inclusive.
export function removeGst(amount, ratePercent) {
  // A -100% rate would divide by zero; guarded rather than returning Infinity.
  const divisor = 1 + ratePercent / 100;
  if (divisor === 0) throw new CalculationError("That GST rate isn't valid.");
  const base = finite(amount / divisor);
  return { base, gstAmount: finite(amount - base), total: amount };
}

export function simpleInterest(principal, ratePercent, years) {
  const interest = finite((principal * ratePercent * years) / 100);
  return { interest, total: finite(principal + interest) };
}

export function compoundInterest(principal, ratePercent, years, frequencyPerYear) {
  if (!(frequencyPerYear > 0)) {
    throw new CalculationError("Compounding frequency must be greater than zero.");
  }
  const total = finite(
    principal * Math.pow(1 + ratePercent / 100 / frequencyPerYear, frequencyPerYear * years)
  );
  return { interest: finite(total - principal), total };
}

/**
 * Equated Monthly Instalment for a loan.
 *
 *   EMI = P × r × (1 + r)^n / ((1 + r)^n − 1)
 *
 * where r is the *monthly* rate and n the number of months. The zero-rate case
 * has to be special-cased: at r = 0 both numerator and denominator collapse to
 * zero and the formula yields NaN, even though the answer is simply P / n.
 *
 * `schedule` is the year-by-year amortisation summary, computed by actually
 * walking the months rather than by a closed form — the closed form drifts
 * against the rounded instalments people see on a real statement.
 */
export function loanEmi(principal, annualRatePercent, years) {
  if (!(principal > 0)) throw new CalculationError("Loan amount must be greater than zero.");
  if (!(years > 0)) throw new CalculationError("Loan tenure must be greater than zero.");
  if (annualRatePercent < 0) throw new CalculationError("Interest rate can't be negative.");

  const months = Math.round(years * 12);
  if (!(months > 0)) throw new CalculationError("Loan tenure must be at least one month.");

  const monthlyRate = annualRatePercent / 100 / 12;

  let emi;
  if (monthlyRate === 0) {
    emi = principal / months;
  } else {
    const growth = Math.pow(1 + monthlyRate, months);
    emi = finite((principal * monthlyRate * growth) / (growth - 1));
  }
  finite(emi);

  const totalPayable = finite(emi * months);

  return {
    emi,
    months,
    totalPayable,
    totalInterest: finite(totalPayable - principal),
    principal,
    schedule: amortisationByYear(principal, monthlyRate, emi, months),
  };
}

// Walks the loan month by month, summarising each calendar year of the term.
// The final month's principal component is trued up against the remaining
// balance so rounding drift can't leave a few paise outstanding at the end.
function amortisationByYear(principal, monthlyRate, emi, months) {
  const rows = [];
  let balance = principal;
  let current = null;

  for (let month = 1; month <= months; month += 1) {
    const interest = balance * monthlyRate;
    let principalPaid = emi - interest;

    if (month === months || principalPaid > balance) {
      principalPaid = balance;
    }

    balance = Math.max(0, balance - principalPaid);

    const year = Math.ceil(month / 12);
    if (!current || current.year !== year) {
      current = { year, principalPaid: 0, interestPaid: 0, balance };
      rows.push(current);
    }

    current.principalPaid += principalPaid;
    current.interestPaid += interest;
    current.balance = balance;
  }

  return rows;
}
