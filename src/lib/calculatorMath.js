// Pure calculation logic for the percentage, GST, and interest calculators,
// kept separate from the client components so it's testable without a DOM.

export function percentageOf(x, y) {
  return (x / 100) * y;
}

// Throws if y is zero — the caller is responsible for surfacing that as a
// user-facing message rather than letting Infinity/NaN reach the UI.
export function whatPercent(x, y) {
  if (y === 0) throw new Error("Y can't be zero.");
  return (x / y) * 100;
}

// Throws if x is zero, for the same reason as whatPercent.
export function percentChange(x, y) {
  if (x === 0) throw new Error("X can't be zero.");
  return ((y - x) / x) * 100;
}

export function addGst(amount, ratePercent) {
  const gstAmount = (amount * ratePercent) / 100;
  return { base: amount, gstAmount, total: amount + gstAmount };
}

// `amount` is treated as GST-inclusive.
export function removeGst(amount, ratePercent) {
  const base = amount / (1 + ratePercent / 100);
  const gstAmount = amount - base;
  return { base, gstAmount, total: amount };
}

export function simpleInterest(principal, ratePercent, years) {
  const interest = (principal * ratePercent * years) / 100;
  return { interest, total: principal + interest };
}

export function compoundInterest(principal, ratePercent, years, frequencyPerYear) {
  const total = principal * Math.pow(1 + ratePercent / 100 / frequencyPerYear, frequencyPerYear * years);
  return { interest: total - principal, total };
}
