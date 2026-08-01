import AgeCalculatorClient from "./AgeCalculatorClient";

export const metadata = {
  title: "Age Calculator — WaryTools",
  description: "Calculate exact age from a date of birth.",
};

export default function AgeCalculatorPage() {
  return (
    <section style={{ maxWidth: "600px", margin: "0 auto", padding: "48px 20px 80px" }}>
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: "var(--text)", marginBottom: "12px" }}>
        Age Calculator
      </h1>
      <p style={{ fontSize: "15px", color: "var(--text-muted)", marginBottom: "32px" }}>
        Find your exact age in years, months, and days from your date of birth.
      </p>

      <AgeCalculatorClient />
    </section>
  );
}
