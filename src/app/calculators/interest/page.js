import InterestCalculatorClient from "./InterestCalculatorClient";

export const metadata = {
  title: "Interest Calculator — WaryTools",
  description: "Simple interest or compound interest calculator.",
};

export default function InterestCalculatorPage() {
  return (
    <section style={{ maxWidth: "700px", margin: "0 auto", padding: "48px 20px 80px" }}>
      <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#111827", marginBottom: "12px" }}>
        Interest Calculator
      </h1>
      <p style={{ fontSize: "15px", color: "#6b7280", marginBottom: "32px" }}>
        Calculate simple or compound interest on a principal amount.
      </p>

      <InterestCalculatorClient />
    </section>
  );
}
