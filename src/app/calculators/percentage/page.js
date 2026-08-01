import PercentageCalculatorClient from "./PercentageCalculatorClient";

export const metadata = {
  title: "Percentage Calculator — WaryTools",
  description: "Percentage of a number, percentage change, and more.",
};

export default function PercentageCalculatorPage() {
  return (
    <section style={{ maxWidth: "600px", margin: "0 auto", padding: "48px 20px 80px" }}>
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#111827", marginBottom: "12px" }}>
        Percentage Calculator
      </h1>
      <p style={{ fontSize: "15px", color: "#6b7280", marginBottom: "32px" }}>
        Percentage of a number, what percent one number is of another, or percentage change.
      </p>

      <PercentageCalculatorClient />
    </section>
  );
}
